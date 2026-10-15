import React from 'react';

export default function BranchReadStatus({ section, result, retry }) {
  if (result.loading) return <p role="status">{section}: Loading branch data…</p>;
  if (!result.failures.length) return null;
  return <section role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
    <strong>{section}: Incomplete data</strong>
    <p>{result.failures.length} unavailable branches: {result.failures.map(failure => failure.branchName || failure.branchId).join(', ')}.</p>
    <p>Successful branch results only — not a complete company total. {result.rows.length} known records retained.</p>
    <button type="button" className="mt-2 rounded border border-red-600 px-3 py-1 focus-visible:outline focus-visible:outline-2"
      onClick={retry}>Retry {section}</button>
  </section>;
}
