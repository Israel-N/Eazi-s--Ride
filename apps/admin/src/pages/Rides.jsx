import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePaged } from '../hooks/usePaged';
import { Chips, DataTable, ErrorNote, PageHeader, Pager, Pill, ghs, when } from '../components/ui';

const STATUSES = ['all', 'requested', 'accepted', 'arriving', 'arrived', 'in_progress', 'completed', 'cancelled'];
const SELECT = 'id,status,fare,distance,duration,created_at,completed_at,pickup_address,destination_address, rider:profiles!rider_id(full_name,phone), driver:profiles!driver_id(full_name)';

export default function Rides() {
  const [status, setStatus] = useState('all');
  const t = usePaged(() => {
    let q = supabase.from('rides').select(SELECT, { count: 'exact' }).order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    return q;
  }, [status]);

  return (
    <>
      <PageHeader title="Rides" note="Every ride request, newest first. Admins can read rides but cannot change them here." />
      <Chips options={STATUSES} value={status} onChange={setStatus} />
      <ErrorNote>{t.error}</ErrorNote>
      <DataTable rows={t.rows} loading={t.loading} empty={`No ${status === 'all' ? '' : status.replace('_', ' ') + ' '}rides.`} columns={[
        { key: 'when', label: 'Requested', render: (r) => <span className="num whitespace-nowrap">{when(r.created_at)}</span> },
        { key: 'rider', label: 'Rider', render: (r) => <div><p>{r.rider?.full_name || 'Unknown'}</p><p className="text-muted num">{r.rider?.phone}</p></div> },
        { key: 'driver', label: 'Driver', render: (r) => r.driver?.full_name || <span className="text-muted">Not assigned</span> },
        { key: 'route', label: 'Trip', render: (r) => <div className="max-w-xs"><p className="truncate">{r.pickup_address}</p><p className="truncate text-muted">to {r.destination_address}</p></div> },
        { key: 'size', label: 'Distance', className: 'num whitespace-nowrap', render: (r) => (r.distance ? `${Number(r.distance).toFixed(1)} km` : '') },
        { key: 'fare', label: 'Fare', className: 'num text-right whitespace-nowrap', render: (r) => ghs(r.fare) },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
      ]} />
      <Pager page={t.page} pageSize={t.pageSize} count={t.count} onPage={t.setPage} />
    </>
  );
}
