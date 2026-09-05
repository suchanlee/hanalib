export type OperationalLogLevel = 'error' | 'warn';

export interface RequestLogContext {
  requestId: string;
  method: string;
  route: string;
  startedAt: number;
}

export interface OperationalLogFields {
  requestId?: string;
  method?: string;
  route?: string;
  operation?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  provider?: string;
  providerStatus?: string;
  eventType?: string;
  attemptCount?: number;
  claimed?: number;
  sent?: number;
  failed?: number;
  expired?: number;
}

const codePattern = /^[a-z][a-z0-9_.:-]{0,79}$/i;
const methodPattern = /^(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/;
const providerStatusPattern = /^[a-z0-9_.:-]{1,180}$/i;
const requestIdPattern = /^[a-z0-9-]{1,80}$/i;
const rayPattern = /^[0-9a-f]{16,32}$/i;
const uuidSegment = /^(?:[a-z]+-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function finiteInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function safeCode(value: unknown) {
  return typeof value === 'string' && codePattern.test(value) ? value : undefined;
}

function safeRoute(request: Request) {
  const path = new URL(request.url).pathname;
  return `/${path.split('/').filter(Boolean).map((segment) => (
    uuidSegment.test(segment) || segment.length > 80 ? ':id' : segment
  )).join('/')}`;
}

export function requestLogContext(request: Request, startedAt = Date.now()): RequestLogContext {
  const ray = request.headers.get('cf-ray')?.split('-', 1)[0];
  return {
    requestId: ray && rayPattern.test(ray) ? ray.toLowerCase() : crypto.randomUUID(),
    method: methodPattern.test(request.method) ? request.method : 'UNKNOWN',
    route: safeRoute(request),
    startedAt,
  };
}

export function requestLogFields(
  context: RequestLogContext,
  status: number,
  fields: Omit<OperationalLogFields, 'requestId' | 'method' | 'route' | 'status' | 'durationMs'> = {},
): OperationalLogFields {
  return {
    requestId: context.requestId,
    method: context.method,
    route: context.route,
    status,
    durationMs: Date.now() - context.startedAt,
    ...fields,
  };
}

export function withRequestId(response: Response, context: Pick<RequestLogContext, 'requestId'>) {
  response.headers.set('x-request-id', context.requestId);
  return response;
}

export function safeErrorCode(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = safeCode((error as { code?: unknown }).code);
    if (code) return code;
  }
  if (error instanceof Error) {
    const message = safeCode(error.message);
    if (message && /^(?:invalid|kakao|notification|provider|recipient|unsupported)-/i.test(message)) {
      return message.toLowerCase();
    }
  }
  return safeCode(fallback) ?? 'unknown-error';
}

function sanitized(fields: OperationalLogFields) {
  return {
    ...(fields.requestId && requestIdPattern.test(fields.requestId) ? { requestId: fields.requestId } : {}),
    ...(fields.method && methodPattern.test(fields.method) ? { method: fields.method } : {}),
    ...(fields.route?.startsWith('/') && fields.route.length <= 160 ? { route: fields.route } : {}),
    ...(safeCode(fields.operation) ? { operation: fields.operation } : {}),
    ...(finiteInteger(fields.status) !== undefined ? { status: finiteInteger(fields.status) } : {}),
    ...(finiteInteger(fields.durationMs) !== undefined ? { durationMs: finiteInteger(fields.durationMs) } : {}),
    ...(safeCode(fields.errorCode) ? { errorCode: fields.errorCode } : {}),
    ...(safeCode(fields.provider) ? { provider: fields.provider } : {}),
    ...(fields.providerStatus && providerStatusPattern.test(fields.providerStatus) ? { providerStatus: fields.providerStatus } : {}),
    ...(safeCode(fields.eventType) ? { eventType: fields.eventType } : {}),
    ...(finiteInteger(fields.attemptCount) !== undefined ? { attemptCount: finiteInteger(fields.attemptCount) } : {}),
    ...(finiteInteger(fields.claimed) !== undefined ? { claimed: finiteInteger(fields.claimed) } : {}),
    ...(finiteInteger(fields.sent) !== undefined ? { sent: finiteInteger(fields.sent) } : {}),
    ...(finiteInteger(fields.failed) !== undefined ? { failed: finiteInteger(fields.failed) } : {}),
    ...(finiteInteger(fields.expired) !== undefined ? { expired: finiteInteger(fields.expired) } : {}),
  };
}

export function operationalLog(level: OperationalLogLevel, event: string, fields: OperationalLogFields = {}) {
  const record = JSON.stringify({
    schema: 'hana.operations.v1',
    level,
    event: safeCode(event) ?? 'invalid-event',
    ...sanitized(fields),
  });
  if (level === 'error') console.error(record);
  else console.warn(record);
}
