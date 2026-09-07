import {
  assessDescription,
  descriptionLanguage,
  isFullerDescription,
} from './descriptions.ts';
import {
  resolveBookMetadata,
  type LookupProviderConfig,
} from '../isbn/server-lookup.ts';

interface Job {
  itemId: string;
  attempts: number;
}
interface Book {
  isbn13: string;
  language: string;
  description: string | null;
  descriptionEdited: number | null;
  version: number;
}

/** Durable claims survive request termination. Every write is fenced by its lease. */
export async function processDescriptionJobs(
  db: D1Database,
  config: LookupProviderConfig,
  options: {
    itemId?: string;
    now?: () => number;
    resolve?: typeof resolveBookMetadata;
  } = {},
) {
  const now = options.now ?? Date.now;
  const token = crypto.randomUUID();
  const timestamp = now();
  const claimed = await db
    .prepare(`
    UPDATE description_jobs SET status = 'running', attempts = attempts + 1,
      lease_token = ?, available_at = ?, updated_at = ?
    WHERE item_id IN (
      SELECT item_id FROM description_jobs
      WHERE status IN ('pending', 'running') AND available_at <= ?
        AND (? IS NULL OR item_id = ?)
      ORDER BY available_at LIMIT 3
    )
    RETURNING item_id AS itemId, attempts
  `)
    .bind(
      token,
      timestamp + 60_000,
      timestamp,
      timestamp,
      options.itemId ?? null,
      options.itemId ?? null,
    )
    .all<Job>();
  const outcomes = await Promise.all(
    claimed.results.map(async (job) => {
      const finish = async (outcome: string, retry = false) => {
        const status = retry
          ? job.attempts < 4
            ? 'pending'
            : 'failed'
          : 'complete';
        await db
          .prepare(`UPDATE description_jobs
        SET status = ?, outcome = ?, available_at = ?, updated_at = ?, lease_token = NULL
        WHERE item_id = ? AND lease_token = ?
      `)
          .bind(
            status,
            outcome,
            now() + Math.min(3_600_000, 60_000 * 2 ** (job.attempts - 1)),
            now(),
            job.itemId,
            token,
          )
          .run();
        return status;
      };
      try {
        // Also recover a final attempt whose worker died before recording its result.
        if (job.attempts > 4) return await finish('attempts-exhausted', true);
        const book = await db
          .prepare(`SELECT be.isbn13,
        COALESCE(json_extract(ci.metadata_overrides_json, '$.language'), be.language) AS language,
        CASE WHEN json_type(ci.metadata_overrides_json, '$.description') IS NOT NULL
          THEN json_extract(ci.metadata_overrides_json, '$.description') ELSE be.description END AS description,
        json_extract(ci.metadata_overrides_json, '$.descriptionEdited') AS descriptionEdited,
        ci.version
        FROM catalog_items ci JOIN book_editions be ON be.id = ci.edition_id
        WHERE ci.id = ? AND ci.archived_at IS NULL AND ci.status <> 'archived'
      `)
          .bind(job.itemId)
          .first<Book>();
        if (
          !book ||
          book.descriptionEdited ||
          assessDescription(book.description).quality === 'substantive'
        ) {
          return await finish('not-needed');
        }
        const result = await (options.resolve ?? resolveBookMetadata)(
          book.isbn13,
          book.language === 'ko' ? 'ko' : 'en',
          { ...config, basicOnly: false },
        );
        const candidate = result.metadata;
        const description = candidate?.description;
        const compatible =
          candidate?.isbn13 === book.isbn13 &&
          description &&
          ['ko', 'en'].includes(book.language) &&
          descriptionLanguage(description) === book.language;
        if (
          compatible &&
          isFullerDescription(book.description ?? undefined, description)
        ) {
          const provenance = {
            description: candidate.provenance.description ?? null,
            descriptionUrl: candidate.provenance.descriptionUrl ?? null,
            descriptionScope: candidate.provenance.descriptionScope ?? null,
          };
          const updated = await db
            .prepare(`UPDATE catalog_items SET
          metadata_overrides_json = json_set(COALESCE(metadata_overrides_json, '{}'),
            '$.description', ?, '$.descriptionProvenance', json(?)),
          version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND archived_at IS NULL AND status <> 'archived'
            AND COALESCE(json_extract(metadata_overrides_json, '$.descriptionEdited'), 0) = 0
            AND EXISTS (SELECT 1 FROM description_jobs WHERE item_id = ? AND lease_token = ?)
        `)
            .bind(
              description,
              JSON.stringify(provenance),
              now(),
              job.itemId,
              book.version,
              job.itemId,
              token,
            )
            .run();
          // A concurrent owner edit wins. Other copies and their overrides are untouched.
          return await finish(
            updated.meta.changes ? 'improved' : 'changed-during-retrieval',
            !updated.meta.changes,
          );
        }
        const incomplete = Object.values(result.providerStatus).some(
          (s) => s === 'failed' || s === 'partial',
        );
        return await finish(
          incomplete ? 'retrieval-incomplete' : 'no-improvement',
          incomplete,
        );
      } catch {
        // No provider URLs, credentials, or book prose in stored failure diagnostics.
        return await finish('retrieval-failed', true);
      }
    }),
  );
  return {
    claimed: claimed.results.length,
    complete: outcomes.filter((s) => s === 'complete').length,
    pending: outcomes.filter((s) => s === 'pending').length,
    failed: outcomes.filter((s) => s === 'failed').length,
  };
}
