import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { useAuth } from '../../hooks/useAuth';

const Register = () => {
  const { registerUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await registerUser(form);
      if (data.session) navigate('/');
      else setMessage('Account created. Check your email to confirm your account, then sign in.');
    } catch (err) {
      setError(err.message || 'Fuck off mate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <form onSubmit={submit} className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border space-y-4">
        <div className="mb-2"><h1 className="text-3xl font-bold">Create account</h1><p className="text-gray-500 mt-1">Join Eazi's Ride as a rider</p></div>
        {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
        {message && <div className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">{message}</div>}
        <Input placeholder="Full name" value={form.fullName} onChange={update('fullName')} required />
        <Input type="email" placeholder="Email" value={form.email} onChange={update('email')} required />
        <Input type="tel" placeholder="Phone number" value={form.phone} onChange={update('phone')} required />
        <Input type="password" placeholder="Password (minimum 6 characters)" minLength={6} value={form.password} onChange={update('password')} required />
        <Button type="submit" className="w-full py-3" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</Button>
        <p className="text-center text-sm text-gray-500">Already have an account? <Link className="text-blue-600 font-semibold" to="/login">Sign in</Link></p>
      </form>
    </div>
  );
};

export default Register;
