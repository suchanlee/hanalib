import { parseIsbn } from '@/lib/isbn/isbn';
import { normalizeGoogleBooksResponse, type GoogleVolumesResponse } from '@/lib/isbn/server-normalizers';

export async function GET(request: Request) {
  const parsed = parseIsbn(new URL(request.url).searchParams.get('isbn') ?? '');
  if (!parsed) return Response.json({ error: 'invalid-isbn' }, { status: 400 });
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) return Response.json({ error: 'provider-not-configured' }, { status: 503 });

  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', `isbn:${parsed.isbn13}`);
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('printType', 'books');
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return Response.json({ error: 'provider-unavailable' }, { status: 502 });
  const metadata = normalizeGoogleBooksResponse(parsed.isbn13, await response.json() as GoogleVolumesResponse);
  return metadata ? Response.json(metadata) : Response.json({ error: 'not-found' }, { status: 404 });
}
