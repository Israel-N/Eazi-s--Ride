import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Banknote, Car, IdCard, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/drivers', label: 'Drivers', icon: IdCard, badge: true },
  { to: '/rides', label: 'Rides', icon: Car },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/payments', label: 'Payments', icon: Banknote },
];

export default function Layout() {
  const { profile, logoutUser } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    supabase.from('driver_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPending(count || 0));
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="bg-white border-b lg:border-b-0 lg:border-r border-line lg:sticky lg:top-0 lg:h-screen flex lg:flex-col">
        <div className="px-5 py-4 lg:py-6 shrink-0">
          <p className="font-bold text-lg leading-tight">Eazi's Ride</p>
          <p className="text-sm text-muted">Operations</p>
        </div>
        <nav className="flex lg:flex-col gap-1 px-2 lg:px-3 overflow-x-auto flex-1 items-center lg:items-stretch" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'bg-ink text-white' : 'text-muted hover:text-ink hover:bg-chalk'}`}>
              <Icon size={18} />
              <span>{label}</span>
              {badge && pending > 0 && <span className="ml-auto rounded-full bg-signal text-white text-xs px-2 py-0.5 num" aria-label={`${pending} pending`}>{pending}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="hidden lg:block p-4 border-t border-line">
          <p className="text-sm font-semibold truncate">{profile?.full_name || 'Admin'}</p>
          <p className="text-xs text-muted truncate mb-3">{profile?.email}</p>
          <button onClick={logoutUser} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><LogOut size={16} />Sign out</button>
        </div>
        <button onClick={logoutUser} aria-label="Sign out" className="lg:hidden px-4 text-muted"><LogOut size={18} /></button>
      </aside>
      <main className="p-4 md:p-8 max-w-6xl w-full"><Outlet /></main>
    </div>
  );
}
