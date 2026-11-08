import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { useAuth } from '../../hooks/useAuth';

export default function Register() {
  const { registerUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    if (form.password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (form.password !== form.confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      // Registration deliberately creates a normal rider-role identity first.
      // Driver privileges are granted only by the protected admin review RPC.
      const result = await registerUser({ fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password, role: 'rider' });
      if (result.session) navigate('/apply', { replace: true });
      else setNotice('Your account was created. Check your email to confirm the address, then sign in here and complete your driver application. Your account is not a driver until an admin approves it.');
    } catch (e) { setError(e.message || 'Could not create your account.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen flex items-center justify-center p-5 bg-gray-50">
    <form onSubmit={submit} className="w-full max-w-lg bg-white p-7 md:p-9 rounded-3xl shadow-sm border space-y-4">
      <div><p className="text-sm font-bold text-blue-600">EAZI'S RIDE · DRIVER PORTAL</p><h1 className="text-3xl font-bold mt-2">Start driving with us</h1><p className="text-gray-500 mt-2">Create an account here. You do not need to install or register through the rider app.</p></div>
      {error && <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 rounded-xl bg-green-50 text-green-800 text-sm">{notice}</div>}
      <label className="block text-sm font-semibold">Full name<Input autoComplete="name" value={form.fullName} onChange={set('fullName')} required maxLength={120} /></label>
      <label className="block text-sm font-semibold">Phone number<Input autoComplete="tel" type="tel" value={form.phone} onChange={set('phone')} required maxLength={30} /></label>
      <label className="block text-sm font-semibold">Email address<Input autoComplete="email" type="email" value={form.email} onChange={set('email')} required maxLength={254} /></label>
      <label className="block text-sm font-semibold">Password<Input autoComplete="new-password" type="password" value={form.password} onChange={set('password')} required minLength={8} /></label>
      <label className="block text-sm font-semibold">Confirm password<Input autoComplete="new-password" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required minLength={8} /></label>
      <Button type="submit" className="w-full py-3" disabled={busy}>{busy ? 'Creating account…' : 'Create account and continue'}</Button>
      <p className="text-sm text-center text-gray-500">Already registered? <Link className="font-semibold text-blue-600" to="/login">Sign in</Link></p>
      <p className="text-xs text-gray-500">Creating an account does not grant driver access. Submit your application and required documents; an administrator must approve it before you can go online.</p>
    </form>
  </main>;
}
