import { parseIsbn } from '@/lib/isbn/isbn';
import { fetchNlkMetadata } from '@/lib/isbn/server-lookup';
import { requireActiveMember, unauthorizedResponse } from '@/lib/storage/request-member';

export async function GET(request: Request) {
  const member = await requireActiveMember(request);
  if (!member) return unauthorizedResponse();
  const parsed = parseIsbn(new URL(request.url).searchParams.get('isbn') ?? '');
  if (!parsed) return Response.json({ error: 'invalid-isbn' }, { status: 400 });
  const apiKey = process.env.NLK_API_KEY;
  if (!apiKey) return Response.json({ error: 'provider-not-configured' }, { status: 503 });

  try {
    const metadata = await fetchNlkMetadata(parsed.isbn13, apiKey);
    return metadata ? Response.json(metadata) : Response.json({ error: 'not-found' }, { status: 404 });
  } catch {
    return Response.json({ error: 'provider-unavailable' }, { status: 502 });
  }
}
