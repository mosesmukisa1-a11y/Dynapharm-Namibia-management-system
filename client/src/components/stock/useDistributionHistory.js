import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useStockRealtime } from '../../hooks/useStockRealtime';

export default function useDistributionHistory({ page, pageSize, search, destination, status, dateFrom, dateTo, revision }) {
  const [transfers, setTransfers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, destination, status, dateFrom, dateTo });
      const result = await api.get(`/stock/distribution/history?${params}`);
      if (!result?.success || !Array.isArray(result.transfers) || !Number.isFinite(Number(result.total))) throw new Error('The distribution history response was not recognised.');
      if (mounted.current && requestId === sequence.current) { setTransfers(result.transfers); setTotal(Number(result.total)); }
    } catch (error) {
      if (mounted.current && requestId === sequence.current) setError(error.message || 'Unable to load transfer history.');
    } finally {
      if (mounted.current && requestId === sequence.current) setLoading(false);
    }
  }, [page, pageSize, search, destination, status, dateFrom, dateTo]);
  useEffect(() => {
    mounted.current = true;
    // Debounce filter typing; immediately suppress old rows and invalidate old responses.
    sequence.current += 1;
    setLoading(true);
    const timer = setTimeout(refresh, 250);
    return () => { clearTimeout(timer); mounted.current = false; sequence.current += 1; };
  }, [refresh, revision]);
  useStockRealtime({ onUpdate: refresh });
  useEffect(() => { const timer = setInterval(refresh, 60000); return () => clearInterval(timer); }, [refresh]);
  return { transfers, total, loading, error, refresh };
}
