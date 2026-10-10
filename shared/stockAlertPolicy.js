// Warning policy only: these values must never control stock movements.
export const DEFAULT_STOCK_ALERT_POLICY = Object.freeze({
  lowStockThreshold: 10,
  expiryWarningDays: 90,
});
export const STOCK_ALERT_EDIT_ROLES = Object.freeze([
  'stock', 'stock_manager', 'gm', 'general_manager',
  'admin', 'superadmin', 'super_admin',
]);

export function validateStockAlertPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_STOCK_ALERT_POLICY, key))) {
    throw new Error('Provide only lowStockThreshold and expiryWarningDays');
  }
  const { lowStockThreshold, expiryWarningDays } = value;
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 1 || lowStockThreshold > 2147483647) {
    throw new Error('Low-stock threshold must be an integer from 1 to 2147483647 units');
  }
  validateExpiryWarningDays(expiryWarningDays);
  return { lowStockThreshold, expiryWarningDays };
}

export function validateExpiryWarningDays(days) {
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) {
    throw new Error('Expiry warning must be an integer from 0 to 3650 days');
  }
  return days;
}
