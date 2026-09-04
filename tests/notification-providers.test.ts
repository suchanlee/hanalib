import assert from 'node:assert/strict';
import test from 'node:test';
import { sendNotification } from '../lib/notifications/sender.ts';
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
