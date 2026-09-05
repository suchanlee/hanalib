import { parseIsbn } from '@/lib/isbn/isbn';
import { fixtureLookupAllowed, resolveBookMetadata } from '@/lib/isbn/server-lookup';
import { operationalLog, requestLogContext, requestLogFields, withRequestId } from '@/lib/observability/log';
import { requireActiveMember, unauthorizedResponse } from '@/lib/storage/request-member';

export async function GET(request: Request) {
  const logContext = requestLogContext(request);
  const respond = (response: Response) => withRequestId(response, logContext);
  const member = await requireActiveMember(request);
  if (!member) return respond(unauthorizedResponse());
  const search = new URL(request.url).searchParams;
  const parsed = parseIsbn(search.get('isbn') ?? '');
  if (!parsed) return respond(Response.json({ error: 'invalid-isbn' }, { status: 400, headers: { 'cache-control': 'no-store' } }));
  const locale = search.get('locale') === 'en' ? 'en' : 'ko';
  const allowFixture = fixtureLookupAllowed(search.get('fixture') === '1');
  const result = await resolveBookMetadata(
    parsed.isbn13,
    locale,
    {
      nlkApiKey: process.env.NLK_API_KEY,
      naverClientId: process.env.NAVER_CLIENT_ID,
      naverClientSecret: process.env.NAVER_CLIENT_SECRET,
      googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
      timeoutMs: 8_000,
    },
    { allowFixture },
  );
  const diagnostics = Object.entries(result.providerStatus).map(([id, status]) => `${id}:${status}`).join(',');
  const headers = {
    'cache-control': result.usedFixture ? 'no-store' : 'private, max-age=3600',
    'x-hana-provider-status': diagnostics,
    'x-hana-used-fixture': String(result.usedFixture),
  };
  if (result.metadata) return respond(Response.json(result.metadata, { headers }));

  const statuses = Object.values(result.providerStatus);
  const providerStatus = Object.entries(result.providerStatus)
    .map(([provider, status]) => `${provider}.${status}`)
    .join(':');
  const errorHeaders = { ...headers, 'cache-control': 'no-store' };
  if (statuses.every((status) => status === 'not-configured')) {
    operationalLog('error', 'book-metadata-lookup-failed', requestLogFields(logContext, 503, {
      operation: 'book-metadata-lookup',
      errorCode: 'provider-not-configured',
      providerStatus,
    }));
    return respond(Response.json({ error: 'provider-not-configured', providerStatus: result.providerStatus }, { status: 503, headers: errorHeaders }));
  }
  if (statuses.some((status) => status === 'failed')) {
    operationalLog('warn', 'book-metadata-lookup-failed', requestLogFields(logContext, 502, {
      operation: 'book-metadata-lookup',
      errorCode: 'providers-unavailable',
      providerStatus,
    }));
    return respond(Response.json({ error: 'providers-unavailable', providerStatus: result.providerStatus }, { status: 502, headers: errorHeaders }));
  }
  return respond(Response.json({ error: 'not-found', providerStatus: result.providerStatus }, { status: 404, headers: errorHeaders }));
}
