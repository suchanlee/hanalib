import type { CatalogItem } from '@/lib/domain/types';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function PATCH(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { itemId } = await route.params;
    const body = await jsonObject(request);
    return repository.updateCatalogItem(context, itemId, {
      condition: body.condition as CatalogItem['condition'],
      ownerNotes: typeof body.ownerNotes === 'string' ? body.ownerNotes : undefined,
    });
  }, { mutation: true });
}

export async function DELETE(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { itemId } = await route.params;
    await repository.archiveCatalogItem(context, itemId);
    return { id: itemId, archived: true };
  }, { mutation: true });
}
