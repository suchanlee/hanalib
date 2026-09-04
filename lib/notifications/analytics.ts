export type NotificationEventName =
  | 'notification_queued'
  | 'notification_sent'
  | 'notification_failed'
  | 'borrow_request_expired'
  | 'sms_reply_accepted'
  | 'sms_reply_rejected';

/** Deliberately excludes title, ISBN, names, addresses, phone numbers, and bodies. */
export interface NotificationAnalyticsEvent {
  name: NotificationEventName;
  occurredAt: string;
  channel?: 'email' | 'sms';
  outcome?: 'success' | 'failure' | 'invalid' | 'ambiguous';
  latencyBucket?: 'under_1s' | 'under_10s' | 'over_10s';
}

export function isContentFreeEvent(event: NotificationAnalyticsEvent) {
  const allowed = new Set([
    'name',
    'occurredAt',
    'channel',
    'outcome',
    'latencyBucket',
  ]);
  return Object.keys(event).every((key) => allowed.has(key));
}
