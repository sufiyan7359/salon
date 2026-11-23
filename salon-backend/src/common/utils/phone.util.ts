import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Lets callers type a bare 10-digit Indian number ("9876543210") or one with
// +91/91/0 already on it - normalizes to E.164 ("+919876543210") so the same
// person always lands in the DB under one canonical value, and so it's ready
// to hand straight to Twilio, which requires E.164. Returns the input
// unchanged if it isn't a valid Indian number, so downstream validation
// (@IsPhoneNumber) still rejects it with a clear error.
export function normalizeIndianPhoneNumber(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const parsed = parsePhoneNumberFromString(value, 'IN');
  return parsed?.isValid() ? parsed.format('E.164') : value;
}
