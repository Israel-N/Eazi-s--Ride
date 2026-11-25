import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Drivers from './pages/Drivers';
import Rides from './pages/Rides';
import Users from './pages/Users';
import Payments from './pages/Payments';

const AdminOnly = () => {
  const { user, profile, loading, logoutUser } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role !== 'admin') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md bg-white border border-line rounded-xl p-8 space-y-4">
          <h1 className="text-xl font-bold">Admin access required</h1>
          <p className="text-muted">This account is not an admin account. Admin roles are granted in the Supabase SQL editor, never from this app.</p>
          <button onClick={logoutUser} className="rounded-lg bg-ink text-white px-4 py-2 font-semibold">Sign out</button>
        </div>
      </main>
    );
  }
  return <Layout />;
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AdminOnly />}>
            <Route path="/" element={<Overview />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/rides" element={<Rides />} />
            <Route path="/users" element={<Users />} />
            <Route path="/payments" element={<Payments />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
