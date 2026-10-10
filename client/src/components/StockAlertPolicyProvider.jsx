import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alert, Button, LoadingSpinner } from './ui';
import { validateStockAlertPolicy } from '../../../shared/stockAlertPolicy.js';

const Context = createContext(null);
export const useStockAlertPolicy = () => useContext(Context);

export default function StockAlertPolicyProvider({ children }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    api.get('/stock/alert-policy').then(result => {
      const policy = validateStockAlertPolicy(result.policy);
      if (!cancelled) setState({ policy, canEdit: result.canEdit });
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [attempt]);
  if (error) return <Alert type="error">Stock warning settings could not be loaded: {error} <Button onClick={() => retry(n => n + 1)}>Retry</Button></Alert>;
  if (!state) return <LoadingSpinner />;
  return <Context.Provider value={{
    ...state, ...state.policy,
    onSaved: policy => setState(previous => ({ ...previous, policy: validateStockAlertPolicy(policy) })),
  }}>{children}</Context.Provider>;
}
