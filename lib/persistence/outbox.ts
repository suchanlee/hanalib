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
  return_check_due: {
    bookTitle: string;
    recipientName: string;
    actorName: string;
    returnUrl: string;
  };
}

export type LibraryOutboxEventType = keyof OutboxPayloadByType;

export interface LibraryOutboxEvent<T extends LibraryOutboxEventType = LibraryOutboxEventType> {
  type: T;
  payload: OutboxPayloadByType[T];
}
