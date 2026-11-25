import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const ghs = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (ts) => (ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const label = (s) => String(s || '').replace(/_/g, ' ');

const TONES = {
  neutral: 'bg-gray-100 text-gray-700',
  go: 'bg-green-50 text-go',
  stop: 'bg-red-50 text-stop',
  signal: 'bg-amber-50 text-signal',
  brand: 'bg-blue-50 text-brand',
};
const STATUS_TONE = {
  completed: 'go', successful: 'go', approved: 'go', online: 'go',
  cancelled: 'stop', failed: 'stop', rejected: 'stop', suspended: 'stop',
  requested: 'signal', pending: 'signal', review_required: 'signal',
  accepted: 'brand', arriving: 'brand', arrived: 'brand', in_progress: 'brand',
  admin: 'brand', driver: 'brand',
};
export const Pill = ({ value }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TONES[STATUS_TONE[value] || 'neutral']}`}>{label(value)}</span>
);

export const PageHeader = ({ title, note, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
    <div><h1 className="text-2xl font-bold">{title}</h1>{note && <p className="text-muted mt-1 max-w-prose">{note}</p>}</div>
    {children}
  </div>
);

export const Chips = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-2 mb-4" role="group">
    {options.map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const text = typeof o === 'string' ? label(o) : o.label;
      return (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize border ${value === v ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-line hover:text-ink'}`}>{text}</button>
      );
    })}
  </div>
);

export const ErrorNote = ({ children }) => children ? <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-stop">{children}</div> : null;
export const Notice = ({ children }) => children ? <div role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-go">{children}</div> : null;

// columns: [{ key, label, render?(row), className? }]
export function DataTable({ columns, rows, loading, empty }) {
  return (
    <div className="bg-white border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            {columns.map((c) => <th key={c.key} className={`px-4 py-3 font-semibold whitespace-nowrap ${c.className || ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted">Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 align-top">
              {columns.map((c) => <td key={c.key} className={`px-4 py-3 ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Pager = ({ page, pageSize, count, onPage }) => {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return count ? <p className="text-sm text-muted mt-3 num">{count} total</p> : null;
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-muted">
      <span className="num">{page * pageSize + 1}–{Math.min(count, (page + 1) * pageSize)} of {count}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page" className="p-2 rounded-lg border border-line bg-white disabled:opacity-40"><ChevronLeft size={16} /></button>
        <span className="px-2 num">Page {page + 1} of {pages}</span>
        <button onClick={() => onPage(page + 1)} disabled={page + 1 >= pages} aria-label="Next page" className="p-2 rounded-lg border border-line bg-white disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
};

// Debounced search text, with characters that would break a PostgREST .or() filter removed.
export function useSearch(delay = 300) {
  const [text, setText] = React.useState('');
  const [query, setQuery] = React.useState('');
  React.useEffect(() => { const t = setTimeout(() => setQuery(text.trim().replace(/[,()%*]/g, ' ')), delay); return () => clearTimeout(t); }, [text, delay]);
  return { text, setText, query };
}
