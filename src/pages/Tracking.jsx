import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MapView from '../components/MapView';
import Stars from '../components/Stars';
import Button from '../components/Button';
import { Phone, MessageCircle, ShieldCheck, Share2, XCircle, Navigation, AlertTriangle, Send } from 'lucide-react';
import { useRides } from '../hooks/useRides';
import { getMyRides, getRide, subscribeToRide, cancelRide } from '../services/rideService';
import { getDriverProfile, subscribeToDriverLocation } from '../services/driverService';
import { getRideMessages, sendRideMessage, subscribeToMessages } from '../services/messageService';

const Tracking = () => {
  const navigate = useNavigate();
  const { currentRide, setCurrentRide } = useRides();
  const [ride, setRide] = useState(currentRide);
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const [showSafety, setShowSafety] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [locationClock, setLocationClock] = useState(Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setLocationClock(Date.now()), 5000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let channel;
    let messageChannel;
    let driverLocationChannel;
    let disposed = false;
    const load = async () => {
      try {
        let active = currentRide;
        if (!active?.id) {
          const rides = await getMyRides();
          active = rides.find(r => ['requested','accepted','arriving','arrived','in_progress'].includes(r.status));
        } else {
          active = await getRide(active.id);
        }
        if (!active || disposed) return;
        setRide(active);
        setCurrentRide(active);
        if (active.driver_id) {
          setDriver(await getDriverProfile(active.driver_id));
          driverLocationChannel = subscribeToDriverLocation(active.driver_id, (payload) => {
            if (payload?.new) setDriver((current) => ({ ...current, ...payload.new }));
          });
        }
        const initialMessages = await getRideMessages(active.id);
        if (disposed) { if (driverLocationChannel) driverLocationChannel.unsubscribe(); return; }
        setMessages(initialMessages);
        messageChannel = subscribeToMessages(active.id, (newMessage) => setMessages(prev => prev.some(item => item.id === newMessage.id) ? prev : [...prev, newMessage]));
        channel = subscribeToRide(active.id, async (payload) => {
          const next = payload.new;
          setRide(next);
          setCurrentRide(next);
          if (next.driver_id) {
            try {
              setDriver(await getDriverProfile(next.driver_id));
              if (!driverLocationChannel) {
                driverLocationChannel = subscribeToDriverLocation(next.driver_id, (locationPayload) => {
                  if (locationPayload?.new) setDriver((current) => ({ ...current, ...locationPayload.new }));
                });
              }
            } catch {}
          }
          if (next.status === 'completed') navigate('/completed');
        });
      } catch (e) {
        setError(e.message || 'Could not load your active ride.');
      }
    };
    load();
    return () => { disposed = true; channel && channel.unsubscribe(); messageChannel && messageChannel(); driverLocationChannel && driverLocationChannel.unsubscribe(); };
  }, [currentRide?.id, navigate, setCurrentRide]);

  const cancel = async () => {
    if (!ride?.id || !window.confirm('Cancel this ride?')) return;
    setCancelling(true);
    try {
      const updated = await cancelRide(ride.id);
      setRide(updated); setCurrentRide(updated);
    } catch (e) { setError(e.message); }
    finally { setCancelling(false); }
  };

  const shareTrip = async () => {
    const text = `I'm on Eazi's Ride trip from ${ride?.pickup_address} to ${ride?.destination_address}. Ride ID: ${ride?.id?.slice(0,8)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'EazisRide trip', text });
      else await navigator.clipboard.writeText(text);
    } catch {}
  };

  const sendMessage = async () => {
    if (!ride?.id || !message.trim()) return;
    try { await sendRideMessage(ride.id, message); setMessage(''); }
    catch (e) { setError(e.message); }
  };

  const statusText = {
    requested: 'Finding a nearby driver',
    accepted: 'Driver accepted your ride',
    arriving: 'Driver is on the way',
    arrived: 'Driver has arrived at pickup',
    in_progress: 'Ride in progress',
    completed: 'Ride completed',
    cancelled: 'Ride cancelled'
  }[ride?.status] || 'Preparing your ride';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-64 md:h-80"><MapView pickup={ride?.pickup_lat ? {lat:ride.pickup_lat,lng:ride.pickup_lng}:null} destination={ride?.destination_lat ? {lat:ride.destination_lat,lng:ride.destination_lng}:null} driverLocation={driver?.latitude != null && driver?.longitude != null ? {lat:driver.latitude,lng:driver.longitude}:null} /></div>
      <div className="bg-white rounded-t-3xl -mt-5 relative z-10 p-5 max-w-2xl w-full mx-auto shadow-xl">
        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
        <div className="flex justify-between items-start">
          <div><span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold uppercase">{statusText}</span><h2 className="text-xl font-bold mt-3">{driver?.vehicle_model || 'Finding your driver...'}</h2><p className="text-gray-500 text-sm">{driver?.vehicle_make ? `${driver.vehicle_make} · ${driver.vehicle_color || ''}` : 'EazisRide matching is active'}</p>{driver?.license_plate && <p className="font-mono font-bold mt-1">{driver.license_plate}</p>}</div>
          {driver && <div className="text-right"><div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center mx-auto"><span className="font-bold">{driver.full_name?.[0] || 'D'}</span></div><Stars rating={Number(driver.rating || 5)} /></div>}
        </div>

        {driver && ride?.driver_id && <p className="text-xs text-gray-500 mt-3">{!driver.location_updated_at ? 'Waiting for the driver’s first GPS update.' : locationClock - new Date(driver.location_updated_at).getTime() > 30000 ? 'Driver location is stale. Waiting for GPS updates…' : 'Live driver location is updating.'}</p>}

        {ride && <div className="my-5 p-4 bg-gray-50 rounded-2xl"><p className="text-sm">🟢 {ride.pickup_address}</p><div className="border-l border-dashed border-gray-300 h-4 ml-1" /><p className="text-sm">🔴 {ride.destination_address}</p></div>}

        <div className="grid grid-cols-4 gap-2 mb-4">
          {driver?.phone && <a href={`tel:${driver.phone}`} className="p-3 bg-gray-50 rounded-xl text-center"><Phone className="mx-auto text-blue-600" size={20}/><span className="text-[11px]">Call</span></a>}
          <button onClick={() => setShowChat(true)} className="p-3 bg-gray-50 rounded-xl text-center"><MessageCircle className="mx-auto text-blue-600" size={20}/><span className="text-[11px]">Chat</span></button>
          <button onClick={shareTrip} className="p-3 bg-gray-50 rounded-xl text-center"><Share2 className="mx-auto text-blue-600" size={20}/><span className="text-[11px]">Share</span></button>
          <button onClick={() => setShowSafety(true)} className="p-3 bg-green-50 rounded-xl text-center"><ShieldCheck className="mx-auto text-green-600" size={20}/><span className="text-[11px]">Safety</span></button>
        </div>

        {['requested','accepted','arriving','arrived'].includes(ride?.status) && <Button variant="danger" className="w-full py-3 flex items-center justify-center gap-2" onClick={cancel} disabled={cancelling}><XCircle size={18}/>{cancelling ? 'Cancelling...' : 'Cancel ride'}</Button>}
        {ride?.status === 'in_progress' && <div className="p-4 bg-blue-50 text-blue-800 rounded-xl flex gap-3"><Navigation size={20}/><div><b>You're on your way</b><p className="text-sm">Your trip status updates automatically.</p></div></div>}
      </div>

      {showChat && <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"><div className="bg-white rounded-t-3xl p-5 w-full max-w-2xl h-[70vh] flex flex-col"><div className="flex justify-between items-center mb-3"><h3 className="text-xl font-bold">Ride chat</h3><button onClick={() => setShowChat(false)}>✕</button></div><div className="flex-1 overflow-y-auto space-y-2 bg-gray-50 rounded-2xl p-3">{messages.length === 0 ? <p className="text-center text-gray-400 mt-10">No messages yet.</p> : messages.map(m => <div key={m.id} className={`p-3 rounded-2xl max-w-[80%] ${m.sender_id === ride?.rider_id ? 'ml-auto bg-blue-600 text-white' : 'bg-white border'}`}>{m.message}<div className="text-[10px] opacity-60 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div></div>)}</div><div className="flex gap-2 mt-3"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Type a message..." className="flex-1 border rounded-xl px-3 py-3"/><button onClick={sendMessage} className="bg-blue-600 text-white p-3 rounded-xl"><Send size={20}/></button></div></div></div>}

      {showSafety && <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-50"><div className="bg-white rounded-3xl p-6 max-w-sm w-full"><div className="flex items-center gap-3 mb-3"><AlertTriangle className="text-red-600"/><h3 className="text-xl font-bold">Safety tools</h3></div><p className="text-sm text-gray-500 mb-5">For an actual emergency, contact local emergency services. Eazi's Ride can also share your trip details with a trusted contact once that feature is configured.</p><Button variant="secondary" className="w-full" onClick={() => setShowSafety(false)}>Close</Button></div></div>}
    </div>
  );
};
export default Tracking;
