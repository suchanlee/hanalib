/** E.164 validation for the US-only pilot. */
export function isValidUsPhone(value: string) {
  return /^\+1[2-9]\d{9}$/.test(value.replace(/[\s()-]/g, ''));
}

export function normalizeUsPhone(value: string) {
  return value.replace(/[\s()-]/g, '');
}
