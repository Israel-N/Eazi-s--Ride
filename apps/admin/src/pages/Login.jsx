import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, profile, loginUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && profile?.role === 'admin') return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await loginUser(email, password); navigate('/', { replace: true }); }
    catch (err) { setError(err.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  };

  const field = 'w-full rounded-lg border border-line px-3 py-2.5 bg-white';
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-line rounded-xl p-8 space-y-4">
        <div><h1 className="text-2xl font-bold">Eazi's Ride Operations</h1><p className="text-muted mt-1">Sign in with your admin account.</p></div>
        {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-stop">{error}</div>}
        <label className="block text-sm font-semibold">Email<input className={`${field} mt-1 font-normal`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="block text-sm font-semibold">Password<input className={`${field} mt-1 font-normal`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button disabled={busy} className="w-full rounded-lg bg-brand text-white py-2.5 font-semibold disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
