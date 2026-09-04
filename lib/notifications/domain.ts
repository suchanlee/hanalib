import type {
  BorrowRequest,
  CatalogItem,
} from '@/lib/domain/types';

export type BorrowDecision = 'accepted' | 'declined';

export type InboundDecisionResult =
  | { kind: 'decision'; decision: BorrowDecision }
  | { kind: 'invalid' };

/**
 * SMS bodies are handled transiently and are never included in analytics.
 * Only an exact `1` or `2` (surrounded by whitespace) is actionable.
 */
export function parseInboundSmsDecision(body: string): InboundDecisionResult {
  const normalized = body.trim();
  if (normalized === '1') return { kind: 'decision', decision: 'accepted' };
  if (normalized === '2') return { kind: 'decision', decision: 'declined' };
  return { kind: 'invalid' };
}

export function actionableRequestsForOwner(
  ownerId: string,
  items: CatalogItem[],
  requests: BorrowRequest[],
  now = new Date(),
) {
  const ownedItemIds = new Set(
    items.filter((item) => item.ownerId === ownerId).map((item) => item.id),
  );

  return requests.filter(
    (request) =>
      request.status === 'pending' &&
      ownedItemIds.has(request.catalogItemId) &&
      new Date(request.expiresAt).getTime() > now.getTime(),
  );
}

export type SmsResolution =
  | { kind: 'ready'; requestId: string; decision: BorrowDecision }
  | { kind: 'invalid-reply' }
  | { kind: 'no-actionable-request' }
  | { kind: 'ambiguous'; requestCount: number };

/**
 * A reply is safe to apply only when that sender has exactly one live request.
 * Ambiguous replies must fall back to a signed in-app decision link.
 */
export function resolveOwnerSmsReply(
  ownerId: string,
  body: string,
  items: CatalogItem[],
  requests: BorrowRequest[],
  now = new Date(),
): SmsResolution {
  const parsed = parseInboundSmsDecision(body);
  if (parsed.kind === 'invalid') return { kind: 'invalid-reply' };

  const actionable = actionableRequestsForOwner(ownerId, items, requests, now);
  if (actionable.length === 0) return { kind: 'no-actionable-request' };
  if (actionable.length > 1) {
    return { kind: 'ambiguous', requestCount: actionable.length };
  }

  return {
    kind: 'ready',
    requestId: actionable[0].id,
    decision: parsed.decision,
  };
}

export const REQUEST_EXPIRY_HOURS = 48;
export const FIRST_RETURN_CHECK_DAYS = 7;
export const RETURN_CHECK_INTERVAL_DAYS = 7;
