import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SaleEvidenceLinks() {
  const { hasPortalAccess } = useAuth();
  const [reference, setReference] = useState('');
  return <section className="rounded-lg border border-red-200 bg-white p-3 my-3">
    <label className="block text-sm font-semibold">Review source evidence by receipt or sale reference
      <input className="border border-gray-300 rounded px-3 py-2 ml-2" value={reference}
        onChange={event => setReference(event.target.value)} placeholder="Receipt / WALK reference" />
    </label>
    <div className="flex gap-4 text-sm mt-2">
      {hasPortalAccess('stock') ? (reference.trim() ? <Link className="text-red-700 underline" to={`/stock?view=trace&search=${encodeURIComponent(reference.trim())}`}>Trace receipt movements</Link> : <span className="text-gray-500">Enter a receipt/reference to trace</span>) : <span className="text-gray-500">Stock evidence access is not assigned to your role.</span>}
      {hasPortalAccess('mis') ? <Link className="text-red-700 underline" to="/mis">Open MIS audit (apply receipt/reference filter)</Link> : <span className="text-gray-500">MIS audit access is not assigned to your role.</span>}
    </div>
    <p className="text-xs text-gray-500">Read-only evidence review. Portal and branch permissions still apply; commercial DP, customer receipts and original CIF remain separate.</p>
  </section>;
}
