import { useCallback, useEffect, useRef, useState } from 'react';
import { BRANCH_DETAILS } from '../lib/constants';
import { BRANCH_DASHBOARD_READS, readAuthorizedBranches } from '../lib/authorizedBranchReads';

export function useBranchDashboardReads(sections, commonParams = {}) {
  const query = new URLSearchParams(commonParams).toString();
  const generation = useRef({});
  const [reads, setReads] = useState({});
  const retry = useCallback(async section => {
    const version = (generation.current[section] || 0) + 1;
    generation.current[section] = version;
    setReads(previous => ({ ...previous, [section]: { rows: [], failures: [], ...previous[section], loading: true } }));
    const result = await readAuthorizedBranches(BRANCH_DETAILS, BRANCH_DASHBOARD_READS[section], new URLSearchParams(query));
    if (generation.current[section] !== version) return;
    setReads(previous => ({ ...previous, [section]: { ...result, loading: false } }));
  }, [query]);
  useEffect(() => {
    sections.forEach(section => { retry(section); });
    return () => { sections.forEach(section => { generation.current[section] = (generation.current[section] || 0) + 1; }); };
  }, [sections, retry]);
  return {
    reads: Object.fromEntries(sections.map(section => [section, { rows: [], failures: [], loading: true, ...reads[section] }])),
    retry,
  };
}
