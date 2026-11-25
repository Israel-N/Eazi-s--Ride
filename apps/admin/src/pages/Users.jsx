import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePaged } from '../hooks/usePaged';
import { Chips, DataTable, ErrorNote, PageHeader, Pager, Pill, ghs, useSearch, when } from '../components/ui';

export default function Users() {
  const [role, setRole] = useState('all');
  const search = useSearch();
  const t = usePaged(() => {
    let q = supabase.from('profiles').select('id,full_name,email,phone,role,wallet_balance,created_at', { count: 'exact' }).order('created_at', { ascending: false });
    if (role !== 'all') q = q.eq('role', role);
    if (search.query) q = q.or(`full_name.ilike.%${search.query}%,email.ilike.%${search.query}%,phone.ilike.%${search.query}%`);
    return q;
  }, [role, search.query]);

  return (
    <>
      <PageHeader title="Users" note="Riders, drivers and admins. Roles are changed through driver approvals or the Supabase SQL editor, not here." />
      <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <Chips options={['all', 'rider', 'driver', 'admin']} value={role} onChange={setRole} />
        <label className="relative sm:ml-auto mb-4 block">
          <span className="sr-only">Search by name, email or phone</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input value={search.text} onChange={(e) => search.setText(e.target.value)} placeholder="Search name, email or phone" className="w-full sm:w-72 rounded-lg border border-line bg-white pl-9 pr-3 py-2 text-sm" />
        </label>
      </div>
      <ErrorNote>{t.error}</ErrorNote>
      <DataTable rows={t.rows} loading={t.loading} empty="No users match." columns={[
        { key: 'name', label: 'Name', render: (r) => <span className="font-semibold">{r.full_name || 'No name'}</span> },
        { key: 'role', label: 'Role', render: (r) => <Pill value={r.role} /> },
        { key: 'email', label: 'Email', className: 'break-all', render: (r) => r.email },
        { key: 'phone', label: 'Phone', className: 'num whitespace-nowrap', render: (r) => r.phone },
        { key: 'wallet', label: 'Wallet', className: 'num text-right whitespace-nowrap', render: (r) => ghs(r.wallet_balance) },
        { key: 'joined', label: 'Joined', className: 'num whitespace-nowrap', render: (r) => when(r.created_at) },
      ]} />
      <Pager page={t.page} pageSize={t.pageSize} count={t.count} onPage={t.setPage} />
    </>
  );
}
