import { withLibraryApi } from '@/lib/persistence/server';

interface RouteContext {
  params: Promise<{ loanId: string }>;
}

export async function POST(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { loanId } = await route.params;
    return repository.markReturned(context, loanId);
  }, { mutation: true });
}
