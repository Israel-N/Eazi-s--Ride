import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MapView from '../components/MapView';
import Input from '../components/Input';
import Button from '../components/Button';
import { ArrowLeft, MapPin, Navigation, LocateFixed, Clock3, Car, ChevronRight } from 'lucide-react';
import { createRide } from '../services/rideService';
import { getNearbyDriverCount } from '../services/driverService';
import { useRides } from '../hooks/useRides';
import { calculateFare, estimateDuration, RIDE_TYPES } from '../utils/fareCalculator';
import { getDistance } from '../utils/distance';

const geocode = async (query) => {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error('Could not find that destination.');
  const results = await response.json();
  if (!results[0]) throw new Error('Destination not found. Try a more specific address or place name.');
  return { lat: Number(results[0].lat), lng: Number(results[0].lon), label: results[0].display_name };
};

const Booking = () => {
  const navigate = useNavigate();
  const { setCurrentRide } = useRides();
  const [step, setStep] = useState(1);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [rideType, setRideType] = useState('economy');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [schedule, setSchedule] = useState('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [fare, setFare] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState(null);

  const distance = useMemo(() => (
    pickupCoords && destinationCoords
      ? getDistance(pickupCoords.lat, pickupCoords.lng, destinationCoords.lat, destinationCoords.lng)
      : 0
  ), [pickupCoords, destinationCoords]);

  const duration = useMemo(() => estimateDuration(distance), [distance]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return setError('Location is not supported by this browser.');
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPickupCoords({ lat: coords.latitude, lng: coords.longitude });
        setPickup('My current location');
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError('Location permission was denied. You can enter your pickup manually.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const chooseDestinationOnMap = async (coords) => {
    setError('');
    setDestinationCoords(coords);
    try {
      const result = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}`);
      if (result.ok) {
        const data = await result.json();
        setDestination(data.display_name || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
      }
    } catch {
      setDestination(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
    }
  };

  const mapDestinationPicker = (event) => {
    const { lat, lng } = event.latlng;
    chooseDestinationOnMap({ lat, lng });
  };

  const checkPrice = async () => {
    if (!pickup.trim() || !destination.trim()) {
      setError('Enter both pickup and destination.');
      return;
    }
    setError('');

    try {
      if (!pickupCoords) {
        setError('Choose your pickup using your current location or tap the map.');
        return;
      }

      let finalDestination = destinationCoords;
      if (!finalDestination) {
        finalDestination = await geocode(destination);
        setDestinationCoords(finalDestination);
        setDestination(finalDestination.label || destination);
      }

      const estimatedDistance = getDistance(
        pickupCoords.lat,
        pickupCoords.lng,
        finalDestination.lat,
        finalDestination.lng
      );
      const estimatedDuration = estimateDuration(estimatedDistance || 4);
      const estimated = calculateFare(estimatedDistance || 4, estimatedDuration, rideType);

      setFare(estimated);
      try {
        const count = await getNearbyDriverCount({
          latitude: pickupCoords.lat,
          longitude: pickupCoords.lng,
          radiusKm: 8,
        });
        setNearbyDrivers(count);
      } catch {
        setNearbyDrivers(null);
      }
      setStep(2);
    } catch (err) {
      setError(err.message || 'Could not calculate the route.');
    }
  };

  const handleConfirm = async () => {
    if (schedule === 'later' && !scheduledAt) {
      setError('Choose a date and time for your scheduled ride.');
      return;
    }
    if (!pickupCoords || !destinationCoords) {
      setError('Please choose valid pickup and destination locations first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ride = await createRide({
        pickup_address: pickup,
        destination_address: destination,
        pickup_lat: pickupCoords?.lat ?? null,
        pickup_lng: pickupCoords?.lng ?? null,
        destination_lat: destinationCoords?.lat ?? null,
        destination_lng: destinationCoords?.lng ?? null,
        fare,
        distance: Number(distance.toFixed(2)),
        duration,
        ride_type: rideType,
        scheduled_at: schedule === 'later' ? scheduledAt : null,
        payment_method: paymentMethod,
        status: 'requested'
      });
      setCurrentRide(ride);
      navigate('/tracking');
    } catch (err) {
      setError(err.message || 'Could not book ride.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="relative h-56 md:h-72">
        <MapView pickup={pickupCoords} destination={destinationCoords} onLocate={useCurrentLocation} onMapClick={mapDestinationPicker} />
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 bg-white p-3 rounded-full shadow-lg"><ArrowLeft size={20} /></button>
      </div>
      <div className="flex-1 bg-white rounded-t-3xl -mt-5 relative z-10 p-5 max-w-2xl w-full mx-auto shadow-xl">
        <h2 className="text-xl font-bold mb-4">{step === 1 ? 'Plan your trip' : 'Confirm your ride'}</h2>
        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

        <div className="space-y-3">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500" size={20} />
            <Input placeholder="Pickup location" className="pl-10 pr-12" value={pickup} onChange={(e) => setPickup(e.target.value)} />
            <button type="button" onClick={useCurrentLocation} title="Use my current location" className="absolute right-2 top-2 p-2 text-blue-600"><LocateFixed size={18} /></button>
          </div>
          <div className="relative">
            <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" size={20} />
            <Input placeholder="Where to?" className="pl-10" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
        </div>

        {step === 1 ? (
          <>
            <p className="text-xs text-gray-500 mt-2">Tip: allow location access to save your current pickup coordinates. Destination coordinates can be added when a map/geocoding provider is connected.</p>
            <h3 className="font-bold mt-6 mb-3">Choose a ride</h3>
            <div className="grid gap-3">
              {Object.entries(RIDE_TYPES).map(([key, type]) => (
                <button key={key} onClick={() => setRideType(key)} className={`p-4 rounded-2xl border text-left flex items-center gap-4 ${rideType === key ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="p-3 rounded-xl bg-white shadow-sm"><Car size={20} className="text-blue-600" /></div>
                  <div className="flex-1"><p className="font-bold">{type.label}</p><p className="text-xs text-gray-500">{type.description} · up to {type.seats} seats</p></div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setSchedule('now')} className={`flex-1 p-3 rounded-xl border ${schedule === 'now' ? 'border-blue-600 bg-blue-50' : ''}`}><Clock3 className="mx-auto mb-1" size={18} /><span className="text-sm font-medium">Now</span></button>
              <button onClick={() => setSchedule('later')} className={`flex-1 p-3 rounded-xl border ${schedule === 'later' ? 'border-blue-600 bg-blue-50' : ''}`}><Clock3 className="mx-auto mb-1" size={18} /><span className="text-sm font-medium">Schedule</span></button>
            </div>
            {schedule === 'later' && <input type="datetime-local" min={new Date(Date.now() + 10 * 60000).toISOString().slice(0,16)} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full mt-3 p-3 rounded-xl border" />}
            <Button className="w-full mt-5 py-4" onClick={checkPrice} disabled={locating}>{locating ? 'Locating you...' : 'Check price'}</Button>
          </>
        ) : (
          <>
            <div className="mt-4 p-4 bg-gray-50 rounded-2xl space-y-3">
              <div className="flex justify-between"><span className="text-gray-500">Ride type</span><b>{RIDE_TYPES[rideType].label}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">Estimated distance</span><b>{distance ? `${distance.toFixed(1)} km` : 'Route estimate'}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">Estimated time</span><b>{duration} min</b></div>
              <div className="flex justify-between pt-3 border-t"><span className="text-gray-500">Estimated fare</span><b className="text-xl">GH₵{fare.toFixed(2)}</b></div>
            </div>
            <div className="mt-3 p-3 rounded-xl bg-blue-50 text-blue-800 text-sm flex items-center justify-between">
              <span>{nearbyDrivers === null ? 'Checking nearby driver availability...' : nearbyDrivers === 0 ? 'No nearby drivers yet' : `${nearbyDrivers} driver${nearbyDrivers === 1 ? '' : 's'} online nearby`}</span>
              <span className="font-bold">{nearbyDrivers > 0 ? '● Live' : 'Waiting'}</span>
            </div>
            <p className="text-xs text-gray-500 mt-3">Final fare may change if the route, waiting time, tolls or trip details change.</p>
            <h3 className="font-bold mt-5 mb-2">Payment method</h3>
            <div className="grid sm:grid-cols-3 gap-2">{[{id:'cash',label:'Cash',detail:'Pay driver'},{id:'mobile_money',label:'Mobile Money',detail:'Pay securely after trip'},{id:'card',label:'Bank card',detail:'Pay securely after trip'}].map(method=><button type="button" key={method.id} onClick={()=>setPaymentMethod(method.id)} className={`rounded-xl border p-3 text-left ${paymentMethod===method.id?'border-blue-600 bg-blue-50':'border-gray-200'}`}><span className="block font-semibold">{method.label}</span><span className="text-xs text-gray-500">{method.detail}</span></button>)}</div>
            <div className="flex gap-3 mt-5"><Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>Back</Button><Button className="flex-1" onClick={handleConfirm} disabled={busy}>{busy ? 'Requesting...' : 'Request ride'}</Button></div>
          </>
        )}
      </div>
    </div>
  );
};
export default Booking;
