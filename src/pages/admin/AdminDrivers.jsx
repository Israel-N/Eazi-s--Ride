import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const AdminDrivers = () => {
  const { profile, loading: authLoading } = useAuth();
  const [applications, setApplications] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [reasonById, setReasonById] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error: queryError } = await supabase.from('driver_applications').select('*')
        .eq('status', status).order('submitted_at', { ascending: false });
      if (queryError) throw queryError;
      setApplications(data || []);
    } catch (e) { setError(e.message || 'Could not load applications. Check the migration and admin role.'); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { if (profile?.role === 'admin') load(); }, [profile?.role, load]);

  const review = async (application, action) => {
    const reason = (reasonById[application.id] || '').trim();
    if (action !== 'approve' && !reason && !window.confirm('Continue without a review reason?')) return;
    setWorkingId(application.id); setError(''); setNotice('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-driver-review', {
        body: { application_id: application.id, action, reason },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setNotice(`Application ${action === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await load();
    } catch (e) { setError(e.message || 'Review action failed. Deploy the admin-driver-review Edge Function.'); }
    finally { setWorkingId(''); }
  };

  const openDocument = async (path) => {
    if (!path) { setError('No document was uploaded for this field.'); return; }
    const { data, error: storageError } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60);
    if (storageError) { setError(storageError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (authLoading) return <main className="max-w-5xl mx-auto p-6">Loading admin session…</main>;
  if (profile?.role !== 'admin') return <main className="max-w-3xl mx-auto p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><ShieldAlert className="inline mr-2"/>Administrator access is required.</div></main>;

  return <main className="max-w-6xl mx-auto p-4 md:p-8">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div><p className="text-sm font-bold tracking-widest text-blue-600">EAZI'S RIDE ADMIN</p><h1 className="text-3xl font-bold mt-1">Driver approvals</h1><p className="text-gray-500 mt-2">Review applications and verify documents before enabling driver access.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold disabled:opacity-50"><RefreshCw size={17}/>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="flex gap-2 flex-wrap mb-5">{['pending','approved','rejected','suspended'].map(s=><button key={s} onClick={()=>setStatus(s)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${status===s?'bg-blue-600 text-white':'bg-white border text-gray-600'}`}>{s}</button>)}</div>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</div>}
    {loading ? <p className="text-gray-500 py-10">Loading applications…</p> : applications.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center text-gray-500">No {status} driver applications.</div> : <div className="space-y-4">
      {applications.map(app=><article key={app.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{app.full_name}</h2><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold uppercase">{app.status}</span></div><p className="text-sm text-gray-500 mt-1">Submitted {new Date(app.submitted_at).toLocaleString()}</p><div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm"><p><span className="text-gray-500">Phone:</span> {app.phone}</p><p><span className="text-gray-500">Licence:</span> {app.license_number}</p><p><span className="text-gray-500">Vehicle:</span> {app.vehicle_make} {app.vehicle_model}</p><p><span className="text-gray-500">Colour:</span> {app.vehicle_color}</p><p><span className="text-gray-500">Plate:</span> {app.license_plate}</p><p className="break-all"><span className="text-gray-500">User ID:</span> {app.user_id}</p></div>
            <div className="flex flex-wrap gap-2 mt-4">{app.license_document_path && <button onClick={()=>openDocument(app.license_document_path)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FileText size={16}/> View licence</button>}{app.vehicle_document_path && <button onClick={()=>openDocument(app.vehicle_document_path)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FileText size={16}/> View vehicle document</button>}</div>
          </div>
          {(status === 'pending' || status === 'approved' || status === 'suspended') && <div className="w-full md:max-w-xs"><label className="block text-sm font-semibold mb-1" htmlFor={`reason-${app.id}`}>{status === 'pending' ? 'Review note / rejection reason' : 'Administrative reason'}</label><textarea id={`reason-${app.id}`} value={reasonById[app.id]||''} onChange={e=>setReasonById(prev=>({...prev,[app.id]:e.target.value}))} maxLength={500} rows={3} className="w-full rounded-xl border p-3 text-sm" placeholder="Record why this decision is being made"/>{status === 'pending' ? <div className="flex gap-2 mt-2"><button onClick={()=>review(app,'approve')} disabled={!!workingId} className="flex-1 inline-flex justify-center items-center gap-1 rounded-xl bg-green-600 text-white px-3 py-3 text-sm font-bold disabled:opacity-50"><CheckCircle2 size={16}/>{workingId===app.id?'Saving…':'Approve'}</button><button onClick={()=>review(app,'reject')} disabled={!!workingId} className="flex-1 inline-flex justify-center items-center gap-1 rounded-xl bg-red-600 text-white px-3 py-3 text-sm font-bold disabled:opacity-50"><XCircle size={16}/>Reject</button></div> : <button onClick={()=>review(app,status === 'approved' ? 'suspend' : 'reinstate')} disabled={!!workingId} className="mt-2 w-full rounded-xl bg-slate-800 text-white px-3 py-3 text-sm font-bold disabled:opacity-50">{workingId===app.id?'Saving…':status === 'approved' ? 'Suspend driver' : 'Reinstate driver'}</button>}</div>}
        </div>
        {app.review_reason && <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Review note: {app.review_reason}</p>}
      </article>)}
    </div>}
    <p className="mt-8 text-xs leading-5 text-gray-500">Verify original documents and local regulatory requirements before approval. This interface records an administrative decision; it does not independently verify the authenticity of documents.</p>
  </main>;
};
export default AdminDrivers;
