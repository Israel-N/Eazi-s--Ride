import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, RotateCcw, XCircle } from 'lucide-react';
import { getMyRides, cancelRide } from '../services/rideService';
import Button from '../components/Button';

const History = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => getMyRides().then(setRides).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  useEffect(load, []);

  const cancel = async (ride) => {
    if (!window.confirm('Cancel this ride?')) return;
    try { await cancelRide(ride.id); load(); } catch(e) { setError(e.message); }
  };

  return <div className="p-5 max-w-2xl mx-auto"><header className="flex items-center gap-4 mb-8"><button onClick={()=>navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={24}/></button><h1 className="text-2xl font-bold">Ride History</h1></header>{error&&<div className="p-3 mb-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}{loading?<p className="text-gray-500">Loading rides...</p>:rides.length===0?<div className="text-center py-12 text-gray-500">No rides yet. Book your first Eazi's ride trip.</div>:<div className="space-y-4">{rides.map(ride=>{const active=['requested','accepted','arriving','arrived','in_progress'].includes(ride.status);return <div key={ride.id} className="p-4 bg-white rounded-2xl border shadow-sm"><div className="flex justify-between items-start mb-3"><div className="flex items-center gap-2 text-xs text-gray-500"><Calendar size={14}/>{new Date(ride.created_at).toLocaleString()}</div><span className={`text-xs font-bold px-2 py-1 rounded-full ${ride.status==='completed'?'bg-green-100 text-green-600':ride.status==='cancelled'?'bg-gray-100 text-gray-500':'bg-blue-100 text-blue-600'}`}>{ride.status.replace('_',' ').toUpperCase()}</span></div><p className="text-sm font-medium">🟢 {ride.pickup_address}</p><p className="text-sm font-medium mt-2">🔴 {ride.destination_address}</p><div className="flex justify-between items-center pt-3 mt-3 border-t"><span className="text-lg font-bold">GH₵{Number(ride.fare||0).toFixed(2)}</span>{active?<button onClick={()=>cancel(ride)} className="text-red-600 text-sm flex items-center gap-1"><XCircle size={16}/> Cancel</button>:<Button variant="outline" className="py-2 px-3 flex items-center gap-1" onClick={()=>navigate('/booking')}><RotateCcw size={15}/> Rebook</Button>}</div></div>})}</div>}</div>;
};
export default History;
