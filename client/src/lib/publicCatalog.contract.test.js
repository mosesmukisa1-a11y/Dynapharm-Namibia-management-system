import { describe, it, expect } from 'vitest';
import { buildPublicCatalog, getPackSize, getPublicCategories, PUBLIC_OUTLETS, ADDITIONAL_OUTLETS, outletDirections, filterPublicOutlets } from './publicCatalogModel';

describe('shared public catalogue and directory', () => {
  it('includes only priced catalogue entries, with no packages or known inactive products', () => {
    const prices = [
      { id: 1, description: 'Coffee', dp: 10 },
      { id: 2, description: 'Package', dp: 10, is_package: true },
      { id: 3, description: 'Retired', dp: 10, catalogue_entry: false },
      { id: 4, description: 'Unpriced', dp: 0 },
      { id: 5, description: 'Inactive', dp: 10 },
      { id: 6, description: 'Merged', dp: 10, merged_into_id: 1 },
    ];
    const output = buildPublicCatalog(prices, [{ id: 'coffee', name: 'Coffee', category: 'Beverages' }, { id: 'inactive', name: 'Inactive', is_active: false }]);
    expect(output.map(p => p.id)).toEqual(['coffee']);
    expect(getPublicCategories(output)).toEqual(['Beverages']);
  });
  it('preserves different price identities rather than merging duplicate names', () => {
    const result = buildPublicCatalog([{ id: 1, description: 'Same', dp: 2 }, { id: 2, description: 'Same', dp: 3 }],
      [{ id: 'db', name: 'Same' }]);
    expect(result.map(p => p.id)).toEqual(['1', '2']);
  });
  it('does not choose arbitrarily between ambiguous matching product IDs', () => {
    const result = buildPublicCatalog([{ id: 9, description: 'Same', dp: 2 }],
      [{ id: 'first', name: 'Same', category: 'First' }, { id: 'second', name: 'Same', category: 'Second' }]);
    expect(result[0]).toMatchObject({ id: '9', category: 'General' });
  });
  it('preserves official names and keeps Compact Powder out of an unverified health category', () => {
    const result = buildPublicCatalog([{ id: 5, description: 'COMPACT POWDER 12G', dp: 10 }],
      [{ id: 'compact', name: 'COMPACT POWDER 12G', category: 'Health Supplements' }]);
    expect(result[0]).toMatchObject({ name: 'COMPACT POWDER 12G', category: 'Category under review' });
    expect(getPackSize(result[0])).toBe('12 g');
    expect(getPackSize({ name: "ARABICA COFFEE 25GX20'S" })).toBe("25 g × 20's");
    expect(getPackSize({ name: 'TEA TREE LOTION (250ML)' })).toBe('250 ml');
    expect(getPackSize({ name: 'Unknown' })).toBe('Pack size not listed');
  });
  it('keeps verified and unconfirmed directory records separate with address-based directions', () => {
    expect(PUBLIC_OUTLETS).toHaveLength(15);
    expect(PUBLIC_OUTLETS.filter(b => b.town === 'Windhoek')).toHaveLength(3);
    expect(filterPublicOutlets(PUBLIC_OUTLETS, 'Windhoek').map(b => b.id)).toEqual(['townshop', 'hochland-park', 'khomasdal']);
    expect(ADDITIONAL_OUTLETS).toHaveLength(2);
    expect(ADDITIONAL_OUTLETS.find(b => b.id === 'okongo').region).toBe('Ohangwena');
    expect(new Set([...PUBLIC_OUTLETS, ...ADDITIONAL_OUTLETS].map(b => b.id)).size).toBe(17);
    const link = new URL(outletDirections(PUBLIC_OUTLETS[0]));
    expect(link.searchParams.get('destination')).toContain(PUBLIC_OUTLETS[0].address);
    expect(link.searchParams.get('destination')).toContain('Namibia');
  });
  it('does not silently treat API errors as empty products', () => {
    expect(() => buildPublicCatalog({ error: 'unavailable' }, [])).toThrow();
  });
});
