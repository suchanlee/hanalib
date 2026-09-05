import { env } from 'cloudflare:workers';

import { requireActiveMember, unauthorizedResponse } from '@/lib/storage/request-member';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const logContext = requestLogContext(request);
  const respond = (response: Response) => withRequestId(response, logContext);
  const member = await requireActiveMember(request);
  if (!member) return respond(unauthorizedResponse());
  const { assetId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return respond(Response.json({ error: 'cover-not-found' }, { status: 404 }));

  try {
    const asset = await env.DB.prepare(
      `SELECT storage_path, content_type, byte_size
         FROM uploaded_assets
        WHERE id = ? AND kind = 'cover'
        LIMIT 1`,
    ).bind(assetId).first<{ storage_path: string; content_type: string; byte_size: number }>();
    if (!asset) return respond(Response.json({ error: 'cover-not-found' }, { status: 404 }));

    const object = await env.FILES.get(asset.storage_path);
    if (!object) return respond(Response.json({ error: 'cover-not-found' }, { status: 404 }));
    if (request.headers.get('if-none-match') === object.httpEtag) {
      return respond(new Response(null, { status: 304, headers: { etag: object.httpEtag, 'cache-control': 'private, max-age=86400, immutable' } }));
    }

    return respond(new Response(object.body, {
      headers: {
        'cache-control': 'private, max-age=86400, immutable',
        'content-length': String(asset.byte_size),
        'content-type': asset.content_type,
        etag: object.httpEtag,
        'x-content-type-options': 'nosniff',
      },
    }));
  } catch (error) {
    operationalLog('error', 'cover-read-failed', requestLogFields(logContext, 503, {
      operation: 'cover-read',
      errorCode: safeErrorCode(error, 'storage-read-failed'),
    }));
    return respond(Response.json({ error: 'cover-unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } }));
  }
}
