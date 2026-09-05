export interface OutboxPayloadByType {
  borrow_requested: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    expiresAt: string;
    decisionUrl: string;
    bookUrl?: string;
    coverUrl?: string;
  };
  borrow_accepted: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    returnUrl: string;
  };
  borrow_declined: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
  };
  borrow_canceled: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    bookUrl: string;
  };
  borrow_expired: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    bookUrl: string;
  };
  book_returned: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    bookUrl: string;
  };
  return_check_due: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    returnUrl: string;
  };
  hold_available: {
    bookTitle: string;
    recipientName: string;
    expiresAt: string;
    offerUrl: string;
    coverUrl?: string;
  };
  hold_offer_reminder: {
    bookTitle: string;
    recipientName: string;
    expiresAt: string;
    offerUrl: string;
    coverUrl?: string;
  };
}

export type LibraryOutboxEventType = keyof OutboxPayloadByType;

export interface LibraryOutboxEvent<T extends LibraryOutboxEventType = LibraryOutboxEventType> {
  type: T;
  payload: OutboxPayloadByType[T];
}
