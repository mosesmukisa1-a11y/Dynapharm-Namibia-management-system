/**
 * Branch utility functions for normalizing branch slugs across the system.
 * Canonical slug for Windhoek CBD is 'townshop' (matches BRANCH_DETAILS in client constants).
 */

const WINDHOEK_CBD_ALIASES = new Set([
  'windhoek_cbd',
  'windhoek',
  'townshop',
  'windhoek cbd',
  'cdb',
  'cbd',
]);

const CANONICAL_WINDHOEK_CBD = 'townshop';

/**
 * Map any known Windhoek CBD alias to the canonical slug.
 * Other branch slugs are returned as-is (trimmed, lowercased).
 * Returns null if input is falsy.
 */
export function normalizeBranchSlug(branch) {
  if (!branch || typeof branch !== 'string') return null;
  const lower = branch.trim().toLowerCase();
  if (!lower) return null;
  if (WINDHOEK_CBD_ALIASES.has(lower)) return CANONICAL_WINDHOEK_CBD;
  return lower;
}

/**
 * Normalize every slug in an array.
 */
export function normalizeBranchArray(branches) {
  if (!Array.isArray(branches)) return [];
  return [...new Set(branches.map(normalizeBranchSlug).filter(Boolean))];
}

export { CANONICAL_WINDHOEK_CBD, WINDHOEK_CBD_ALIASES };
