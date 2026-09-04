import { parseIsbn } from '@/lib/isbn/isbn';
import { fetchGoogleBooksMetadata } from '@/lib/isbn/server-lookup';

export async function GET(request: Request) {
  const parsed = parseIsbn(new URL(request.url).searchParams.get('isbn') ?? '');
  if (!parsed) return Response.json({ error: 'invalid-isbn' }, { status: 400 });
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) return Response.json({ error: 'provider-not-configured' }, { status: 503 });

  try {
    const metadata = await fetchGoogleBooksMetadata(parsed.isbn13, apiKey);
    return metadata ? Response.json(metadata) : Response.json({ error: 'not-found' }, { status: 404 });
  } catch {
    return Response.json({ error: 'provider-unavailable' }, { status: 502 });
  }
}
