import { supabase } from '../lib/supabase';

// Fetch all messages for a ride
export const getRideMessages = async (rideId) => {
  const { data, error } = await supabase
    .from('ride_messages')
    .select('*')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return data ?? [];
};

// Send a message
export const sendRideMessage = async (rideId, text) => {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) {
    throw new Error('Not authenticated.');
  }

  const clean = text.trim();

  if (!clean) return null;

  const { data, error } = await supabase
    .from('ride_messages')
    .insert({
      ride_id: rideId,
      sender_id: user.id,
      message: clean,
    })
    .select('*')
    .single();

  if (error) throw error;

  return data;
};

// Subscribe to new messages for a ride
export const subscribeToMessages = (rideId, callback) => {
  if (!rideId) {
    throw new Error('A valid ride ID is required.');
  }

  const channel = supabase
    .channel(`ride-messages-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_messages',
        filter: `ride_id=eq.${rideId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    );

  // Subscribe only after registering the event listener.
  channel.subscribe((status, error) => {
    if (status === 'CHANNEL_ERROR') {
      console.error('Ride message subscription failed:', error);
    }

    if (status === 'SUBSCRIBED') {
      console.log(`Subscribed to messages for ride ${rideId}`);
    }
  });

  // Return a cleanup function.
  return () => {
    supabase.removeChannel(channel);
  };
};