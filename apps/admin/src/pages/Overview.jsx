import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DataTable, ErrorNote, PageHeader, Pill, ghs, when } from '../components/ui';

const RECENT_SELECT = 'id,status,fare,created_at,pickup_address,destination_address, rider:profiles!rider_id(full_name), driver:profiles!driver_id(full_name)';

function DispatchStrip({ s }) {
  const items = [
    { k: 'Drivers online', v: s.drivers_online, sub: `of ${s.drivers_approved} approved` },
    { k: 'Waiting for a driver', v: s.rides_waiting, sub: 'requested rides', hot: s.rides_waiting > 0 },
    { k: 'Trips underway', v: s.rides_active, sub: 'accepted to in progress' },
    { k: 'Applications to review', v: s.pending_applications, sub: 'driver approvals', hot: s.pending_applications > 0, to: '/drivers' },
  ];
  return (
    <section aria-label="Live operations" className="bg-ink text-white rounded-xl p-5 md:p-6 mb-6">
      <div className="flex items-center gap-2 text-sm text-gray-300 mb-4">
        <span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-green-400" aria-hidden="true" />
        Live. Updates as rides and drivers change.
      </div>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
        {items.map((i) => {
          const body = (
            <>
              <dd className={`text-4xl font-bold num ${i.hot ? 'text-amber-400' : ''}`}>{i.v}</dd>
              <dt className="text-sm font-semibold mt-1">{i.k}</dt>
              <p className="text-xs text-gray-400">{i.sub}</p>
            </>
          );
          return i.to ? <Link key={i.k} to={i.to} className="block hover:opacity-90">{body}</Link> : <div key={i.k}>{body}</div>;
        })}
      </dl>
    </section>
  );
}

function RidesChart({ daily }) {
  const W = 600, H = 150, pad = 4;
  const max = Math.max(1, ...daily.map((d) => d.rides));
  const bw = (W - pad * 2) / Math.max(1, daily.length);
  const total = daily.reduce((n, d) => n + d.rides, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" role="img" aria-label={`Rides requested per day over the last ${daily.length} days: ${total} in total`}>
        {daily.map((d, i) => {
          const h = (d.rides / max) * H, hc = (d.completed / max) * H, x = pad + i * bw;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.rides} requested, ${d.completed} completed`}</title>
              <rect x={x + 3} y={H - h} width={bw - 6} height={h} rx="2" fill="#C7D7FB" />
              <rect x={x + 3} y={H - hc} width={bw - 6} height={hc} rx="2" fill="#2563EB" />
            </g>
          );
        })}
        <line x1="0" y1={H} x2={W} y2={H} stroke="#E3E7EC" />
        <text x={pad} y={H + 15} fontSize="11" fill="#667085">{daily[0]?.day}</text>
        <text x={W - pad} y={H + 15} fontSize="11" fill="#667085" textAnchor="end">{daily[daily.length - 1]?.day}</text>
      </svg>
      <figcaption className="text-xs text-muted mt-1">Light bars are rides requested, dark bars are rides completed. Busiest day: {max}.</figcaption>
    </figure>
  );
}

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const timer = useRef(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.rpc('admin_dashboard_stats', { p_days: 14 }),
      supabase.from('rides').select(RECENT_SELECT).order('created_at', { ascending: false }).limit(8),
    ]);
    if (s.error) { setError(`${s.error.message}. Apply supabase/migrations/202610280001_admin_dashboard_security.sql after the two earlier migrations.`); return; }
    setError(''); setStats(s.data); setRecent(r.data || []);
  }, []);

  useEffect(() => {
    load();
    const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 800); };
    const channel = supabase.channel('admin-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_applications' }, refresh)
      .subscribe();
    return () => { clearTimeout(timer.current); supabase.removeChannel(channel); };
  }, [load]);

  const attention = stats ? [
    stats.pending_applications > 0 && { to: '/drivers', text: `${stats.pending_applications} driver ${stats.pending_applications === 1 ? 'application is' : 'applications are'} waiting for review.` },
    stats.payments_in_review > 0 && { to: '/payments', text: `${stats.payments_in_review} ${stats.payments_in_review === 1 ? 'payment needs' : 'payments need'} a manual check against Paystack.` },
    stats.rides_waiting > 0 && stats.drivers_online === 0 && { to: '/drivers', text: 'Riders are waiting and no drivers are online.' },
  ].filter(Boolean) : [];

  return (
    <>
      <PageHeader title="Overview" />
      <ErrorNote>{error}</ErrorNote>
      {!stats && !error && <p className="text-muted">Loading…</p>}
      {stats && (
        <>
          <DispatchStrip s={stats} />
          <div className="grid lg:grid-cols-[1fr_2fr] gap-6 mb-6">
            <section>
              <h2 className="font-bold mb-3">Today</h2>
              <dl className="bg-white border border-line rounded-xl divide-y divide-line">
                {[['Rides requested', stats.rides_today], ['Rides completed', stats.completed_today], ['Payments collected', ghs(stats.collected_today)], ['Riders signed up in total', stats.riders]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-3"><dt className="text-muted">{k}</dt><dd className="font-semibold num">{v}</dd></div>
                ))}
              </dl>
            </section>
            <section>
              <h2 className="font-bold mb-3">Rides in the last 14 days</h2>
              <div className="bg-white border border-line rounded-xl p-4"><RidesChart daily={stats.daily || []} /></div>
            </section>
          </div>
          <section className="mb-6">
            <h2 className="font-bold mb-3">Needs attention</h2>
            <div className="bg-white border border-line rounded-xl px-4 py-3">
              {attention.length === 0 ? <p className="text-muted">Nothing needs attention right now.</p> : (
                <ul className="space-y-2">{attention.map((a) => <li key={a.text}><Link to={a.to} className="text-brand font-semibold hover:underline">{a.text}</Link></li>)}</ul>
              )}
            </div>
          </section>
          <section>
            <div className="flex items-baseline justify-between mb-3"><h2 className="font-bold">Latest rides</h2><Link to="/rides" className="text-sm text-brand font-semibold hover:underline">See all rides</Link></div>
            <DataTable rows={recent} empty="No rides yet." columns={[
              { key: 'when', label: 'Requested', render: (r) => <span className="num whitespace-nowrap">{when(r.created_at)}</span> },
              { key: 'rider', label: 'Rider', render: (r) => r.rider?.full_name || 'Unknown' },
              { key: 'route', label: 'Trip', render: (r) => <div className="max-w-xs"><p className="truncate">{r.pickup_address}</p><p className="truncate text-muted">to {r.destination_address}</p></div> },
              { key: 'fare', label: 'Fare', className: 'num text-right', render: (r) => ghs(r.fare) },
              { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> },
            ]} />
          </section>
        </>
      )}
    </>
  );
}
