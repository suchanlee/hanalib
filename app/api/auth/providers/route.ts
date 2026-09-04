export async function GET() {
  return Response.json({
    demo: process.env.AUTH_DEMO_MODE === 'true',
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: Boolean(
      process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
    ),
  }, { headers: { 'cache-control': 'private, no-store' } });
}
