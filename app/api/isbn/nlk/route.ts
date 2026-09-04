import { parseIsbn } from '@/lib/isbn/isbn';
import { normalizeNlkResponse } from '@/lib/isbn/server-normalizers';

export async function GET(request: Request) {
  const parsed = parseIsbn(new URL(request.url).searchParams.get('isbn') ?? '');
  if (!parsed) return Response.json({ error: 'invalid-isbn' }, { status: 400 });
  const apiKey = process.env.NLK_API_KEY;
  if (!apiKey) return Response.json({ error: 'provider-not-configured' }, { status: 503 });

  const url = new URL('https://www.nl.go.kr/seoji/SearchApi.do');
  url.searchParams.set('cert_key', apiKey);
  url.searchParams.set('result_style', 'json');
  url.searchParams.set('page_no', '1');
  url.searchParams.set('page_size', '10');
  url.searchParams.set('isbn', parsed.isbn13);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return Response.json({ error: 'provider-unavailable' }, { status: 502 });
  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return Response.json({ error: 'invalid-provider-response' }, { status: 502 });
  const metadata = normalizeNlkResponse(parsed.isbn13, payload as Record<string, unknown>);
  return metadata ? Response.json(metadata) : Response.json({ error: 'not-found' }, { status: 404 });
}
