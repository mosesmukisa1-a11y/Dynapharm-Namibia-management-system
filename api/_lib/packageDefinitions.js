import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PACKAGE_DATA = require('../../shared/package-data.json');

export const PACKAGE_DATABASE = PACKAGE_DATA;

export function isKnownPackage(productName) {
  if (!productName) return false;
  const normalized = productName.trim();
  return Object.keys(PACKAGE_DATABASE).some(k => k.toLowerCase() === normalized.toLowerCase());
}

export function getPackageComponents(productName) {
  if (!productName) return null;
  const normalized = productName.trim();
  const entry = Object.entries(PACKAGE_DATABASE).find(([k]) => k.toLowerCase() === normalized.toLowerCase());
  return entry ? entry[1] : null;
}
