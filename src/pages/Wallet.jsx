import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, CreditCard, TrendingUp } from 'lucide-react';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const Wallet = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('payments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10).then(({ data }) => setPayments(data || []));
  }, [user]);

  return <div className="p-6 max-w-md mx-auto"><header className="flex items-center gap-4 mb-8"><button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={24} /></button><h1 className="text-2xl font-bold">Wallet</h1></header><div className="bg-blue-600 rounded-3xl p-8 text-white mb-8 shadow-xl"><p className="text-blue-100 text-sm mb-1">Current Balance</p><h2 className="text-4xl font-bold mb-8">GH₵ {Number(profile?.wallet_balance || 0).toFixed(2)}</h2><Button variant="secondary" className="w-full flex items-center justify-center gap-2 py-3 bg-white/20 border-none hover:bg-white/30 text-white"><Plus size={18} /> Add Funds</Button></div><h3 className="font-bold text-lg mb-4">Payment Methods</h3><div className="flex items-center justify-between p-4 bg-white rounded-2xl border mb-8"><div className="flex items-center gap-4"><div className="p-3 bg-gray-100 rounded-xl"><CreditCard className="text-gray-700" /></div><div><p className="font-bold">No card saved</p><p className="text-xs text-gray-500">Add a payment method when payments are enabled.</p></div></div></div><h3 className="font-bold text-lg mb-4">Recent Activity</h3>{payments.length === 0 ? <p className="text-sm text-gray-500">No payment activity yet.</p> : <div className="space-y-4">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between p-2"><div className="flex items-center gap-4"><div className="p-2 bg-green-50 rounded-full"><TrendingUp size={16} className="text-green-600" /></div><div><p className="font-medium text-sm">{payment.method || 'Ride Payment'}</p><p className="text-xs text-gray-500">{new Date(payment.created_at).toLocaleString()}</p></div></div><span className="font-bold text-red-600">-${Number(payment.amount || 0).toFixed(2)}</span></div>)}</div>}</div>;
};
export default Wallet;
