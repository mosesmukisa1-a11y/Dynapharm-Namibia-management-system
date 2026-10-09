const normalizeScanName = value => String(value || '').trim().toLocaleLowerCase();

function matchesScanIdentity(record, result) {
  const scannedId = result?.productId ?? result?.product_id;
  const recordIds = [record.id, record.productId, record.product_id].filter(id => id != null && String(id).trim());
  if (scannedId != null && String(scannedId).trim() && recordIds.length) {
    return recordIds.some(id => String(id) === String(scannedId));
  }
  const name = normalizeScanName(result?.productName);
  return !!name && normalizeScanName(record.name || record.description) === name;
}

export function findExactScanProduct(catalog, result) {
  const candidates = Array.isArray(catalog) ? catalog : [];
  const name = normalizeScanName(result?.productName);
  if (!name && result?.productId == null && result?.product_id == null) return null;
  const matches = candidates.filter(product => matchesScanIdentity(product, result));
  return matches.length === 1 ? matches[0] : null;
}

export function getScanUnitConversion(result) {
  const fields = ['enteredUnit', 'baseUnit', 'conversionFactor'];
  const hasMetadata = fields.some(key => result?.[key] != null && String(result[key]).trim() !== '');
  if (!hasMetadata) return { valid: true, isPack: false, factor: 1 };
  if (fields.some(key => result?.[key] == null || String(result[key]).trim() === '')) {
    return { valid: false, isPack: true, factor: null };
  }
  const factor = Number(result.conversionFactor);
  if (!Number.isFinite(factor) || factor <= 0) return { valid: false, isPack: true, factor: null };
  return {
    valid: true,
    isPack: normalizeScanName(result.enteredUnit) !== normalizeScanName(result.baseUnit) || factor !== 1,
    factor,
  };
}

export function resolveScanPrice(result, product, key) {
  const parse = raw => {
    if (raw == null || String(raw).trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const scanned = parse(result?.[key]);
  const catalog = parse(product?.[key]);
  if (scanned != null && scanned > 0) return scanned;
  if (catalog != null && catalog > 0) return catalog;
  return scanned ?? catalog;
}
