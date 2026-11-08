import { supabase } from '../lib/supabase';

export const getMyDriverProfile = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
};

export const updateDriverOnline = async (isOnline) => {
  const { data, error } = await supabase.rpc('set_driver_availability', { p_is_online: Boolean(isOnline) });
  if (error) throw error;
  return data;
};

export const updateDriverLocation = async ({ latitude, longitude }) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Invalid GPS coordinates.');
  const { data, error } = await supabase.rpc('update_my_driver_location', {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw error;
  return data;
};

export const getDriverProfile = async (userId) => {
  if (!userId) return null;
  const { data, error } = await supabase.from('driver_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
};

export const getNearbyOpenRideRequests = async ({ latitude, longitude, radiusKm = 10 }) => {
  const { data, error } = await supabase.rpc('get_nearby_open_rides', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_km: radiusKm,
  });
  if (error) throw error;
  return data ?? [];
};

export const getNearbyDriverCount = async ({ latitude, longitude, radiusKm = 8 }) => {
  const { data, error } = await supabase.rpc('count_nearby_online_drivers', {
    p_latitude: latitude, p_longitude: longitude, p_radius_km: radiusKm,
  });
  if (error) throw error;
  return Number(data || 0);
};

export const subscribeToDriverLocation = (driverId, callback) => supabase
  .channel(`driver-location-${driverId}`)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'driver_profiles', filter: `user_id=eq.${driverId}`,
  }, callback)
  .subscribe();
