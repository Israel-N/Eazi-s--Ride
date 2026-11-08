import { supabase } from '../lib/supabase';

export const createRide = async (rideData) => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in to book a ride.');
  const { data, error } = await supabase.rpc('request_ride', {
    p_pickup_address: rideData.pickup_address,
    p_destination_address: rideData.destination_address,
    p_pickup_lat: rideData.pickup_lat,
    p_pickup_lng: rideData.pickup_lng,
    p_destination_lat: rideData.destination_lat,
    p_destination_lng: rideData.destination_lng,
    p_ride_type: rideData.ride_type || 'economy',
    p_scheduled_at: rideData.scheduled_at ? new Date(rideData.scheduled_at).toISOString() : null,
    p_payment_method: rideData.payment_method || 'cash',
  });
  if (error) throw error;
  return data;
};

export const getRide = async (id) => {
  const { data, error } = await supabase.from('rides').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

export const getMyRides = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const { data, error } = await supabase.from('rides').select('*')
    .or(`rider_id.eq.${user.id},driver_id.eq.${user.id}`).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

export const cancelRide = async (rideId, reason = 'Cancelled by rider') => {
  const { data, error } = await supabase.rpc('cancel_my_ride', { p_ride_id: rideId, p_reason: reason });
  if (error) throw error;
  return data;
};

export const updateRideStatus = async (rideId, status) => {
  const { data, error } = await supabase.rpc('transition_my_ride', { p_ride_id: rideId, p_next_status: status });
  if (error) throw error;
  return data;
};

export const getOpenRideRequests = async () => {
  const { data, error } = await supabase.from('rides').select('*').eq('status', 'requested').is('driver_id', null).order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const acceptRide = async (rideId) => {
  const { data, error } = await supabase.rpc('accept_ride', { p_ride_id: rideId });
  if (error) throw error;
  return data;
};

export const declineRideRequest = async (rideId) => {
  const { data, error } = await supabase.rpc('decline_ride_request', { p_ride_id: rideId });
  if (error) throw error;
  return data;
};

export const subscribeToRide = (rideId, callback) => supabase
  .channel(`ride-${rideId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, callback)
  .subscribe();

export const subscribeToOpenRides = (callback) => supabase
  .channel('open-rides')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, callback)
  .subscribe();

export const unsubscribeFromRide = (channel) => { if (channel) supabase.removeChannel(channel); };
