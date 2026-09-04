import { jsonObject, withLibraryApi } from '@/lib/persistence/server';
import { libraryError } from '@/lib/persistence/errors';

interface RouteContext {
  params: Promise<{ requestId: string }>;
}

export async function PATCH(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { requestId } = await route.params;
    const body = await jsonObject(request);
    if (body.decision !== 'accepted' && body.decision !== 'declined') {
      throw libraryError('invalid-input', 'decision must be accepted or declined.');
    }
    return repository.respondToBorrowRequest(context, requestId, body.decision);
  }, { mutation: true });
}

export async function DELETE(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { requestId } = await route.params;
    return repository.cancelBorrowRequest(context, requestId);
  }, { mutation: true });
}
