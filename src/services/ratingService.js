import { supabase } from '../lib/supabase';

export const getMyRideRating = async (rideId) => {
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('ride_id', rideId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const submitRideRating = async ({ rideId, driverId, rating, comment = '' }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be logged in to rate a ride.');
  if (!rideId || !driverId) throw new Error('This ride cannot be rated because no driver was assigned.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Please select a rating from 1 to 5 stars.');
  }

  const { data, error } = await supabase
    .from('ratings')
    .upsert(
      {
        ride_id: rideId,
        rider_id: user.id,
        driver_id: driverId,
        rating,
        comment: comment.trim() || null
      },
      { onConflict: 'ride_id' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data;
};
