import { withLibraryApi } from '@/lib/persistence/server';

interface RouteContext {
  params: Promise<{ holdId: string }>;
}

export async function POST(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { holdId } = await route.params;
    return repository.claimHold(context, holdId);
  }, { dispatchNotifications: true, mutation: true });
}
