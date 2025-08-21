// backend/src/utils/timeSlots.js
/**
 * Canonical time-slot keys used across app:
 * - day        (whole/ full day = morning + afternoon)
 * - morning
 * - afternoon  (maps from "evening" legacy label)
 * - night
 */
export const TIME_SLOTS = Object.freeze({
  DAY: 'day',
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  NIGHT: 'night',
});

/**
 * Normalize any incoming label to a canonical key.
 * Examples:
 *  - "Evening"         -> "afternoon"
 *  - "Full day"/"Day"  -> "day"
 */
export function normalizeSlot(input) {
  if (!input) return '';
  const raw =
    typeof input === 'string'
      ? input
      : (input && (input.key || input.value || input.title)) || '';
  const s = String(raw).trim().toLowerCase();

  if (['day', 'whole day', 'whole-day', 'fullday', 'full day', 'all day', 'allday'].includes(s))
    return TIME_SLOTS.DAY;

  if (s === 'morning') return TIME_SLOTS.MORNING;

  // Legacy "evening" in some places actually meant the afternoon slot
  if (s === 'evening' || s === 'afternoon') return TIME_SLOTS.AFTERNOON;

  if (s === 'night' || s === 'nighttime') return TIME_SLOTS.NIGHT;

  return s; // fallback (do not throw yet)
}

export const isDay = (s) => normalizeSlot(s) === TIME_SLOTS.DAY;
