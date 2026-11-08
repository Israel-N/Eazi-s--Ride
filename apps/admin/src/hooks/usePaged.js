import { useEffect, useState } from 'react';

// Runs a Supabase select (built by buildQuery, which must request { count: 'exact' }) one page at a time.
// Pass the filter values in deps; the page resets to the first one whenever they change.
export function usePaged(buildQuery, deps = [], pageSize = 25) {
  const [page, setPage] = useState(0);
  const [state, setState] = useState({ rows: [], count: 0, loading: true, error: '' });
  const depKey = JSON.stringify(deps);

  useEffect(() => { setPage(0); }, [depKey]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    buildQuery().range(page * pageSize, page * pageSize + pageSize - 1).then(({ data, count, error }) => {
      if (cancelled) return;
      setState({ rows: data || [], count: count || 0, loading: false, error: error ? error.message : '' });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, depKey]);

  return { ...state, page, setPage, pageSize };
}
