import React, { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePaged } from '../hooks/usePaged';
import { Chips, DataTable, ErrorNote, Notice, PageHeader, Pager, Pill, when } from '../components/ui';

const APP_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

function Applications() {
  const [status, setStatus] = useState('pending');
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: e } = await supabase.from('driver_applications').select('*').eq('status', status).order('submitted_at', { ascending: false });
    if (e) setError(e.message); else setApps(data || []);
    setLoading(false);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const review = async (app, action) => {
    const reason = (reasons[app.id] || '').trim();
    if (action !== 'approve' && !reason && !window.confirm('Continue without a reason?')) return;
    setWorkingId(app.id); setError(''); setNotice('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-driver-review', { body: { application_id: app.id, action, reason } });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      const done = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reinstate: 'reinstated' }[action];
      setNotice(`${app.full_name} was ${done}.`);
      await load();
    } catch (e) {
      let message = e?.message || 'The review failed.';
      // Supabase FunctionsHttpError stores the HTTP Response in `context`.
      // Read its JSON error when available so a 401/403/SQL error is visible
      // instead of only showing the generic non-2xx message.
      if (e?.context && typeof e.context.json === 'function') {
        try {
          const details = await e.context.json();
          if (details?.error) message = details.error;
        } catch { /* The response may not contain JSON. Keep the original message. */ }
      }
      setError(`${message} If this is a network/CORS error, deploy admin-driver-review and include this app's origin in the comma-separated APP_ORIGINS secret.`);
    } finally { setWorkingId(''); }
  };

  const openDocument = async (path) => {
    const { data, error: e } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60);
    if (e) setError(e.message); else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const field = (k, v) => <p><span className="text-muted">{k}: </span>{v}</p>;
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Chips options={APP_STATUSES} value={status} onChange={setStatus} />
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50"><RefreshCw size={15} />{loading ? 'Refreshing' : 'Refresh'}</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Notice>{notice}</Notice>
      {!loading && apps.length === 0 && <div className="bg-white border border-line rounded-xl p-10 text-center text-muted">No {status} applications.</div>}
      <div className="space-y-4">
        {apps.map((app) => (
          <article key={app.id} className="bg-white border border-line rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{app.full_name}</h2><Pill value={app.status} /></div>
                <p className="text-sm text-muted mt-1">Submitted {when(app.submitted_at)}</p>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 mt-4 text-sm">
                  {field('Phone', app.phone)}{field('Licence', app.license_number)}
                  {field('Vehicle', `${app.vehicle_make} ${app.vehicle_model}`)}{field('Colour', app.vehicle_color)}
                  {field('Plate', app.license_plate)}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {app.license_document_path && <button onClick={() => openDocument(app.license_document_path)} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold"><FileText size={15} />View licence</button>}
                  {app.vehicle_document_path && <button onClick={() => openDocument(app.vehicle_document_path)} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold"><FileText size={15} />View vehicle document</button>}
                  {!app.license_document_path && !app.vehicle_document_path && <span className="text-sm text-muted">No documents uploaded.</span>}
                </div>
                {app.review_reason && <p className="mt-4 rounded-lg bg-chalk p-3 text-sm text-muted">Review note: {app.review_reason}</p>}
              </div>
              {status !== 'rejected' && (
                <div className="w-full md:max-w-xs">
                  <label className="block text-sm font-semibold mb-1" htmlFor={`r-${app.id}`}>{status === 'pending' ? 'Note or rejection reason' : 'Reason for this change'}</label>
                  <textarea id={`r-${app.id}`} rows={3} maxLength={500} value={reasons[app.id] || ''} onChange={(e) => setReasons((p) => ({ ...p, [app.id]: e.target.value }))} className="w-full rounded-lg border border-line p-3 text-sm" placeholder="Recorded in the audit log" />
                  {status === 'pending' ? (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => review(app, 'approve')} disabled={!!workingId} className="flex-1 rounded-lg bg-go text-white py-2.5 text-sm font-semibold disabled:opacity-50">{workingId === app.id ? 'Saving…' : 'Approve'}</button>
                      <button onClick={() => review(app, 'reject')} disabled={!!workingId} className="flex-1 rounded-lg bg-stop text-white py-2.5 text-sm font-semibold disabled:opacity-50">Reject</button>
                    </div>
                  ) : (
                    <button onClick={() => review(app, status === 'approved' ? 'suspend' : 'reinstate')} disabled={!!workingId} className="mt-2 w-full rounded-lg bg-ink text-white py-2.5 text-sm font-semibold disabled:opacity-50">
                      {workingId === app.id ? 'Saving…' : status === 'approved' ? 'Suspend driver' : 'Reinstate driver'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted max-w-prose">Check the original documents and local licensing rules before approving. This screen records your decision; it cannot tell whether a document is genuine.</p>
    </>
  );
}

function ActiveDrivers() {
  const [filter, setFilter] = useState('all');
  const t = usePaged(() => {
    let q = supabase.from('driver_profiles').select('id,full_name,vehicle_make,vehicle_model,vehicle_color,license_plate,rating,total_rides,total_earnings,is_online,application_status,updated_at', { count: 'exact' }).order('is_online', { ascending: false }).order('updated_at', { ascending: false });
    if (filter === 'online') q = q.eq('is_online', true);
    if (filter === 'suspended') q = q.eq('application_status', 'suspended');
    return q;
  }, [filter]);
  return (
    <>
      <Chips options={['all', 'online', 'suspended']} value={filter} onChange={setFilter} />
      <ErrorNote>{t.error}</ErrorNote>
      <DataTable rows={t.rows} loading={t.loading} empty="No drivers in this view." columns={[
        { key: 'name', label: 'Driver', render: (r) => <span className="font-semibold">{r.full_name || 'No name'}</span> },
        { key: 'online', label: 'Availability', render: (r) => <Pill value={r.is_online ? 'online' : 'offline'} /> },
        { key: 'vehicle', label: 'Vehicle', render: (r) => `${[r.vehicle_color, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ')} ${r.license_plate ? `(${r.license_plate})` : ''}` },
        { key: 'rating', label: 'Rating', className: 'num', render: (r) => Number(r.rating || 0).toFixed(2) },
        { key: 'trips', label: 'Trips', className: 'num', render: (r) => r.total_rides },
        { key: 'status', label: 'Account', render: (r) => <Pill value={r.application_status} /> },
      ]} />
      <Pager page={t.page} pageSize={t.pageSize} count={t.count} onPage={t.setPage} />
    </>
  );
}

export default function Drivers() {
  const [tab, setTab] = useState('applications');
  return (
    <>
      <PageHeader title="Drivers" note="Approve new drivers and see who is on the road." />
      <div className="flex gap-6 border-b border-line mb-5" role="tablist">
        {[['applications', 'Applications'], ['drivers', 'All drivers']].map(([k, text]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`pb-2 -mb-px text-sm font-semibold border-b-2 ${tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{text}</button>
        ))}
      </div>
      {tab === 'applications' ? <Applications /> : <ActiveDrivers />}
    </>
  );
}
