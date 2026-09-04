import { withLibraryApi } from '@/lib/persistence/server';

export async function GET(request: Request) {
  return withLibraryApi(request, (repository, context) => repository.getBootstrap(context));
}
