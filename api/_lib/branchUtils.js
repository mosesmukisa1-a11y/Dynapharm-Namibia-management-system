/**
 * Branch utility functions for normalizing branch slugs across the system.
 * Canonical slug for Windhoek CBD is 'townshop' (matches BRANCH_DETAILS in client constants).
 * Canonical slug for Katima Mulilo is 'katima_mulilo'.
 */

const WINDHOEK_CBD_ALIASES = new Set([
  'windhoek_cbd',
  'windhoek',
  'townshop',
  'windhoek cbd',
  'cdb',
  'cbd',
]);

const KATIMA_ALIASES = new Set([
  'katima',
  'katima mulilo',
  'katima-mulilo',
  'katima_branch',
  'katima_mulilo_branch',
]);

const CANONICAL_WINDHOEK_CBD = 'townshop';
const CANONICAL_KATIMA = 'katima_mulilo';

/**
 * Map any known branch alias to its canonical slug.
 * Other branch slugs are returned as-is (trimmed, lowercased).
 * Returns null if input is falsy.
 */
export function normalizeBranchSlug(branch) {
  if (!branch || typeof branch !== 'string') return null;
  const lower = branch.trim().toLowerCase();
  if (!lower) return null;
  if (WINDHOEK_CBD_ALIASES.has(lower)) return CANONICAL_WINDHOEK_CBD;
  if (KATIMA_ALIASES.has(lower)) return CANONICAL_KATIMA;
  return lower;
}

/**
 * Normalize every slug in an array.
 */
export function normalizeBranchArray(branches) {
  if (!Array.isArray(branches)) return [];
  return [...new Set(branches.map(normalizeBranchSlug).filter(Boolean))];
}

/**
 * Canonical list of all branch IDs — single source of truth for backend.
 * Mirrors BRANCH_DETAILS IDs in client/src/lib/constants.js.
 * Update both files together when adding/removing branches.
 */
export const ALL_BRANCH_IDS = [
  'townshop', 'tsumeb', 'gobabis', 'swakopmund', 'outapi', 'okahao',
  'oshakati_branch', 'otjiwarongo', 'eenhana', 'ondangwa', 'rundu',
  'walvisbay', 'hochland-park', 'khomasdal', 'katima_mulilo', 'okongo', 'nkurenkuru',
];

export { CANONICAL_WINDHOEK_CBD, WINDHOEK_CBD_ALIASES, CANONICAL_KATIMA, KATIMA_ALIASES };
