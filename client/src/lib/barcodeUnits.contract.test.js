import { describe, expect, it } from 'vitest';
import { findExactScanProduct, getScanUnitConversion, resolveScanPrice } from './barcodeUnits';

describe('barcode pack unit contract', () => {
  it('returns the explicit base-unit factor for pack scans', () => {
    expect(getScanUnitConversion({
      enteredUnit: 'carton',
      baseUnit: 'tablet',
      conversionFactor: 24,
    })).toEqual({ valid: true, isPack: true, factor: 24 });
    expect(getScanUnitConversion({ barcode: 'base-item' })).toEqual({ valid: true, isPack: false, factor: 1 });
  });

  it('rejects incomplete or invalid pack conversion metadata', () => {
    expect(getScanUnitConversion({ enteredUnit: 'carton', baseUnit: 'tablet' }).valid).toBe(false);
    expect(getScanUnitConversion({ enteredUnit: 'carton', baseUnit: 'tablet', conversionFactor: 0 }).valid).toBe(false);
  });

  it('matches one exact catalogue identity and rejects fuzzy or ambiguous names', () => {
    const catalog = [
      { id: 'p1', name: 'Vitamin C' },
      { id: 'p2', name: 'Vitamin C Plus' },
    ];
    expect(findExactScanProduct(catalog, { productName: 'Vitamin C' })).toEqual(catalog[0]);
    expect(findExactScanProduct(catalog, { productName: 'Vitamin' })).toBeNull();
    expect(findExactScanProduct([...catalog, { id: 'p3', name: ' vitamin c ' }], { productName: 'Vitamin C' })).toBeNull();
    expect(findExactScanProduct(catalog, { productId: 'unknown', productName: 'Vitamin C' })).toBeNull();
  });

  it('does not turn missing scan prices into zero when catalogue pricing exists', () => {
    expect(resolveScanPrice({ dp: 0 }, { dp: 18.5 }, 'dp')).toBe(18.5);
    expect(resolveScanPrice({}, { dp: null }, 'dp')).toBeNull();
  });
});
