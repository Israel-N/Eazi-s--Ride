import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePaged } from '../hooks/usePaged';
import { Chips, DataTable, ErrorNote, PageHeader, Pager, Pill, ghs, when } from '../components/ui';

const STATUSES = ['all', 'review_required', 'pending', 'successful', 'failed', 'refunded'];

export default function Payments() {
  const [status, setStatus] = useState('all');
  const t = usePaged(() => {
    let q = supabase.from('payments')
      .select('id,amount,currency,method,provider,provider_reference,transaction_reference,status,created_at,paid_at,ride_id, payer:profiles!user_id(full_name,email)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    return q;
  }, [status]);

  return (
    <>
      <PageHeader title="Payments" note="Read-only. Payment state is written only by the Paystack Edge Functions." />
      {status === 'review_required' && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-signal">These payments came back from Paystack with an amount or currency that did not match the ride. Check each one in your Paystack dashboard before refunding or retrying.</p>
      )}
      <Chips options={STATUSES} value={status} onChange={setStatus} />
      <ErrorNote>{t.error}</ErrorNote>
      <DataTable rows={t.rows} loading={t.loading} empty="No payments in this view." columns={[
        { key: 'when', label: 'Created', render: (r) => <span className="num whitespace-nowrap">{when(r.created_at)}</span> },
        { key: 'payer', label: 'Paid by', render: (r) => <div><p>{r.payer?.full_name || 'Unknown'}</p><p className="text-muted break-all">{r.payer?.email}</p></div> },
        { key: 'method', label: 'Method', render: (r) => <span className="capitalize">{[r.method, r.provider].filter(Boolean).join(' via ') || 'Not recorded'}</span> },
        { key: 'ref', label: 'Reference', className: 'break-all num', render: (r) => r.provider_reference || r.transaction_reference || '' },
        { key: 'amount', label: 'Amount', className: 'num text-right whitespace-nowrap', render: (r) => (r.currency && r.currency !== 'GHS' ? `${r.currency} ${Number(r.amount).toFixed(2)}` : ghs(r.amount)) },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
      ]} />
      <Pager page={t.page} pageSize={t.pageSize} count={t.count} onPage={t.setPage} />
    </>
  );
}
