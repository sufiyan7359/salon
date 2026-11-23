// This app serves a single India-based salon, but the server may run in any
// timezone (Render's default Node runtime is UTC). Every "today"/"past" check
// in the codebase means it in India Standard Time, not the server's local
// time - a UTC server would otherwise be off by 5:30 from what the salon and
// its customers actually mean. India has one fixed offset year-round (no
// DST), so plain millisecond arithmetic is enough - no timezone library
// needed.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The Date instant for 00:00:00.000 IST of the IST calendar day that
// `instant` falls in - i.e. "today" (or the day of `instant`) at IST midnight.
export function startOfIstDay(instant: Date = new Date()): Date {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

// The "YYYY-MM-DD" calendar date `instant` falls on in IST.
export function istDateOnly(instant: Date): string {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

// The 0-23 hour-of-day `instant` falls in IST.
export function istHour(instant: Date): number {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return shifted.getUTCHours();
}

// Parses a "YYYY-MM-DD" date and "HH:mm" time as IST wall-clock time,
// returning the correct absolute instant regardless of server timezone.
export function parseIstDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
}
