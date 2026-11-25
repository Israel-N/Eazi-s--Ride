import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { useAuth } from '../../hooks/useAuth';

const Login = () => {
  const { loginUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginUser(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <form onSubmit={submit} className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border space-y-5">
        <div><h1 className="text-3xl font-bold">Driver sign in</h1><p className="text-gray-500 mt-1">Use the account approved for driving on Eazi's Ride</p></div>
        {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" className="w-full py-3" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</Button>
        <p className="text-center text-sm text-gray-500">Not approved as a driver yet? Sign in with your rider account to open the application form.</p>
      </form>
    </div>
  );
};

export default Login;
