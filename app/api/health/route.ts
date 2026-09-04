import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!env.DB || !env.FILES) throw new Error('Storage bindings unavailable.');
    await env.DB.prepare('SELECT 1 AS ok').first();
    return Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
