import { env } from 'cloudflare:workers';

import {
  CoverValidationError,
  createCoverObjectKey,
  isCoverContentType,
  MAX_COVER_BYTES,
  safeOriginalFilename,
  validateCoverUpload,
} from '@/lib/storage/covers';
import { requireActiveMember, unauthorizedResponse } from '@/lib/storage/request-member';

export async function POST(request: Request) {
  const member = await requireActiveMember(request);
  if (!member) return unauthorizedResponse();

  const declaredType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!isCoverContentType(declaredType)) {
    return Response.json({ error: 'unsupported-image-type' }, { status: 415, headers: { 'cache-control': 'no-store' } });
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
    return Response.json({ error: 'cover-too-large', maxBytes: MAX_COVER_BYTES }, { status: 413, headers: { 'cache-control': 'no-store' } });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  let validated: ReturnType<typeof validateCoverUpload>;
  try {
    validated = validateCoverUpload(declaredType, bytes);
  } catch (error) {
    if (!(error instanceof CoverValidationError)) throw error;
    const status = error.code === 'file-too-large' ? 413 : error.code === 'unsupported-type' ? 415 : 400;
    return Response.json({ error: error.code, maxBytes: MAX_COVER_BYTES }, { status, headers: { 'cache-control': 'no-store' } });
  }

  const assetId = crypto.randomUUID();
  const storagePath = createCoverObjectKey(member.memberId, validated.extension);
  const originalFilename = safeOriginalFilename(request.headers.get('x-file-name'));
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

  try {
    await env.DB.prepare(
      `INSERT INTO uploaded_assets
        (id, owner_id, storage_path, content_type, byte_size, kind, created_at)
       VALUES (?, ?, ?, ?, ?, 'cover', ?)`,
    ).bind(assetId, member.memberId, storagePath, validated.contentType, validated.byteSize, Date.now()).run();
  } catch (error) {
    await env.FILES.delete(storagePath);
    console.error('cover-metadata-insert-failed', { assetId, memberId: member.memberId, error });
    return Response.json({ error: 'cover-storage-failed' }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }

  return Response.json(
    { assetId, coverUrl: `/api/covers/${assetId}`, byteSize: validated.byteSize, contentType: validated.contentType },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  );
}

