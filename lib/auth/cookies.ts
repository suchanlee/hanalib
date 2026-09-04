export interface CookieOptions {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'Lax' | 'Strict';
  secure?: boolean;
}

export function parseCookies(header: string | null) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 1) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookies instead of failing the whole request.
    }
  }
  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function cookieName(base: string, secure: boolean) {
  return secure ? `__Host-${base}` : base;
}
