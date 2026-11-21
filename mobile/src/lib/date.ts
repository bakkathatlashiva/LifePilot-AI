import { format } from 'date-fns';

/**
 * Bulletproof date formatter that never throws RangeError on invalid,
 * null, undefined, or empty date values.
 */
export function safeFormatDate(
  val?: string | number | Date | null,
  fmt: string = 'MMM d, yyyy h:mm a',
  fallback: string = ''
): string {
  if (!val) return fallback;
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}
