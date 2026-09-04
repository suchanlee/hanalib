import { jsonObject, withLibraryApi } from '@/lib/persistence/server';
import { libraryError } from '@/lib/persistence/errors';

export async function POST(request: Request) {
  return withLibraryApi(request, async (repository, context) => {
    const body = await jsonObject(request);
    if (typeof body.itemId !== 'string' || !body.itemId) throw libraryError('invalid-input', 'itemId is required.');
    return repository.createBorrowRequest(context, body.itemId);
  }, { mutation: true, status: 201 });
}
