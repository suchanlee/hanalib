import { env } from 'cloudflare:workers';

import { requireActiveMember, unauthorizedResponse } from '@/lib/storage/request-member';

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const member = await requireActiveMember(request);
  if (!member) return unauthorizedResponse();
  const { assetId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return Response.json({ error: 'cover-not-found' }, { status: 404 });

  const asset = await env.DB.prepare(
    `SELECT storage_path, content_type, byte_size
       FROM uploaded_assets
      WHERE id = ? AND kind = 'cover'
      LIMIT 1`,
  ).bind(assetId).first<{ storage_path: string; content_type: string; byte_size: number }>();
  if (!asset) return Response.json({ error: 'cover-not-found' }, { status: 404 });

  const object = await env.FILES.get(asset.storage_path);
  if (!object) return Response.json({ error: 'cover-not-found' }, { status: 404 });
  if (request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers: { etag: object.httpEtag, 'cache-control': 'private, max-age=86400, immutable' } });
  }

  return new Response(object.body, {
    headers: {
      'cache-control': 'private, max-age=86400, immutable',
      'content-length': String(asset.byte_size),
      'content-type': asset.content_type,
      etag: object.httpEtag,
      'x-content-type-options': 'nosniff',
    },
  });
}
