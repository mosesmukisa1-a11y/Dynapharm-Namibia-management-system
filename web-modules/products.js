const PRODUCTS_KEY = 'dyna_products';

function ensureLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('localStorage unavailable');
    }
    return window.localStorage;
}

function readJson(key, fallback) {
    try {
        const raw = ensureLocalStorage().getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

function mapProduct(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        id: raw.id || raw.productId || raw.sku || raw.description || `PROD-${Math.random().toString(36).slice(2, 8)}`,
        sku: raw.sku || raw.id || null,
        name: raw.name || raw.description || raw.productName || raw.id || 'Product',
        description: raw.description || raw.name || raw.productName || '',
        category: raw.category || raw.group || null,
        unit: raw.unit || raw.uom || 'units',
        dp: Number(raw.dp || raw.price || raw.sellingPrice || raw.dpPrice || 0),
        cp: Number(raw.cp || raw.costPrice || raw.purchasePrice || raw.cpPrice || 0),
        bv: Number(raw.bv || raw.businessVolume || 0),
        tax_rate: Number(raw.tax_rate || raw.taxRate || raw.tax || 0),
        is_active: raw.is_active !== undefined ? raw.is_active : true
    };
}

export function getProducts({ limit = 0 } = {}) {
    const localProducts = readJson(PRODUCTS_KEY, []);
    const products = [];

    if (Array.isArray(localProducts) && localProducts.length > 0) {
        localProducts.forEach(item => {
            const mapped = mapProduct(item);
            if (mapped) products.push(mapped);
        });
    } else if (typeof window !== 'undefined' && Array.isArray(window.PRICE_LIST)) {
        window.PRICE_LIST.forEach(item => {
            const mapped = mapProduct(item);
            if (mapped) products.push(mapped);
        });
    }

    const result = limit > 0 ? products.slice(0, limit) : products;
    return { success: true, data: result };
}

export default {
    getProducts
};
