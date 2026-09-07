import type { ThemaCode } from '@/lib/books/categories';
import type { CatalogItem } from '@/lib/domain/types';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function GET(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { itemId } = await route.params;
    return repository.getItemDetail(context, itemId);
  });
}

export async function PATCH(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { itemId } = await route.params;
    const body = await jsonObject(request);
    return repository.updateCatalogItem(context, itemId, {
      isYouthBook: body.isYouthBook as boolean | undefined,
      condition: body.condition as CatalogItem['condition'],
      categoryCodes: body.categoryCodes as ThemaCode[] | undefined,
      ownerNotes: typeof body.ownerNotes === 'string' ? body.ownerNotes : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      titleEn: typeof body.titleEn === 'string' || body.titleEn === null ? body.titleEn : undefined,
      authors: Array.isArray(body.authors) ? body.authors as string[] : undefined,
      authorsEn: Array.isArray(body.authorsEn) ? body.authorsEn as string[] : undefined,
      publisher: typeof body.publisher === 'string' ? body.publisher : undefined,
      publishedYear: typeof body.publishedYear === 'number' ? body.publishedYear : undefined,
      language: typeof body.language === 'string' ? body.language as CatalogItem['edition']['language'] : undefined,
      pageCount: typeof body.pageCount === 'number' || body.pageCount === null ? body.pageCount : undefined,
      description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
      descriptionProvenance: body.descriptionProvenance as Record<string, string> | undefined,
      coverAssetId: typeof body.coverAssetId === 'string' ? body.coverAssetId : undefined,
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
