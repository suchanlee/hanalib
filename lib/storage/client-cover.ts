export interface UploadedCover {
  assetId: string;
  coverUrl: string;
  byteSize: number;
  contentType: string;
}

export function validCoverFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 8 * 1024 * 1024;
}

export async function uploadMemberCover(file: File, memberId: string) {
  const headers = new Headers({ 'content-type': file.type, 'x-file-name': file.name });
  if (process.env.NODE_ENV !== 'production') headers.set('x-hana-demo-member-id', memberId);
  const response = await fetch('/api/covers', {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: file,
  });
  if (!response.ok) throw new Error(`Cover upload failed (${response.status}).`);
  return await response.json() as UploadedCover;
}
