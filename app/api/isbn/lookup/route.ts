import { parseIsbn } from '@/lib/isbn/isbn';
import { fixtureLookupAllowed, resolveBookMetadata } from '@/lib/isbn/server-lookup';

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const parsed = parseIsbn(search.get('isbn') ?? '');
  if (!parsed) return Response.json({ error: 'invalid-isbn' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  const locale = search.get('locale') === 'en' ? 'en' : 'ko';
  const allowFixture = fixtureLookupAllowed(search.get('fixture') === '1');
  const result = await resolveBookMetadata(
    parsed.isbn13,
    locale,
    {
      nlkApiKey: process.env.NLK_API_KEY,
      googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
      timeoutMs: 5_000,
    },
    { allowFixture },
  );
  const diagnostics = Object.entries(result.providerStatus).map(([id, status]) => `${id}:${status}`).join(',');
  const headers = {
    'cache-control': result.usedFixture ? 'no-store' : 'private, max-age=3600',
    'x-hana-provider-status': diagnostics,
    'x-hana-used-fixture': String(result.usedFixture),
  };
  if (result.metadata) return Response.json(result.metadata, { headers });

  const statuses = Object.values(result.providerStatus);
  if (statuses.every((status) => status === 'not-configured')) {
    return Response.json({ error: 'provider-not-configured' }, { status: 503, headers });
  }
  if (statuses.some((status) => status === 'failed')) {
    return Response.json({ error: 'providers-unavailable' }, { status: 502, headers });
  }
  return Response.json({ error: 'not-found' }, { status: 404, headers });
}
