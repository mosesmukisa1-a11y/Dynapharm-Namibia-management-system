import { useCallback, useEffect, useState } from 'react';
import { loadPublicCatalog } from '../lib/publicCatalog';

export function usePublicCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    loadPublicCatalog().then(data => {
      if (alive) setProducts(data);
    }).catch(() => {
      if (alive) setError('The product catalogue is unavailable at the moment. Please try again.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  return { products, loading, error, retry };
}
