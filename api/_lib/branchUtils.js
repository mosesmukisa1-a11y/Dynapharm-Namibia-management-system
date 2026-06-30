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

const OSHAKATI_ALIASES = new Set([
  'oshakati',
  'oshakati_branch',
  'oshakati branch',
]);

const CANONICAL_WINDHOEK_CBD = 'townshop';
const CANONICAL_KATIMA = 'katima_mulilo';
const CANONICAL_OSHAKATI = 'oshakati_branch';

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
  if (OSHAKATI_ALIASES.has(lower)) return CANONICAL_OSHAKATI;
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

/**
 * Expanded set of ALL text forms that could appear in stock_batches.location for
 * branch locations — canonical IDs plus every known alias.
 * Used ONLY for SQL exclusion filters (sb.location != ALL(...)) so that
 * accidentally-imported branch-location stock_batches rows do not appear as
 * fake warehouse rows in overview / valuation queries.
 * Do NOT use for iteration (use ALL_BRANCH_IDS for that).
 */
export const ALL_BRANCH_LOCATION_ALIASES = [
  ...ALL_BRANCH_IDS,
  // Windhoek CBD / Townshop aliases
  'windhoek', 'windhoek_cbd', 'windhoek cbd', 'cbd', 'cdb',
  // Oshakati aliases
  'oshakati', 'oshakati branch',
  // Katima Mulilo aliases
  'katima', 'katima mulilo', 'katima-mulilo', 'katima_branch', 'katima_mulilo_branch',
  // Walvis Bay aliases
  'walvis bay', 'walvis_bay',
  // Hochland Park aliases
  'hochland park', 'hochland_park', 'hochlandpark',
];

/**
 * Branch ID → all possible text values that could be stored in DB columns like
 * requesting_branch, to_branch, branch_id, etc.
 * Used to build SQL ANY() conditions that match regardless of whether the stored value
 * is the canonical ID, the display name, or some legacy variant.
 *
 * All values are lowercase so they can be compared with LOWER(column).
 */
const BRANCH_SEARCH_TERMS = {
  townshop:        ['townshop', 'windhoek cbd', 'windhoek_cbd', 'windhoek', 'cbd', 'cdb'],
  tsumeb:          ['tsumeb'],
  gobabis:         ['gobabis'],
  swakopmund:      ['swakopmund'],
  outapi:          ['outapi'],
  okahao:          ['okahao'],
  oshakati_branch: ['oshakati_branch', 'oshakati branch', 'oshakati'],
  oshakati:        ['oshakati_branch', 'oshakati branch', 'oshakati'],
  otjiwarongo:     ['otjiwarongo'],
  eenhana:         ['eenhana'],
  ondangwa:        ['ondangwa'],
  rundu:           ['rundu'],
  walvisbay:       ['walvisbay', 'walvis bay', 'walvis_bay'],
  'hochland-park': ['hochland-park', 'hochland park', 'hochland_park', 'hochlandpark'],
  khomasdal:       ['khomasdal'],
  katima_mulilo:   ['katima_mulilo', 'katima mulilo', 'katima', 'katima-mulilo', 'katima_branch', 'katima_mulilo_branch'],
  okongo:          ['okongo'],
  nkurenkuru:      ['nkurenkuru'],
};

/**
 * Given a branch ID (canonical or alias), returns ALL lowercase text forms
 * that might appear in DB text columns for that branch.
 * Always includes the input itself as a fallback.
 *
 * Usage in SQL:  LOWER(requesting_branch) = ANY($1::text[])
 * where $1 = branchSearchTerms('townshop')
 */
export function branchSearchTerms(branchIdOrAlias) {
  const canonical = normalizeBranchSlug(branchIdOrAlias);
  if (!canonical) return [];
  const known = BRANCH_SEARCH_TERMS[canonical];
  if (known) return known;
  // Fallback: the canonical slug itself plus underscore↔space variants
  const spaced = canonical.replace(/_/g, ' ');
  const underscored = canonical.replace(/\s+/g, '_');
  return [...new Set([canonical, spaced, underscored])];
}

/**
 * For a list of branch IDs, return a flat deduplicated array of all search terms.
 * Useful for ANY() conditions covering multiple branches (e.g. branchScope enforcement).
 */
export function branchSearchTermsForMany(branchIds) {
  const allTerms = branchIds.flatMap(id => branchSearchTerms(id));
  return [...new Set(allTerms)];
}

export { CANONICAL_WINDHOEK_CBD, WINDHOEK_CBD_ALIASES, CANONICAL_KATIMA, KATIMA_ALIASES, CANONICAL_OSHAKATI, OSHAKATI_ALIASES };
