const GOOGLE_BOOKS_COVER_HOSTS = new Set([
  'books.google.com',
  'books.googleusercontent.com',
]);

function kakaoOriginalBookCover(url: URL) {
  if (!url.hostname.endsWith('.kakaocdn.net') || !url.pathname.startsWith('/thumb/')) return undefined;
  const encodedSource = url.searchParams.get('fname');
  if (!encodedSource) return undefined;

  try {
    const source = new URL(encodedSource);
    if (source.hostname !== 'daumcdn.net' && !source.hostname.endsWith('.daumcdn.net')) return undefined;
    source.protocol = 'https:';
    return source.toString();
  } catch {
    return undefined;
  }
}

/**
 * Requests the largest version Google can derive from a thumbnail-only cover.
 * Google ignores the requested width when the source image is smaller, so this
 * preserves the real cover instead of switching to a higher zoom that may return
 * its "image not available" placeholder.
 */
export function highResolutionCoverUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'http:') url.protocol = 'https:';

    const kakaoOriginal = kakaoOriginalBookCover(url);
    if (kakaoOriginal) return kakaoOriginal;

    if (
      GOOGLE_BOOKS_COVER_HOSTS.has(url.hostname)
      && url.pathname.startsWith('/books/content')
      && Number(url.searchParams.get('zoom') ?? '1') <= 1
    ) {
      url.searchParams.set('w', '800');
      url.searchParams.delete('edge');
    }

    return url.toString();
  } catch {
    return rawUrl.replace(/^http:/, 'https:');
  }
}
