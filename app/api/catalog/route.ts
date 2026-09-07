import { waitUntil } from 'cloudflare:workers';
import { getD1Database } from '@/db';
import { processDescriptionJobs } from '@/lib/books/description-jobs';
import { lookupProviderConfig } from '@/lib/isbn/config';
import { operationalLog } from '@/lib/observability/log';
import type { AddBookInput } from '@/lib/domain/types';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';

export async function POST(request: Request) {
  return withLibraryApi(
    request,
    async (repository, context) => {
      const input = (await jsonObject(request)) as unknown as AddBookInput;
      const item = await repository.createCatalogItem(context, input);
      waitUntil(
        processDescriptionJobs(getD1Database(), lookupProviderConfig(), {
          itemId: item.id,
        }).catch(() => {
          operationalLog('error', 'description-job-failed', {
            operation: 'description-hydration',
            errorCode: 'dispatch-failed',
          });
        }),
      );
      return item;
    },
    {
      mutation: true,
      status: 201,
      rateLimit: {
        name: 'catalog-create',
        limit: 50,
        windowMs: 24 * 60 * 60 * 1_000,
      },
    },
  );
}
