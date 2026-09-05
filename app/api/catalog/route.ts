import type { AddBookInput } from '@/lib/domain/types';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';

export async function POST(request: Request) {
  return withLibraryApi(request, async (repository, context) => {
    const input = await jsonObject(request) as unknown as AddBookInput;
    return repository.createCatalogItem(context, input);
  }, {
    mutation: true,
    status: 201,
    rateLimit: { name: 'catalog-create', limit: 50, windowMs: 24 * 60 * 60 * 1_000 },
  });
}
