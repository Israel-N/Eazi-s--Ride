import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Settings, LogOut, User } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, logoutUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ full_name: profile?.full_name || '', phone: profile?.phone || '' });
  }, [profile]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name, phone: form.phone, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (updateError) setError(updateError.message);
    else { await refreshProfile(); setEditing(false); }
    setSaving(false);
  };

  const logout = async () => {
    await logoutUser();
    navigate('/login', { replace: true });
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <header className="flex items-center gap-4 mb-8"><button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={24} /></button><h1 className="text-2xl font-bold">Profile</h1></header>
      <div className="flex flex-col items-center mb-10">
        <div className="w-24 h-24 bg-gray-200 rounded-full mb-4 overflow-hidden border-4 border-white shadow-lg flex items-center justify-center"><User size={40} className="text-gray-400" /></div>
        <h2 className="text-xl font-bold">{profile?.full_name || 'EaziRide user'}</h2>
        <p className="text-gray-500 text-sm">{profile?.created_at ? `Member since ${new Date(profile.created_at).getFullYear()}` : 'EaziRide member'}</p>
      </div>
      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
      {editing ? (
        <form onSubmit={save} className="space-y-4 mb-6"><Input placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /><Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /><div className="flex gap-3"><Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div></form>
      ) : (
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl"><Mail className="text-gray-400" size={20} /><div><p className="text-xs text-gray-500">Email</p><p className="font-medium">{user?.email}</p></div></div>
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl"><Phone className="text-gray-400" size={20} /><div><p className="text-xs text-gray-500">Phone</p><p className="font-medium">{profile?.phone || 'Not added'}</p></div></div>
        </div>
      )}
      {!editing && <div className="pt-6 border-t space-y-2"><button onClick={() => setEditing(true)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl"><div className="flex items-center gap-4"><Settings className="text-gray-600" size={20} /><span className="font-medium">Edit profile</span></div><span className="text-gray-400">›</span></button><button onClick={logout} className="w-full flex items-center justify-between p-4 hover:bg-red-50 rounded-xl"><div className="flex items-center gap-4"><LogOut className="text-red-600" size={20} /><span className="font-medium text-red-600">Logout</span></div></button></div>}
    </div>
  );
};
export default Profile;
