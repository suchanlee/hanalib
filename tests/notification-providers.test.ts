import assert from 'node:assert/strict';
import test from 'node:test';
import { sendNotification } from '../lib/notifications/sender.ts';
import { parseKakaoCredential, refreshKakaoCredential, sendKakaoSelfMessage } from '../lib/notifications/kakao.ts';
import { computeTwilioSignature, verifyTwilioSignature } from '../lib/notifications/twilio-signature.ts';

void test('email and SMS deliveries use provider APIs without leaking message content into results', async () => {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Response.json(request.url.includes('resend') ? { id: 'email-1' } : { sid: 'sms-1' });
  };
  const result = await sendNotification(
    {
      resendApiKey: 'resend-secret',
      emailFrom: 'library@example.com',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'twilio-secret',
      twilioFromNumber: '+14155550000',
    },
    { channel: 'both', email: 'reader@example.com', phone: '+14155550123' },
    { subject: 'A request', text: 'Reply 1 or 2' },
    fetcher,
  );

  assert.deepEqual(result, [
    { channel: 'email', providerMessageId: 'email-1' },
    { channel: 'sms', providerMessageId: 'sms-1' },
  ]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.get('authorization'), 'Bearer resend-secret');
  assert.match(await requests[1].text(), /Body=Reply\+1\+or\+2/);
});

void test('Twilio signatures are deterministic and reject tampering', async () => {
  const input = {
    authToken: 'token',
    publicUrl: 'https://library.example.com/api/webhooks/twilio/inbound',
    formValues: { From: '+14155550123', Body: '1', MessageSid: 'SM123' },
  };
  const signature = await computeTwilioSignature(input.authToken, input.publicUrl, input.formValues);
  assert.equal(await verifyTwilioSignature({ ...input, signature }), true);
  assert.equal(await verifyTwilioSignature({ ...input, signature: `${signature}x` }), false);
});

void test('Kakao self messages use a cover card that deep-links to the exact book', async () => {
  let request: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ result_code: 0 });
  };
  const result = await sendKakaoSelfMessage(
    'kakao-access-token',
    'https://library.example',
    {
      subject: '대여 요청',
      text: '새로운 대여 요청이 있어요.',
      primaryUrl: 'https://library.example/?book=item-1',
      imageUrl: 'https://covers.example/book.jpg',
      actions: [{ label: '요청 확인', url: 'https://library.example/borrowing?request=one' }],
    },
    fetcher,
  );
  assert.equal(result.channel, 'kakao');
  assert.ok(request);
  assert.equal(request.headers.get('authorization'), 'Bearer kakao-access-token');
  const form = new URLSearchParams(await request.text());
  const template = JSON.parse(String(form.get('template_object'))) as Record<string, unknown>;
  assert.equal(template.object_type, 'feed');
  assert.equal((template.content as { image_url: string }).image_url, 'https://covers.example/book.jpg');
  assert.match(JSON.stringify(template), /https:\/\/library\.example\/\?book=item-1/u);
  assert.match(JSON.stringify(template), /https:\/\/library\.example\/borrowing\?request=one/u);

  await assert.rejects(sendKakaoSelfMessage(
    'kakao-access-token',
    'https://library.example',
    { subject: 'unsafe', text: 'unsafe', actions: [{ label: 'Open', url: 'https://attacker.example/' }] },
    fetcher,
  ), /invalid-kakao-message-action/u);
});

void test('Kakao text fallback still deep-links and does not expose private cover paths', async () => {
  let request: Request | undefined;
  await sendKakaoSelfMessage(
    'kakao-access-token',
    'https://library.example',
    {
      subject: '대여 요청',
      text: '새로운 대여 요청이 있어요.',
      primaryUrl: 'https://library.example/?book=item-2',
      imageUrl: '/api/covers/private-cover',
    },
    (async (input, init) => {
      request = new Request(input, init);
      return Response.json({ result_code: 0 });
    }) as typeof fetch,
  );
  assert.ok(request);
  const form = new URLSearchParams(await request.text());
  const template = JSON.parse(String(form.get('template_object'))) as Record<string, unknown>;
  assert.equal(template.object_type, 'text');
  assert.match(JSON.stringify(template), /https:\/\/library\.example\/\?book=item-2/u);
  assert.doesNotMatch(JSON.stringify(template), /private-cover/u);
});

void test('Kakao tokens refresh without discarding a still-valid refresh token', async () => {
  const now = Date.parse('2026-09-04T17:00:00.000Z');
  const credential = parseKakaoCredential(JSON.stringify({
    version: 1,
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    accessExpiresAt: now - 1,
    refreshExpiresAt: now + 30 * 86_400_000,
    scopes: ['openid', 'talk_message'],
  }));
  let request: Request | undefined;
  const refreshed = await refreshKakaoCredential(
    { kakaoRestApiKey: 'rest-api-key', kakaoClientSecret: 'client-secret' },
    credential,
    (async (input, init) => {
      request = new Request(input, init);
      return Response.json({ access_token: 'new-access-token', expires_in: 21_600 });
    }) as typeof fetch,
    now,
  );
  assert.equal(refreshed.accessToken, 'new-access-token');
  assert.equal(refreshed.refreshToken, 'old-refresh-token');
  assert.equal(refreshed.accessExpiresAt, now + 21_600_000);
  assert.ok(request);
  assert.equal(new URLSearchParams(await request.text()).get('client_secret'), 'client-secret');
});
