import { parseIsbn } from '@/lib/isbn/isbn';
import { getD1Database } from '@/db';
import {
  fixtureLookupAllowed,
  resolveBookMetadata,
} from '@/lib/isbn/server-lookup';
import {
  operationalLog,
  requestLogContext,
  requestLogFields,
  safeErrorCode,
  withRequestId,
} from '@/lib/observability/log';
import { LibraryError } from '@/lib/persistence/errors';
import { enforceRateLimit } from '@/lib/persistence/rate-limit';
import {
  requireActiveMember,
  unauthorizedResponse,
} from '@/lib/storage/request-member';
import { isFullerDescription } from '@/lib/books/descriptions';

export async function GET(request: Request) {
  const startedAt = Date.now();
  const logContext = requestLogContext(request);
  const respond = (response: Response) => withRequestId(response, logContext);
  let member;
  try {
    member = await requireActiveMember(request);
  } catch (error) {
    operationalLog(
      'error',
      'book-metadata-lookup-failed',
      requestLogFields(logContext, 503, {
        operation: 'member-lookup',
        errorCode: safeErrorCode(error, 'database-read-failed'),
      }),
    );
    return respond(
      Response.json(
        { error: 'service-unavailable' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      ),
    );
  }
  if (!member) return respond(unauthorizedResponse());
  try {
    await enforceRateLimit(getD1Database(), member.memberId, {
      name: 'isbn-lookup',
      limit: 60,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof LibraryError) {
      return respond(
        Response.json(
          { error: error.code },
          { status: error.status, headers: { 'cache-control': 'no-store' } },
        ),
      );
    }
    operationalLog(
      'error',
      'book-metadata-lookup-failed',
      requestLogFields(logContext, 503, {
        operation: 'rate-limit',
        errorCode: safeErrorCode(error, 'database-read-failed'),
      }),
    );
    return respond(
      Response.json(
        { error: 'service-unavailable' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      ),
    );
  }
  const search = new URL(request.url).searchParams;
  const parsed = parseIsbn(search.get('isbn') ?? '');
  if (!parsed)
    return respond(
      Response.json(
        { error: 'invalid-isbn' },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      ),
    );
  const basicOnly = search.get('mode') !== 'enrich';
  const locale = search.get('locale') === 'en' ? 'en' : 'ko';
  const allowFixture = fixtureLookupAllowed(search.get('fixture') === '1');
  let result;
  try {
    result = await resolveBookMetadata(
      parsed.isbn13,
      locale,
      {
        aladinTtbKey: process.env.ALADIN_TTB_KEY,
        nlkApiKey: process.env.NLK_API_KEY,
        naverClientId: process.env.NAVER_CLIENT_ID,
        naverClientSecret: process.env.NAVER_CLIENT_SECRET,
        kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
        googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
        timeoutMs: basicOnly
          ? Math.max(1, 1_500 - (Date.now() - startedAt))
          : 8_000,
        basicOnly,
      },
      { allowFixture },
    );
  } catch (error) {
    operationalLog(
      'error',
      'book-metadata-lookup-failed',
      requestLogFields(logContext, 500, {
        operation: 'book-metadata-lookup',
        errorCode: safeErrorCode(error, 'resolver-failed'),
      }),
    );
    return respond(
      Response.json(
        { error: 'resolver-unavailable' },
        { status: 500, headers: { 'cache-control': 'no-store' } },
      ),
    );
  }
  // Reuse a previously repaired/imported full description instead of regressing
  // to a shorter provider snippet when another copy of this ISBN is scanned.
  if (result.metadata) {
    try {
      const storedLookup = getD1Database()
        .prepare(`
        SELECT be.description, json_extract(be.field_provenance_json, '$.description') AS source,
          json_extract(be.field_provenance_json, '$.descriptionUrl') AS url,
          json_extract(be.field_provenance_json, '$.descriptionScope') AS scope
        FROM book_editions be WHERE be.isbn13 = ?
        AND EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.edition_id = be.id
          AND ci.community_id = ? AND ci.archived_at IS NULL AND ci.status <> 'archived')
      `)
        .bind(parsed.isbn13, member.communityId)
        .first<{
          description: string | null;
          source: string | null;
          url: string | null;
          scope: string | null;
        }>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stored = await (
        basicOnly
          ? Promise.race([
              storedLookup,
              new Promise<null>((resolve) => {
                timer = setTimeout(
                  () => resolve(null),
                  Math.max(1, 1_700 - (Date.now() - startedAt)),
                );
              }),
            ])
          : storedLookup
      ).finally(() => {
        if (timer) clearTimeout(timer);
      });
      if (
        stored?.source &&
        stored.source !== 'member' &&
        isFullerDescription(
          result.metadata.description,
          stored.description ?? undefined,
        )
      ) {
        result.metadata.description = stored.description!;
        result.metadata.provenance.description = stored.source;
        delete result.metadata.provenance.descriptionUrl;
        delete result.metadata.provenance.descriptionScope;
        if (stored.url) result.metadata.provenance.descriptionUrl = stored.url;
        if (stored.scope)
          result.metadata.provenance.descriptionScope = stored.scope;
      }
    } catch (error) {
      operationalLog(
        'warn',
        'book-metadata-lookup-failed',
        requestLogFields(logContext, 200, {
          operation: 'stored-description',
          errorCode: safeErrorCode(error, 'database-read-failed'),
        }),
      );
    }
  }
  const diagnostics = Object.entries(result.providerStatus)
    .map(([id, status]) => `${id}:${status}`)
    .join(',');
  const headers = {
    'cache-control': result.usedFixture ? 'no-store' : 'private, max-age=3600',
    'x-hana-provider-status': diagnostics,
    'x-hana-used-fixture': String(result.usedFixture),
    'x-hana-retrieval-diagnostics': JSON.stringify(
      (result.diagnostics ?? [])
        .filter(
          (event) =>
            event.outcome !== 'ok' || event.stage === 'description-selection',
        )
        .slice(0, 24),
    ),
  };
  if (result.metadata)
    return respond(Response.json(result.metadata, { headers }));

  const statuses = Object.values(result.providerStatus);
  const providerStatus = Object.entries(result.providerStatus)
    .map(([provider, status]) => `${provider}.${status}`)
    .join(':');
  const errorHeaders = { ...headers, 'cache-control': 'no-store' };
  if (statuses.every((status) => status === 'not-configured')) {
    operationalLog(
      'error',
      'book-metadata-lookup-failed',
      requestLogFields(logContext, 503, {
        operation: 'book-metadata-lookup',
        errorCode: 'provider-not-configured',
        providerStatus,
      }),
    );
    return respond(
      Response.json(
        {
          error: 'provider-not-configured',
          providerStatus: result.providerStatus,
        },
        { status: 503, headers: errorHeaders },
      ),
    );
  }
  if (statuses.some((status) => status === 'failed')) {
    operationalLog(
      'warn',
      'book-metadata-lookup-failed',
      requestLogFields(logContext, 502, {
        operation: 'book-metadata-lookup',
        errorCode: 'providers-unavailable',
        providerStatus,
      }),
    );
    return respond(
      Response.json(
        {
          error: 'providers-unavailable',
          providerStatus: result.providerStatus,
        },
        { status: 502, headers: errorHeaders },
      ),
    );
  }
  return respond(
    Response.json(
      { error: 'not-found', providerStatus: result.providerStatus },
      { status: 404, headers: errorHeaders },
    ),
  );
}
