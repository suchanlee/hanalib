import { env } from 'cloudflare:workers';

import {
  CoverValidationError,
  createCoverObjectKey,
  isCoverContentType,
  MAX_COVER_BYTES,
  readBytesWithLimit,
  safeOriginalFilename,
  validateCoverUpload,
} from '@/lib/storage/covers';
import { operationalLog, requestLogContext, requestLogFields, safeErrorCode, withRequestId } from '@/lib/observability/log';
import { requireActiveMember, unauthorizedResponse } from '@/lib/storage/request-member';

export async function POST(request: Request) {
  const logContext = requestLogContext(request);
  const respond = (response: Response) => withRequestId(response, logContext);
  let member;
  try {
    member = await requireActiveMember(request);
  } catch (error) {
    operationalLog('error', 'cover-storage-failed', requestLogFields(logContext, 503, {
      operation: 'member-lookup',
      errorCode: safeErrorCode(error, 'database-read-failed'),
    }));
    return respond(Response.json({ error: 'cover-storage-failed' }, { status: 503, headers: { 'cache-control': 'no-store' } }));
  }
  if (!member) return respond(unauthorizedResponse());
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return respond(Response.json({ error: 'cross-origin-upload-rejected' }, { status: 403, headers: { 'cache-control': 'no-store' } }));
  }

  const declaredType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!isCoverContentType(declaredType)) {
    return respond(Response.json({ error: 'unsupported-image-type' }, { status: 415, headers: { 'cache-control': 'no-store' } }));
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
    return respond(Response.json({ error: 'cover-too-large', maxBytes: MAX_COVER_BYTES }, { status: 413, headers: { 'cache-control': 'no-store' } }));
  }

  let bytes: Uint8Array;
  let validated: ReturnType<typeof validateCoverUpload>;
  try {
    bytes = await readBytesWithLimit(request.body);
    validated = validateCoverUpload(declaredType, bytes);
  } catch (error) {
    if (!(error instanceof CoverValidationError)) throw error;
    const status = error.code === 'file-too-large' ? 413 : error.code === 'unsupported-type' ? 415 : 400;
    return respond(Response.json({ error: error.code, maxBytes: MAX_COVER_BYTES }, { status, headers: { 'cache-control': 'no-store' } }));
  }

  const assetId = crypto.randomUUID();
  const storagePath = createCoverObjectKey(member.memberId, validated.extension);
  const originalFilename = safeOriginalFilename(request.headers.get('x-file-name'));
  try {
    await env.FILES.put(storagePath, bytes, {
      httpMetadata: {
        contentType: validated.contentType,
        cacheControl: 'private, max-age=86400, immutable',
      },
      customMetadata: {
        ownerId: member.memberId,
        assetId,
        ...(originalFilename ? { originalFilename } : {}),
      },
    });
  } catch (error) {
    operationalLog('error', 'cover-storage-failed', requestLogFields(logContext, 503, {
      operation: 'cover-object-write',
      errorCode: safeErrorCode(error, 'object-write-failed'),
    }));
    return respond(Response.json({ error: 'cover-storage-failed' }, { status: 503, headers: { 'cache-control': 'no-store' } }));
  }

  try {
    await env.DB.prepare(
      `INSERT INTO uploaded_assets
        (id, owner_id, storage_path, content_type, byte_size, kind, created_at)
       VALUES (?, ?, ?, ?, ?, 'cover', ?)`,
    ).bind(assetId, member.memberId, storagePath, validated.contentType, validated.byteSize, Date.now()).run();
  } catch (error) {
    try {
      await env.FILES.delete(storagePath);
    } catch (cleanupError) {
      operationalLog('warn', 'cover-cleanup-failed', requestLogFields(logContext, 500, {
        operation: 'cover-object-cleanup',
        errorCode: safeErrorCode(cleanupError, 'object-delete-failed'),
      }));
    }
    operationalLog('error', 'cover-storage-failed', requestLogFields(logContext, 500, {
      operation: 'cover-metadata-write',
      errorCode: safeErrorCode(error, 'metadata-write-failed'),
    }));
    return respond(Response.json({ error: 'cover-storage-failed' }, { status: 500, headers: { 'cache-control': 'no-store' } }));
  }

  return respond(Response.json(
    { assetId, coverUrl: `/api/covers/${assetId}`, byteSize: validated.byteSize, contentType: validated.contentType },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  ));
}
