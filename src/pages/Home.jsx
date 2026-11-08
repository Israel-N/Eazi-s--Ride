import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, History, Wallet, User, LogOut, Navigation, ShieldCheck, Share2 } from 'lucide-react';
import Button from '../components/Button';
import { useAuth } from '../hooks/useAuth';
import { getMyRides } from '../services/rideService';

const Home = () => {
  const navigate = useNavigate();
  const { profile, logoutUser } = useAuth();
  const driverAppUrl = import.meta.env.VITE_DRIVER_APP_URL || 'http://localhost:5174';
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyRides().then(rides => setActiveRide(rides.find(r => ['requested','accepted','arriving','arrived','in_progress'].includes(r.status)) || null)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const share = async () => {
    const text = 'EaziRide makes getting around simple. Book a ride and share your trip with people you trust.';
    try { if (navigator.share) await navigator.share({ title: 'EaziRide', text }); else await navigator.clipboard.writeText(text); } catch {}
  };

  const menuItems = [
    { icon: <Car />, label: 'Book a Ride', path: '/booking', color: 'bg-blue-100 text-blue-600' },
    { icon: <History />, label: 'History', path: '/history', color: 'bg-purple-100 text-purple-600' },
    { icon: <Wallet />, label: 'Wallet', path: '/wallet', color: 'bg-green-100 text-green-600' },
    { icon: <User />, label: 'Profile', path: '/profile', color: 'bg-orange-100 text-orange-600' },
    ...(profile?.role === 'rider' ? [{ icon: <ShieldCheck />, label: 'Apply to Drive', href: `${driverAppUrl}/apply`, color: 'bg-indigo-100 text-indigo-600' }] : []),
  ];

  return <div className="p-5 max-w-2xl mx-auto">
    <header className="mb-6 flex justify-between items-start"><div><h1 className="text-3xl font-bold">Eazi's Ride</h1><p className="text-gray-500">Hi {profile?.full_name?.split(' ')[0] || 'there'}, where to today?</p></div><button onClick={async()=>{await logoutUser();navigate('/login')}} className="p-2 text-red-600"><LogOut size={20}/></button></header>

    {activeRide && <button onClick={()=>navigate('/tracking')} className="w-full text-left mb-5 p-5 rounded-2xl bg-blue-600 text-white shadow-lg"><div className="flex justify-between items-center"><div><p className="text-blue-100 text-xs uppercase font-bold">Active ride</p><h3 className="font-bold text-lg mt-1">{String(activeRide.status).replace('_',' ')}</h3></div><Navigation size={24}/></div><p className="text-sm mt-3 truncate">🟢 {activeRide.pickup_address}</p><p className="text-sm truncate">🔴 {activeRide.destination_address}</p></button>}

    <div className="grid grid-cols-2 gap-4">{menuItems.map(item => <button key={item.href || item.path} onClick={()=>item.href ? window.location.assign(item.href) : navigate(item.path)} className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border hover:shadow-md"><div className={`p-3 rounded-xl mb-3 ${item.color}`}>{item.icon}</div><span className="font-medium">{item.label}</span></button>)}</div>

    <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={()=>navigate('/booking')} className="p-4 bg-white border rounded-2xl text-left"><Car className="text-blue-600 mb-2"/><b>Book now</b><p className="text-xs text-gray-500">Choose Economy, Comfort or XL</p></button><button onClick={share} className="p-4 bg-white border rounded-2xl text-left"><Share2 className="text-blue-600 mb-2"/><b>Invite friends</b><p className="text-xs text-gray-500">Share Eazi's Ride</p></button></div>

    <div className="mt-6 p-5 bg-gray-900 text-white rounded-2xl flex gap-3"><ShieldCheck className="text-green-400"/><div><h3 className="font-bold">Safety first</h3><p className="text-gray-300 text-sm">Share your trip and use the safety tools while you ride.</p></div></div>
    {profile?.role === 'driver' && <button onClick={()=>window.location.assign(driverAppUrl)} className="mt-4 w-full p-4 bg-gray-900 text-white rounded-2xl font-semibold">Open Driver Dashboard</button>}
  </div>;
};
export default Home;
