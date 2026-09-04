import type { NotificationChannel } from '@/lib/domain/types';
import type { NotificationTemplate } from './templates';

export interface NotificationSenderConfig {
  resendApiKey?: string;
  emailFrom?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
}

export interface DeliveryTarget {
  channel: NotificationChannel;
  email?: string;
  phone?: string;
}

export interface DeliveryResult {
  channel: 'email' | 'sms';
  providerMessageId: string;
}

async function providerError(response: Response, provider: string) {
  let code = `${provider}_${response.status}`;
  try {
    const payload = await response.json() as { code?: string | number; name?: string };
    code = String(payload.code ?? payload.name ?? code);
  } catch {
    // Provider response bodies are deliberately not copied into logs or errors.
  }
  throw new Error(`${provider} delivery failed (${code})`);
}

export async function sendResendEmail(
  config: NotificationSenderConfig,
  to: string,
  message: NotificationTemplate,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
  if (!config.resendApiKey || !config.emailFrom) {
    throw new Error('Email delivery is not configured.');
  }

  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) await providerError(response, 'resend');
  const payload = await response.json() as { id?: string };
  if (!payload.id) throw new Error('Resend returned no message id.');
  return { channel: 'email', providerMessageId: payload.id };
}

export async function sendTwilioSms(
  config: NotificationSenderConfig,
  to: string,
  message: NotificationTemplate,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioFromNumber) {
    throw new Error('SMS delivery is not configured.');
  }

  const body = new URLSearchParams({
    From: config.twilioFromNumber,
    To: to,
    Body: message.text,
  });
  const credentials = btoa(`${config.twilioAccountSid}:${config.twilioAuthToken}`);
  const response = await fetcher(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    },
  );
  if (!response.ok) await providerError(response, 'twilio');
  const payload = await response.json() as { sid?: string };
  if (!payload.sid) throw new Error('Twilio returned no message id.');
  return { channel: 'sms', providerMessageId: payload.sid };
}

export async function sendNotification(
  config: NotificationSenderConfig,
  target: DeliveryTarget,
  message: NotificationTemplate,
  fetcher: typeof fetch = fetch,
) {
  const jobs: Array<Promise<DeliveryResult>> = [];
  if ((target.channel === 'email' || target.channel === 'both') && target.email) {
    jobs.push(sendResendEmail(config, target.email, message, fetcher));
  }
  if ((target.channel === 'sms' || target.channel === 'both') && target.phone) {
    jobs.push(sendTwilioSms(config, target.phone, message, fetcher));
  }
  if (jobs.length === 0) throw new Error('No verified notification destination is available.');
  return Promise.all(jobs);
}
