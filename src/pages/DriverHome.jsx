import React, { useEffect, useRef, useState, useCallback } from 'react';
import MapView from '../components/MapView';
import Button from '../components/Button';
import { Power, User, Navigation, MapPin, Radio, RefreshCw } from 'lucide-react';
import {
  getMyDriverProfile,
  updateDriverOnline,
  updateDriverLocation,
  getNearbyOpenRideRequests,
} from '../services/driverService';
import { acceptRide, declineRideRequest, updateRideStatus, subscribeToOpenRides, getMyRides, subscribeToRide } from '../services/rideService';

const DriverHome = () => {
  const [driver, setDriver] = useState(null);
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const watchId = useRef(null);
  const lastLocation = useRef(null);
  const lastUploadAt = useRef(0);
  const driverRef = useRef(null);

  const loadRequests = useCallback(async (location = lastLocation.current) => {
    if (!location || !driverRef.current?.is_online || !driverRef.current?.is_approved) { setRequests([]); return; }
    try {
      const nearby = await getNearbyOpenRideRequests({
        latitude: location.lat,
        longitude: location.lng,
        radiusKm: 10,
      });
      setRequests(nearby);
    } catch (e) {
      setError(e.message || 'Could not load nearby ride requests.');
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const profile = await getMyDriverProfile();
      driverRef.current = profile;
      setDriver(profile);
      const myRides = await getMyRides();
      const current = myRides.find((ride) => ride.driver_id === profile?.user_id && ['accepted', 'arriving', 'arrived', 'in_progress'].includes(ride.status));
      setActiveRide(current || null);
      if (profile?.is_online && profile?.is_approved && profile?.latitude != null && profile?.longitude != null) {
        lastLocation.current = { lat: profile.latitude, lng: profile.longitude };
        await loadRequests(lastLocation.current);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [loadRequests]);

  useEffect(() => {
    load();
    const channel = subscribeToOpenRides(() => loadRequests());
    return () => channel && channel.unsubscribe();
  }, [load, loadRequests]);

  useEffect(() => {
    if (!driver?.is_online || !navigator.geolocation) return undefined;

    watchId.current = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        const previous = lastLocation.current;
        lastLocation.current = next;
        setDriver((current) => current ? { ...current, latitude: next.lat, longitude: next.lng } : current);

        const now = Date.now();
        const movedEnough = !previous || Math.abs(previous.lat - next.lat) > 0.00005 || Math.abs(previous.lng - next.lng) > 0.00005;
        if (now - lastUploadAt.current >= 5000 && movedEnough) {
          lastUploadAt.current = now;
          try { await updateDriverLocation({ latitude: next.lat, longitude: next.lng }); } catch (e) { setError(e.message); }
          await loadRequests(next);
        }
      },
      () => setError('Live location is unavailable. Allow location access to receive nearby rides.'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [driver?.is_online, loadRequests]);

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (!driver?.is_approved) throw new Error('Your driver account is awaiting admin approval.');
      if (!driver?.is_online) {
        if (!navigator.geolocation) throw new Error('This browser does not support location.');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }));
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        await updateDriverLocation({ latitude: location.lat, longitude: location.lng });
        lastLocation.current = location;
        lastUploadAt.current = Date.now();
        const updated = await updateDriverOnline(true);
        driverRef.current = updated;
        setDriver(updated);
        await loadRequests(location);
      } else {
        const updated = await updateDriverOnline(false);
        driverRef.current = updated;
        setDriver(updated);
        setRequests([]);
      }
    } catch (e) {
      setError(e.code === 1 ? 'Location permission was denied. Allow location access before going online.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const takeRide = async (ride) => {
    setBusy(true);
    setError('');
    try {
      const accepted = await acceptRide(ride.id);
      setActiveRide(accepted);
      setRequests((prev) => prev.filter((r) => r.id !== ride.id));
    } catch (e) {
      setError(e.message || 'Ride was already taken.');
      await loadRequests();
    } finally {
      setBusy(false);
    }
  };

  const decline = async (ride) => {
    setBusy(true);
    setError('');
    try {
      await declineRideRequest(ride.id);
      setRequests((current) => current.filter((item) => item.id !== ride.id));
    } catch (e) { setError(e.message || 'Could not decline this request.'); }
    finally { setBusy(false); }
  };

  const advance = async () => {
    if (!activeRide) return;
    const next = activeRide.status === 'accepted' ? 'arriving' : activeRide.status === 'arriving' ? 'arrived' : activeRide.status === 'arrived' ? 'in_progress' : 'completed';
    try {
      const updated = await updateRideStatus(activeRide.id, next);
      setActiveRide(next === 'completed' ? null : updated);
      if (next === 'completed') await load();
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (!activeRide?.id) return undefined;
    const channel = subscribeToRide(activeRide.id, (payload) => {
      if (payload?.new) setActiveRide(['completed', 'cancelled'].includes(payload.new.status) ? null : payload.new);
    });
    return () => { if (channel) channel.unsubscribe(); };
  }, [activeRide?.id]);

  const isOnline = !!driver?.is_online;
  const location = driver?.latitude != null && driver?.longitude != null ? { lat: driver.latitude, lng: driver.longitude } : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="p-4 bg-white flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center"><User className="text-gray-400" /></div>
          <div>
            <p className="font-bold">{driver?.full_name || 'Driver'}</p>
            <p className="text-xs text-gray-500">{Number(driver?.rating || 5).toFixed(1)} ★ · {driver?.total_rides || 0} rides</p>
          </div>
        </div>
        <button disabled={busy || !driver || !driver.is_approved} onClick={toggle} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${isOnline ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          <Power size={16} />{isOnline ? 'ONLINE' : 'OFFLINE'}
        </button>
      </header>

      {!driver?.is_approved && <div className="mx-4 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Your driver account is not approved yet. Ask an Eazi's Ride admin to verify and approve your driver profile before going online.</div>}

      <div className="h-56 p-3">
        <MapView driverLocation={location} />
      </div>

      {error && <div className="mx-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl">{error}</div>}

      {activeRide ? (
        <div className="m-4 bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex items-center gap-2 text-blue-600 font-bold mb-3"><Navigation size={18} /> Active trip</div>
          <p className="text-sm"><MapPin className="inline text-green-500" size={15} /> {activeRide.pickup_address}</p>
          <p className="text-sm mt-2"><MapPin className="inline text-red-500" size={15} /> {activeRide.destination_address}</p>
          <div className="flex justify-between mt-4 pt-4 border-t"><span>₵{Number(activeRide.fare).toFixed(2)}</span><span className="font-bold uppercase">{activeRide.status}</span></div>
          <Button className="w-full mt-4" onClick={advance}>{activeRide.status === 'accepted' ? 'Start driving to pickup' : activeRide.status === 'arriving' ? 'I have arrived' : activeRide.status === 'arrived' ? 'Start trip' : 'Complete trip'}</Button>
        </div>
      ) : (
        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <div><h2 className="font-bold text-lg">Nearby ride requests</h2><p className="text-xs text-gray-500">Requests within about 10 km of your live location.</p></div>
            <button onClick={() => loadRequests()} disabled={!isOnline} className="p-2 rounded-xl bg-white border"><RefreshCw size={17} /></button>
          </div>
          {!isOnline ? (
            <div className="bg-white rounded-2xl p-6 text-center text-gray-500"><Radio className="mx-auto mb-2" />Go online to receive nearby ride requests.</div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-gray-500">No nearby requests right now. Keep the app open and your location on.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((ride) => (
                <div key={ride.id} className="bg-white rounded-2xl p-4 border shadow-sm">
                  <div className="flex justify-between items-start"><div><p className="font-bold">₵{Number(ride.fare).toFixed(2)}</p><p className="text-xs text-gray-500">{ride.ride_type || 'economy'} · {ride.distance ? `${ride.distance} km` : 'distance unavailable'}</p></div><span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">NEW</span></div>
                  <p className="text-sm mt-3">🟢 {ride.pickup_address}</p><p className="text-sm mt-2">🔴 {ride.destination_address}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4"><Button className="w-full" onClick={() => takeRide(ride)} disabled={busy}>Accept ride</Button><Button variant="secondary" className="w-full" onClick={() => decline(ride)} disabled={busy}>Decline</Button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverHome;
