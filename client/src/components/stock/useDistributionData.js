import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useStockRealtime } from '../../hooks/useStockRealtime';

export default function useDistributionData() {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const active = useRef(false);
  const catalogSequence = useRef(0);
  const refreshCatalog = useCallback(async () => {
    const sequence = ++catalogSequence.current;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const result = await api.get('/stock/distribution/catalog');
      if (!result?.success || !Array.isArray(result.products) || !Array.isArray(result.warehouses)) throw new Error('The distribution catalog could not be loaded.');
      if (active.current && sequence === catalogSequence.current) {
        setProducts(result.products);
        setWarehouses(result.warehouses);
      }
    } catch (error) {
      if (active.current && sequence === catalogSequence.current) setCatalogError(error.message || 'Unable to load catalog.');
    } finally {
      if (active.current && sequence === catalogSequence.current) setCatalogLoading(false);
    }
  }, []);
  const refresh = refreshCatalog;
  useEffect(() => {
    active.current = true;
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => { active.current = false; clearInterval(timer); };
  }, [refresh]);
  useStockRealtime({ onUpdate: refresh });
  return { products, warehouses, catalogLoading, catalogError, refreshCatalog, refresh };
}
