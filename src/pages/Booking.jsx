import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MapView from '../components/MapView';
import Input from '../components/Input';
import Button from '../components/Button';
import {
  ArrowLeft,
  MapPin,
  Navigation,
  LocateFixed,
  Clock3,
  Car,
  ChevronRight,
} from 'lucide-react';
import { createRide } from '../services/rideService';
import { getNearbyDriverCount } from '../services/driverService';
import { useRides } from '../hooks/useRides';
import {
  calculateFare,
  estimateDuration,
  RIDE_TYPES,
} from '../utils/fareCalculator';
import { getDistance } from '../utils/distance';

const formatPlace = (properties = {}) => {
  const parts = [
    properties.name,
    properties.housenumber,
    properties.street,
    properties.district,
    properties.suburb,
    properties.city,
    properties.county,
    properties.state,
    properties.country,
  ];

  const label = [...new Set(parts.filter(Boolean))].join(', ');
  return label || 'Selected location';
};

const searchLocations = async (query) => {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery || trimmedQuery.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmedQuery,
    limit: '6',
    lang: 'en',
    lat: '5.6037',
    lon: '-0.1870',
  });

  const response = await fetch(`https://photon.komoot.io/api/?${params}`);

  if (!response.ok) {
    throw new Error('Location search failed. Please try again.');
  }

  const data = await response.json();

  return (data.features || [])
    .filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      return (
        Array.isArray(coordinates) &&
        Number.isFinite(coordinates[0]) &&
        Number.isFinite(coordinates[1])
      );
    })
    .map((feature) => ({
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      label: formatPlace(feature.properties),
    }));
};

const geocode = async (query) => {
  const results = await searchLocations(query);

  if (!results.length) {
    throw new Error(
      `Could not find "${query}". Try adding the area, city, or a nearby landmark.`
    );
  }

  return results[0];
};

const reverseGeocode = async (lat, lng) => {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    lang: 'en',
  });

  const response = await fetch(`https://photon.komoot.io/reverse?${params}`);

  if (!response.ok) {
    throw new Error('Could not identify this location.');
  }

  const data = await response.json();
  const properties = data.features?.[0]?.properties;

  if (!properties) {
    throw new Error('No address was found for this location.');
  }

  return formatPlace(properties);
};

const getLocalDateTimeValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
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
  const [tripDistance, setTripDistance] = useState(0);
  const [tripDuration, setTripDuration] = useState(0);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState(null);

  const [activeField, setActiveField] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);

  const distance = useMemo(() => {
    if (!pickupCoords || !destinationCoords) return 0;

    return getDistance(
      pickupCoords.lat,
      pickupCoords.lng,
      destinationCoords.lat,
      destinationCoords.lng
    );
  }, [pickupCoords, destinationCoords]);

  const duration = useMemo(
    () => estimateDuration(distance),
    [distance]
  );

  const selectSuggestion = (location) => {
    const coordinates = { lat: location.lat, lng: location.lng };

    if (activeField === 'pickup') {
      setPickup(location.label);
      setPickupCoords(coordinates);
    } else if (activeField === 'destination') {
      setDestination(location.label);
      setDestinationCoords(coordinates);
    }

    setSuggestions([]);
    setActiveField(null);
    setError('');
  };

  useEffect(() => {
    const query =
      activeField === 'pickup'
        ? pickup
        : activeField === 'destination'
          ? destination
          : '';

    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const results = await searchLocations(query);

        if (!cancelled) {
          setSuggestions(results);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pickup, destination, activeField]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.');
      return;
    }

    setError('');
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const location = {
          lat: coords.latitude,
          lng: coords.longitude,
        };

        setPickupCoords(location);
        setActiveField(null);
        setSuggestions([]);

        try {
          const address = await reverseGeocode(location.lat, location.lng);
          setPickup(address);
        } catch {
          setPickup(
            `Location near ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
          );
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError(
            'Location permission was denied. You can type your pickup address instead.'
          );
        } else if (geoError.code === geoError.TIMEOUT) {
          setError('Getting your location timed out. Please try again.');
        } else {
          setError('Could not get your current location. Enter it manually.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  };

  const chooseDestinationOnMap = async (coords) => {
    if (!Number.isFinite(coords?.lat) || !Number.isFinite(coords?.lng)) {
      return;
    }

    setError('');
    setDestinationCoords({ lat: coords.lat, lng: coords.lng });
    setActiveField(null);
    setSuggestions([]);

    try {
      const address = await reverseGeocode(coords.lat, coords.lng);
      setDestination(address);
    } catch {
      setDestination(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
    }
  };

  // MapView is expected to call onMapClick with a Leaflet click event.
  const mapDestinationPicker = (event) => {
    const coords = event?.latlng || event;
    if (coords) {
      chooseDestinationOnMap({
        lat: coords.lat,
        lng: coords.lng,
      });
    }
  };

  const checkPrice = async () => {
    if (!pickup.trim() || !destination.trim()) {
      setError('Enter both your pickup location and destination.');
      return;
    }

    setError('');
    setBusy(true);

    try {
      // Resolve typed addresses when the user has not selected a suggestion.
      let finalPickup = pickupCoords;
      let finalDestination = destinationCoords;

      if (!finalPickup) {
        finalPickup = await geocode(pickup);
        setPickupCoords(finalPickup);
        setPickup(finalPickup.label);
      }

      if (!finalDestination) {
        finalDestination = await geocode(destination);
        setDestinationCoords(finalDestination);
        setDestination(finalDestination.label);
      }

      const estimatedDistance = getDistance(
        finalPickup.lat,
        finalPickup.lng,
        finalDestination.lat,
        finalDestination.lng
      );

      if (!Number.isFinite(estimatedDistance) || estimatedDistance <= 0) {
        throw new Error(
          'Pickup and destination appear to be the same place. Choose a different destination.'
        );
      }

      const estimatedDuration = estimateDuration(estimatedDistance);
      const estimatedFare = calculateFare(
        estimatedDistance,
        estimatedDuration,
        rideType
      );

      setTripDistance(estimatedDistance);
      setTripDuration(estimatedDuration);
      setFare(estimatedFare);

      try {
        const count = await getNearbyDriverCount({
          latitude: finalPickup.lat,
          longitude: finalPickup.lng,
          radiusKm: 8,
        });
        setNearbyDrivers(count);
      } catch {
        // Driver availability must not prevent a rider from viewing a fare.
        setNearbyDrivers(null);
      }

      setActiveField(null);
      setSuggestions([]);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Could not calculate the fare.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (schedule === 'later') {
      if (!scheduledAt) {
        setError('Choose a date and time for your scheduled ride.');
        return;
      }

      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setError('Choose a future date and time for your ride.');
        return;
      }
    }

    if (!pickupCoords || !destinationCoords) {
      setError('Please enter valid pickup and destination locations first.');
      setStep(1);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const ride = await createRide({
        pickup_address: pickup,
        destination_address: destination,
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        destination_lat: destinationCoords.lat,
        destination_lng: destinationCoords.lng,
        fare,
        distance: Number(tripDistance.toFixed(2)),
        duration: tripDuration,
        ride_type: rideType,
        scheduled_at: schedule === 'later' ? new Date(scheduledAt).toISOString() : null,
        payment_method: paymentMethod,
        status: 'requested',
      });

      setCurrentRide(ride);
      navigate('/tracking');
    } catch (err) {
      setError(err.message || 'Could not book your ride. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const renderSuggestions = (field) => {
    if (activeField !== field) return null;

    return (
      <>
        {searching && (
          <p className="mt-1 text-xs text-gray-500">Searching locations...</p>
        )}

        {!searching && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-[2000] mt-1 overflow-hidden rounded-xl border bg-white shadow-xl">
            {suggestions.map((location, index) => (
              <button
                key={`${location.lat}-${location.lng}-${index}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(location)}
                className="flex w-full items-center gap-3 border-b p-3 text-left last:border-b-0 hover:bg-blue-50"
              >
                <MapPin
                  size={18}
                  className={`shrink-0 ${
                    field === 'pickup' ? 'text-green-600' : 'text-red-600'
                  }`}
                />
                <span className="text-sm text-gray-700">{location.label}</span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="relative h-56 md:h-72">
        <MapView
          pickup={pickupCoords}
          destination={destinationCoords}
          onLocate={useCurrentLocation}
          onMapClick={mapDestinationPicker}
        />

        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="absolute left-4 top-4 rounded-full bg-white p-3 shadow-lg"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="relative z-10 mx-auto -mt-5 w-full max-w-2xl flex-1 rounded-t-3xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-xl font-bold">
          {step === 1 ? 'Plan your trip' : 'Confirm your ride'}
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {step === 1 ? (
          <>
            <div className="space-y-4">
              <div className="relative">
                <MapPin
                  className="absolute left-3 top-4 z-10 text-green-500"
                  size={20}
                />

                <Input
                  placeholder="Enter pickup location"
                  className="pl-10 pr-12"
                  value={pickup}
                  onFocus={() => setActiveField('pickup')}
                  onChange={(event) => {
                    setPickup(event.target.value);
                    setPickupCoords(null);
                    setError('');
                  }}
                />

                <button
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={locating}
                  title="Use my current location"
                  aria-label="Use my current location"
                  className="absolute right-2 top-2 p-2 text-blue-600 disabled:opacity-50"
                >
                  <LocateFixed size={18} />
                </button>

                {renderSuggestions('pickup')}
              </div>

              <div className="relative">
                <Navigation
                  className="absolute left-3 top-4 z-10 text-red-500"
                  size={20}
                />

                <Input
                  placeholder="Where are you going?"
                  className="pl-10"
                  value={destination}
                  onFocus={() => setActiveField('destination')}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setDestinationCoords(null);
                    setError('');
                  }}
                />

                {renderSuggestions('destination')}
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              You can type a full address or landmark and select a suggestion.
              You can also choose your destination by tapping the map.
            </p>

            <h3 className="mb-3 mt-6 font-bold">Choose a ride</h3>

            <div className="grid gap-3">
              {Object.entries(RIDE_TYPES).map(([key, type]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRideType(key)}
                  className={`flex items-center gap-4 rounded-2xl border p-4 text-left ${
                    rideType === key
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="rounded-xl bg-white p-3 shadow-sm">
                    <Car size={20} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold">{type.label}</p>
                    <p className="text-xs text-gray-500">
                      {type.description} · up to {type.seats} seats
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              ))}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setSchedule('now')}
                className={`flex-1 rounded-xl border p-3 ${
                  schedule === 'now' ? 'border-blue-600 bg-blue-50' : ''
                }`}
              >
                <Clock3 className="mx-auto mb-1" size={18} />
                <span className="text-sm font-medium">Now</span>
              </button>

              <button
                type="button"
                onClick={() => setSchedule('later')}
                className={`flex-1 rounded-xl border p-3 ${
                  schedule === 'later' ? 'border-blue-600 bg-blue-50' : ''
                }`}
              >
                <Clock3 className="mx-auto mb-1" size={18} />
                <span className="text-sm font-medium">Schedule</span>
              </button>
            </div>

            {schedule === 'later' && (
              <input
                type="datetime-local"
                min={getLocalDateTimeValue(new Date(Date.now() + 10 * 60000))}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="mt-3 w-full rounded-xl border p-3"
              />
            )}

            <Button
              className="mt-5 w-full py-4"
              onClick={checkPrice}
              disabled={busy || locating}
            >
              {busy ? 'Calculating...' : locating ? 'Locating you...' : 'Check price'}
            </Button>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3 rounded-2xl bg-gray-50 p-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Pickup</span>
                <b className="max-w-[65%] text-right">{pickup}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Destination</span>
                <b className="max-w-[65%] text-right">{destination}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ride type</span>
                <b>{RIDE_TYPES[rideType]?.label || rideType}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated distance</span>
                <b>{tripDistance.toFixed(1)} km</b>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated time</span>
                <b>{tripDuration} min</b>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="text-gray-500">Estimated fare</span>
                <b className="text-xl">GH₵{Number(fare).toFixed(2)}</b>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              <span>
                {nearbyDrivers === null
                  ? 'Driver availability could not be checked'
                  : nearbyDrivers === 0
                    ? 'No nearby drivers yet'
                    : `${nearbyDrivers} driver${nearbyDrivers === 1 ? '' : 's'} online nearby`}
              </span>
              <span className="font-bold">
                {nearbyDrivers > 0 ? '● Online' : 'Waiting'}
              </span>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              This is an estimate. The final fare may change based on the
              actual route, waiting time, tolls, or trip details.
            </p>

            <h3 className="mb-2 mt-5 font-bold">Payment method</h3>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { id: 'cash', label: 'Cash', detail: 'Pay driver' },
                {
                  id: 'mobile_money',
                  label: 'Mobile Money',
                  detail: 'Pay securely after trip',
                },
                {
                  id: 'card',
                  label: 'Bank card',
                  detail: 'Pay securely after trip',
                },
              ].map((method) => (
                <button
                  type="button"
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={`rounded-xl border p-3 text-left ${
                    paymentMethod === method.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="block font-semibold">{method.label}</span>
                  <span className="text-xs text-gray-500">{method.detail}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setStep(1)}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirm}
                disabled={busy}
              >
                {busy ? 'Requesting...' : 'Request ride'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Booking;
