export async function GET() {
  return Response.json({
    demo: process.env.AUTH_DEMO_MODE === 'true',
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    kakao: Boolean(process.env.KAKAO_REST_API_KEY && process.env.KAKAO_CLIENT_SECRET),
  }, { headers: { 'cache-control': 'private, no-store' } });
}
