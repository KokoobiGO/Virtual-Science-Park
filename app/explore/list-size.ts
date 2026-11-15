/**
 * How many rows the Explore list shows before "Show all". In a plain module,
 * not the "use client" one: a constant exported from a client module reaches a
 * server component as a client reference, not as the number.
 * show-more-list.tsx hides the rest with `nth-child(n+21)`; keep the two in step.
 */
export const FIRST_ROWS = 20;
