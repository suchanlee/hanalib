import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  assessDescription,
  descriptionImprovement,
} from '../lib/books/descriptions.ts';
import {
  resolveBookMetadata,
  type FetchLike,
} from '../lib/isbn/server-lookup.ts';
import {
  stitchMetadata,
  type MetadataCandidate,
  type MetadataSource,
} from '../lib/isbn/providers.ts';

/** Replay the same selection and refresh decisions used by the application.
 * Inputs/outputs are book metadata only; this script never writes to a database. */
export function compareCatalogDescription(
  current: MetadataCandidate,
  candidates: MetadataCandidate[],
) {
  const language =
    candidates.find((c) => c.source === 'open-library')?.language ??
    current.language ??
    'en';
  const metadata = stitchMetadata(
    current.isbn13,
    language === 'ko' ? 'ko' : 'en',
    [...candidates, { ...current, language }],
  );
  const decision = descriptionImprovement(
    current.description,
    metadata.description,
  );
  const before = assessDescription(current.description);
  const after = assessDescription(
    decision.eligible ? metadata.description : current.description,
  );
  return { before, after, decision, metadata };
}

async function main() {
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes('--snapshot') || !process.argv.includes('--out'))
    throw new Error(
      'Use --snapshot book-only-snapshot.json --out report.json [--cache responses.json] [--offline]',
    );
  const snapshot = JSON.parse(readFileSync(arg('--snapshot'), 'utf8')) as {
    books: Array<{
      id: string;
      isbn13: string;
      title: string;
      language: 'ko' | 'en' | 'other';
      description?: string | null;
      field_provenance_json: string;
    }>;
    copies: Array<{
      edition_id: string;
      status: string;
      archived_at: number | null;
      metadata_overrides_json: string | null;
    }>;
  };
  const cachePath = process.argv.includes('--cache')
    ? arg('--cache')
    : undefined;
  const cache: Record<string, { status: number; body: string }> =
    cachePath && existsSync(cachePath)
      ? JSON.parse(readFileSync(cachePath, 'utf8'))
      : {};
  let queue = Promise.resolve();
  let requests = 0;
  const cacheMisses = new Set<string>();
  const offline = process.argv.includes('--offline');
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const safeUrl = new URL(url);
    for (const key of ['key', 'ttbkey', 'cert_key'])
      safeUrl.searchParams.delete(key);
    const key = safeUrl.toString();
    if (cache[key])
      return new Response(cache[key].body, { status: cache[key].status });
    if (offline) {
      cacheMisses.add(key);
      throw new Error('Response not present in offline cache');
    }
    // Bound request rate across authors, works, searches, and editions.
    const ready = queue;
    queue = ready.then(
      () => new Promise<void>((resolve) => setTimeout(resolve, 400)),
    );
    await ready;
    requests++;
    const response = await fetch(url, init);
    const body = await response.text();
    if (response.ok || response.status === 404) {
      cache[key] = { status: response.status, body };
      if (cachePath) writeFileSync(cachePath, JSON.stringify(cache));
    }
    return new Response(body, { status: response.status });
  };
  const config = {
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
    kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
    aladinTtbKey: process.env.ALADIN_TTB_KEY,
    nlkApiKey: process.env.NLK_API_KEY,
    naverClientId: process.env.NAVER_CLIENT_ID,
    naverClientSecret: process.env.NAVER_CLIENT_SECRET,
    timeoutMs: 15_000,
  };
  const rows = [];
  const active = snapshot.copies.filter(
    (c) => c.status !== 'archived' && c.archived_at === null,
  );
  for (const copy of active) {
    const edition = snapshot.books.find((b) => b.id === copy.edition_id);
    if (!edition) throw new Error('Snapshot missing a referenced edition');
    const override =
      copy.metadata_overrides_json === null
        ? undefined
        : JSON.parse(copy.metadata_overrides_json);
    const currentText = override ? override.description : edition.description;
    if (currentText?.includes('[truncated for model]'))
      throw new Error(
        'Snapshot transport-truncated: fetch the complete value first',
      );
    const provenance = {
      ...JSON.parse(edition.field_provenance_json),
      ...override?.descriptionProvenance,
    } as Record<string, string>;
    const allowed = [
      'nlk',
      'naver',
      'kakao-books',
      'google-books',
      'open-library',
      'aladin',
    ];
    const current: MetadataCandidate = {
      isbn13: edition.isbn13,
      title: override?.title ?? edition.title,
      language: override?.language ?? edition.language,
      description: currentText ?? undefined,
      source: allowed.includes(provenance.description)
        ? (provenance.description as MetadataSource)
        : 'member',
    };
    const live = await resolveBookMetadata(
      edition.isbn13,
      current.language === 'ko' ? 'ko' : 'en',
      config,
      { fetchImpl },
    );
    const candidates: MetadataCandidate[] = live.metadata
      ? [
          {
            ...live.metadata,
            source: (live.metadata.provenance.description ??
              live.metadata.provenance.title) as MetadataSource,
            descriptionScope: live.metadata.provenance.descriptionScope as
              | 'edition'
              | 'work'
              | undefined,
            descriptionSourceUrl: live.metadata.provenance.descriptionUrl,
          },
        ]
      : [];
    const result = compareCatalogDescription(current, candidates);
    rows.push({
      isbn13: current.isbn13,
      title: current.title,
      currentDescription: current.description ?? null,
      beforeQuality: result.before.quality,
      afterQuality: result.after.quality,
      improvement: result.decision.eligible,
      reason: result.decision.reason,
      proposedDescription: result.decision.eligible
        ? result.metadata.description
        : null,
      proposedProvenance: result.decision.eligible
        ? result.metadata.provenance
        : null,
      providerStatus: live.providerStatus,
      diagnostics: live.diagnostics,
    });
    const report = {
      checkedAt: new Date().toISOString(),
      complete: rows.length === active.length && cacheMisses.size === 0,
      cacheMisses: [...cacheMisses],
      total: active.length,
      sourceCoverage: {
        liveGoogleBooks: Boolean(config.googleBooksApiKey),
        liveKakaoBooks: Boolean(config.kakaoRestApiKey),
        liveOpenLibrary: !offline,
        storedProviderDescriptions: true,
        offlineReplay: offline,
      },
      requests,
      improvements: rows.filter((r) => r.improvement).length,
      unresolved: rows.filter((r) =>
        ['missing', 'note', 'snippet', 'invalid'].includes(r.afterQuality),
      ).length,
      rows,
    };
    writeFileSync(arg('--out'), JSON.stringify(report, null, 2));
    console.log(
      `${rows.length}/${active.length} ${current.isbn13}: ${result.before.quality} -> ${result.after.quality}${result.decision.eligible ? ' (improved)' : ''}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
