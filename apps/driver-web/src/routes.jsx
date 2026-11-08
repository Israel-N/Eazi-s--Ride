import React from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import DriverHome from './pages/DriverHome';
import DriverApplication from './pages/DriverApplication';

const Splash = ({ text }) => <div className="min-h-screen flex items-center justify-center text-gray-500">{text}</div>;

// Driver applications are available to signed-in rider accounts. Admins must use the admin portal.
const ApplicationRoute = () => {
  const { user, profile, loading, logoutUser } = useAuth();
  if (loading) return <Splash text="Loading account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: '/apply' }} />;
  if (profile?.role === 'admin') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md bg-white border rounded-3xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold">Admin account</h1>
          <p className="text-gray-600">Admin accounts cannot submit driver applications. Use the admin dashboard to review applications.</p>
          <button onClick={logoutUser} className="rounded-xl bg-gray-900 text-white px-5 py-3 font-semibold">Sign out</button>
        </div>
      </main>
    );
  }
  return <DriverApplication />;
};

// The driver dashboard is restricted to approved driver-role accounts. Rider accounts can use /apply.
// Admins use the separate admin app. Database RPCs still enforce the same rules.
const DriverShell = () => {
  const { user, profile, loading, logoutUser } = useAuth();
  const location = useLocation();
  if (loading) return <Splash text="Loading driver dashboard…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (profile && profile.role !== 'driver') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md bg-white border rounded-3xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold">This is the driver app</h1>
          <p className="text-gray-600">
            {profile.role === 'rider'
              ? 'Your account is a rider account. Submit your driver application here. After an administrator approves it, sign in again to access the driver dashboard.'
              : 'Your account does not have driver access. Use the admin dashboard instead.'}
          </p>
          {profile.role === 'rider' && <Link to="/apply" className="inline-block rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold">Apply to drive</Link>}
          <button onClick={logoutUser} className="block mx-auto rounded-xl bg-gray-900 text-white px-5 py-3 font-semibold">Sign out</button>
        </div>
      </main>
    );
  }
  return (
    <>
      <header className="max-w-2xl mx-auto px-5 pt-5 flex items-center justify-between">
        <div>
          <p className="font-bold text-lg">Eazi's Ride Driver</p>
          <p className="text-sm text-gray-500">{profile?.full_name}</p>
        </div>
        <button onClick={logoutUser} className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 p-2"><LogOut size={18} />Sign out</button>
      </header>
      <Outlet />
    </>
  );
};

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/apply" element={<ApplicationRoute />} />
      <Route element={<DriverShell />}>
        <Route path="/" element={<DriverHome />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
