import { jsonObject, withLibraryApi } from '@/lib/persistence/server';
import { libraryError } from '@/lib/persistence/errors';

interface RouteContext {
  params: Promise<{ checkId: string }>;
}

export async function POST(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { checkId } = await route.params;
    const body = await jsonObject(request);
    if (typeof body.returned !== 'boolean') {
      throw libraryError('invalid-input', 'returned must be a boolean.');
    }
    return repository.respondToReturnCheck(context, checkId, body.returned);
  }, { dispatchNotifications: true, mutation: true });
}
