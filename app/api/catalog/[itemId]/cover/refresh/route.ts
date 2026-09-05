import { resolveBookMetadata } from '@/lib/isbn/server-lookup';
import { libraryError } from '@/lib/persistence/errors';
import { withLibraryApi } from '@/lib/persistence/server';

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function POST(request: Request, route: RouteContext) {
  return withLibraryApi(request, async (repository, context) => {
    const { itemId } = await route.params;
    const item = (await repository.listCatalog(context)).find((candidate) => candidate.id === itemId);
    if (!item || item.ownerId !== context.actorId) {
      throw libraryError('not-found', 'Only the owner can refresh an active listing cover.');
    }

    const hasKoreanText = /[\uac00-\ud7a3]/.test(`${item.edition.title} ${item.edition.authors.join(' ')}`);
    const locale = item.edition.language === 'ko' || hasKoreanText ? 'ko' : 'en';
    const result = await resolveBookMetadata(item.edition.isbn13, locale, {
      nlkApiKey: process.env.NLK_API_KEY,
      naverClientId: process.env.NAVER_CLIENT_ID,
      naverClientSecret: process.env.NAVER_CLIENT_SECRET,
      kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
      googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
      timeoutMs: 8_000,
    });
    if (!result.metadata?.coverUrl) {
      throw libraryError('not-found', 'No online cover was found for this ISBN.');
    }

    return repository.refreshCatalogItemCover(
      context,
      itemId,
      result.metadata.coverUrl,
      result.metadata.provenance.coverUrl ?? 'provider',
    );
  }, {
    mutation: true,
    rateLimit: { name: 'cover-refresh', limit: 30, windowMs: 24 * 60 * 60 * 1_000 },
  });
}
