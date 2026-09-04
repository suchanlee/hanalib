import type { NotificationChannel } from '@/lib/domain/types';
import type { NotificationTemplate } from './templates';

export interface NotificationDestination {
  memberId: string;
  channel: NotificationChannel;
  email?: string;
  /** E.164; the US pilot accepts +1 numbers only. */
  phone?: string;
}

export interface NotificationReceipt {
  providerMessageIds: string[];
  acceptedAt: string;
}

export interface NotificationProvider {
  send(
    destination: NotificationDestination,
    message: NotificationTemplate,
  ): Promise<NotificationReceipt>;
}

export interface TwilioWebhookConfig {
  publicWebhookUrl: string;
  authTokenSecretName: 'TWILIO_AUTH_TOKEN';
  signingAlgorithm: 'HMAC-SHA1';
}

export function twilioWebhookConfig(publicWebhookUrl: string): TwilioWebhookConfig {
  return {
    publicWebhookUrl,
    authTokenSecretName: 'TWILIO_AUTH_TOKEN',
    signingAlgorithm: 'HMAC-SHA1',
  };
}

/**
 * Implemented by the server adapter. Signature verification must happen before
 * the transient SMS body is passed to `resolveOwnerSmsReply`.
 */
export interface TwilioWebhookVerifier {
  verify(input: {
    signature: string;
    url: string;
    formValues: Readonly<Record<string, string>>;
  }): Promise<boolean>;
}
