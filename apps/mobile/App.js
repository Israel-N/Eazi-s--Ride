import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { createClient } from '@supabase/supabase-js';
import { DriverApplicationScreen, DriverAuthScreen } from './AuthScreens';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key', {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const ACTIVE = ['accepted', 'arriving', 'arrived', 'in_progress'];
const LOCATION_TASK_NAME = 'eazis-ride-active-trip-location';
const ACTIVE_TRACKING_KEY = 'eazis.activeTripTracking';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Expo requires background tasks to be defined at module scope, not inside a component.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  try {
    if (await AsyncStorage.getItem(ACTIVE_TRACKING_KEY) !== 'true') return;
    const locations = data.locations || [];
    const coords = locations[locations.length - 1]?.coords;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Re-check server state so tracking stops even if the app was killed while a trip completed.
    const { data: activeRides, error: rideError } = await supabase.from('rides').select('id')
      .eq('driver_id', user.id).in('status', ACTIVE).limit(1);
    if (rideError) return; // Do not stop on a transient network failure; retry on the next location event.
    if (!activeRides?.length) {
      await AsyncStorage.setItem(ACTIVE_TRACKING_KEY, 'false');
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
      return;
    }
    // RPC derives the driver identity from the authenticated Supabase session.
    await supabase.rpc('update_my_driver_location', { p_latitude: coords.latitude, p_longitude: coords.longitude });
  } catch (e) {
    // Background tasks must fail quietly; the foreground UI refresh reports connectivity issues.
  }
});

async function registerPushToken(userId) {
  if (!Device.isDevice || !userId) return;
  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId || projectId.includes('REPLACE')) return;
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.from('device_push_tokens').upsert({
    user_id: userId,
    expo_push_token: result.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    device_label: Device.modelName || null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('rides', {
    name: 'Ride updates', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250],
  });
}

async function startActiveTripTracking() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') throw new Error('Foreground location permission is required for live trip tracking.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') throw new Error('Allow background location so your passenger can track you while you use navigation or lock your phone.');
  await AsyncStorage.setItem(ACTIVE_TRACKING_KEY, 'true');
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!alreadyStarted) await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Eazi's Ride trip tracking is active",
      notificationBody: 'Your location is shared with your assigned passenger during this trip.',
      notificationColor: '#2563eb',
    },
  });
}

async function stopActiveTripTracking() {
  await AsyncStorage.setItem(ACTIVE_TRACKING_KEY, 'false');
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

function ActionButton({ title, onPress, disabled, secondary }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [driver, setDriver] = useState(null);
  const [application, setApplication] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [location, setLocation] = useState(null);
  const locationSubscription = useRef(null);
  const locationRef = useRef(null);

  const loadAccount = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfile(null); setDriver(null); setApplication(null); return; }
    const [{ data: p, error: profileError }, { data: d, error: driverError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (driverError) throw driverError;
    setProfile(p); setDriver(d);
    if (p?.role === 'rider') {
      const { data: app, error: appError } = await supabase.from('driver_applications').select('*').eq('user_id', user.id).maybeSingle();
      if (appError) throw appError;
      setApplication(app);
      return;
    }
    if (p?.role !== 'driver' || !d) throw new Error('This account is not configured as a driver. Contact Eazi support.');
    setApplication(null);
    const { data: rides, error: rideError } = await supabase.from('rides').select('*').eq('driver_id', user.id).order('created_at', { ascending: false }).limit(20);
    if (rideError) throw rideError;
    setActiveRide((rides || []).find(r => ACTIVE.includes(r.status)) || null);
  }, []);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) setError('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env.');
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session) loadAccount().catch(e => setError(e.message)); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) loadAccount().catch(e => setError(e.message));
      else { setProfile(null); setDriver(null); setApplication(null); setRequests([]); setActiveRide(null); }
    });
    return () => subscription.unsubscribe();
  }, [loadAccount]);

  useEffect(() => {
    let cancelled = false;
    const syncBackgroundTracking = async () => {
      if (activeRide && ACTIVE.includes(activeRide.status)) {
        try { await startActiveTripTracking(); }
        catch (e) { if (!cancelled) setError(`Background tracking setup: ${e.message}`); }
      } else {
        try { await stopActiveTripTracking(); } catch {}
      }
    };
    if (session) syncBackgroundTracking();
    return () => { cancelled = true; };
  }, [session?.user?.id, activeRide?.id, activeRide?.status]);

  const refreshRequests = useCallback(async (coords = locationRef.current) => {
    if (!coords || !driver?.is_online || !driver?.is_approved) { setRequests([]); return; }
    const { data, error: rpcError } = await supabase.rpc('get_nearby_open_rides', {
      p_latitude: coords.latitude, p_longitude: coords.longitude, p_radius_km: 10,
    });
    if (rpcError) throw rpcError;
    setRequests(data || []);
  }, [driver?.is_online, driver?.is_approved]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;
    registerPushToken(session.user.id).catch((e) => setError(`Push notifications are not ready: ${e.message}`));
    const received = Notifications.addNotificationReceivedListener(() => {
      refreshRequests().catch(() => {});
      loadAccount().catch(() => {});
    });
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const rideId = event.notification.request.content.data?.rideId;
      if (rideId) loadAccount().catch(() => {});
    });
    return () => { received.remove(); response.remove(); };
  }, [session?.user?.id, loadAccount, refreshRequests]);

  useEffect(() => {
    if (!session || !driver) return undefined;
    const channel = supabase.channel(`mobile-driver-rides-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, () => {
        refreshRequests().catch(e => setError(e.message));
        loadAccount().catch(e => setError(e.message));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, driver?.user_id, refreshRequests, loadAccount]);

  useEffect(() => {
    if (!session || !driver?.is_online || !driver?.is_approved) return undefined;
    let alive = true;
    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission is required to go online.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!alive) return;
      const coords = current.coords;
      locationRef.current = coords;
      setLocation(coords);
      await supabase.rpc('update_my_driver_location', { p_latitude: coords.latitude, p_longitude: coords.longitude });
      await refreshRequests(coords);
      locationSubscription.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 8 }, async ({ coords: next }) => {
        locationRef.current = next;
        setLocation(next);
        const { error: locationError } = await supabase.rpc('update_my_driver_location', { p_latitude: next.latitude, p_longitude: next.longitude });
        if (locationError) setError(locationError.message);
        refreshRequests(next).catch(e => setError(e.message));
      });
    };
    start().catch(e => setError(e.message));
    return () => { alive = false; locationSubscription.current?.remove(); locationSubscription.current = null; };
  }, [session?.user?.id, driver?.is_online, driver?.is_approved, refreshRequests]);



  const toggleOnline = async () => {
    setBusy(true); setError('');
    try {
      if (!driver?.is_approved) throw new Error('Your driver account is awaiting admin approval.');
      if (!driver.is_online) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') throw new Error('Allow location access before going online.');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { error: locationError } = await supabase.rpc('update_my_driver_location', { p_latitude: pos.coords.latitude, p_longitude: pos.coords.longitude });
        if (locationError) throw locationError;
      }
      const { data, error: rpcError } = await supabase.rpc('set_driver_availability', { p_is_online: !driver.is_online });
      if (rpcError) throw rpcError;
      setDriver(data);
      if (data.is_online) { const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); locationRef.current = pos.coords; setLocation(pos.coords); await refreshRequests(pos.coords); }
      else setRequests([]);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const decline = async (ride) => {
    setBusy(true); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('decline_ride_request', { p_ride_id: ride.id });
      if (rpcError) throw rpcError;
      setRequests(prev => prev.filter(r => r.id !== ride.id));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const accept = async (ride) => {
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('accept_ride', { p_ride_id: ride.id });
      if (rpcError) throw rpcError;
      setActiveRide(data); setRequests(prev => prev.filter(r => r.id !== ride.id));
    } catch (e) { setError(e.message); await refreshRequests().catch(() => {}); }
    finally { setBusy(false); }
  };

  const advance = async () => {
    if (!activeRide) return;
    const next = activeRide.status === 'accepted' ? 'arriving' : activeRide.status === 'arriving' ? 'arrived' : activeRide.status === 'arrived' ? 'in_progress' : 'completed';
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('transition_my_ride', { p_ride_id: activeRide.id, p_next_status: next });
      if (rpcError) throw rpcError;
      setActiveRide(next === 'completed' ? null : data);
      if (next === 'completed') await loadAccount();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const signOut = async () => { if (activeRide && ACTIVE.includes(activeRide.status)) { Alert.alert("Trip in progress", "Complete or resolve your active ride before signing out so passenger tracking is not interrupted."); return; } try { await stopActiveTripTracking(); } catch {} await supabase.auth.signOut(); };

  if (!session) return <DriverAuthScreen supabase={supabase} configured={Boolean(supabaseUrl && supabaseKey)} />;
  if (profile?.role === 'rider') return <DriverApplicationScreen supabase={supabase} profile={profile} application={application} onSubmitted={loadAccount} onSignOut={() => supabase.auth.signOut()} />;

  const nextLabel = activeRide?.status === 'accepted' ? 'Start driving to pickup' : activeRide?.status === 'arriving' ? 'I have arrived' : activeRide?.status === 'arrived' ? 'Start trip' : 'Complete trip';
  return <SafeAreaView style={styles.safe}><View style={styles.header}><View><Text style={styles.brand}>EAZI'S RIDE</Text><Text style={styles.muted}>{profile?.full_name || driver?.full_name || 'Driver'}</Text></View><Pressable onPress={signOut}><Text style={styles.link}>Sign out</Text></Pressable></View>
    {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
    {!driver?.is_approved ? <View style={styles.notice}><Text style={styles.noticeText}>Your driver account is awaiting admin approval. You cannot go online or accept rides until approved.</Text></View> : null}
    <View style={styles.statusRow}><Text style={styles.heading}>{driver?.is_online ? 'You are online' : 'You are offline'}</Text><ActionButton title={busy ? 'Please wait…' : driver?.is_online ? 'Go offline' : 'Go online'} onPress={toggleOnline} disabled={busy || !driver?.is_approved}/></View>
    {location ? <MapView style={styles.map} initialRegion={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }} region={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }} showsUserLocation><Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} title="Your location"/><Polyline coordinates={activeRide?.pickup_lat && activeRide?.pickup_lng ? [{ latitude: location.latitude, longitude: location.longitude }, { latitude: activeRide.pickup_lat, longitude: activeRide.pickup_lng }] : []} strokeColor="#2563eb" strokeWidth={4}/></MapView> : <View style={styles.mapPlaceholder}><Text style={styles.muted}>Your map and GPS location appear when you go online.</Text></View>}
    <ScrollView contentContainerStyle={styles.content}>
      {activeRide ? <View style={styles.card}><Text style={styles.cardTitle}>Active ride · {activeRide.status.replace('_',' ')}</Text><Text style={styles.address}>Pickup: {activeRide.pickup_address}</Text><Text style={styles.address}>Destination: {activeRide.destination_address}</Text><Text style={styles.fare}>GH₵ {Number(activeRide.fare || 0).toFixed(2)}</Text><ActionButton title={busy ? 'Updating…' : nextLabel} onPress={advance} disabled={busy}/></View> : <><View style={styles.sectionTitle}><Text style={styles.heading}>Nearby requests</Text><Pressable onPress={() => refreshRequests().catch(e => setError(e.message))}><Text style={styles.link}>Refresh</Text></Pressable></View>{!driver?.is_online ? <Text style={styles.muted}>Go online to receive nearby requests.</Text> : requests.length === 0 ? <Text style={styles.muted}>No nearby requests right now. Keep location enabled.</Text> : requests.map(ride => <View key={ride.id} style={styles.card}><Text style={styles.fare}>GH₵ {Number(ride.fare || 0).toFixed(2)}</Text><Text style={styles.muted}>{ride.ride_type || 'Economy'} · {ride.distance ? `${ride.distance} km` : 'Distance unavailable'}</Text><Text style={styles.address}>Pickup: {ride.pickup_address}</Text><Text style={styles.address}>Destination: {ride.destination_address}</Text><View style={styles.buttonRow}><View style={styles.buttonHalf}><ActionButton title="Accept ride" onPress={() => accept(ride)} disabled={busy}/></View><View style={styles.buttonHalf}><ActionButton title="Decline" onPress={() => decline(ride)} disabled={busy} secondary/></View></View></View>)}</>}
      <View style={styles.card}><Text style={styles.cardTitle}>Driver summary</Text><Text style={styles.muted}>Completed rides: {driver?.total_rides ?? 0}</Text><Text style={styles.muted}>Recorded earnings: GH₵ {Number(driver?.total_earnings || 0).toFixed(2)}</Text><Text style={styles.small}>Background GPS is enabled only during an active trip after you grant background permission. Stop the trip to stop background tracking.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f8fafc'}, login:{flex:1,justifyContent:'center',padding:24}, header:{paddingHorizontal:18,paddingVertical:14,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#e2e8f0'}, brand:{fontSize:13,fontWeight:'900',letterSpacing:2,color:'#2563eb'}, heading:{fontSize:20,fontWeight:'800',color:'#0f172a',marginVertical:8}, muted:{fontSize:13,color:'#64748b',marginTop:3}, input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#cbd5e1',borderRadius:12,padding:14,marginTop:12,color:'#0f172a'}, buttonRow:{flexDirection:'row',gap:8},buttonHalf:{flex:1},button:{backgroundColor:'#2563eb',paddingVertical:13,paddingHorizontal:16,borderRadius:12,alignItems:'center',justifyContent:'center',marginTop:10}, buttonText:{color:'#fff',fontWeight:'800'}, secondaryButton:{backgroundColor:'#e2e8f0'},secondaryText:{color:'#0f172a'},disabled:{opacity:.5},error:{color:'#b91c1c',marginTop:12},errorBanner:{color:'#991b1b',backgroundColor:'#fee2e2',padding:12,margin:12,borderRadius:10},notice:{backgroundColor:'#fef3c7',padding:12,margin:12,borderRadius:10},noticeText:{color:'#92400e',fontSize:13},statusRow:{paddingHorizontal:16,paddingVertical:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},map:{height:230,marginHorizontal:12,borderRadius:16},mapPlaceholder:{height:170,margin:12,backgroundColor:'#e2e8f0',borderRadius:16,alignItems:'center',justifyContent:'center',padding:20},content:{padding:12,paddingBottom:32},sectionTitle:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},card:{backgroundColor:'#fff',borderRadius:16,padding:16,marginBottom:12,borderWidth:1,borderColor:'#e2e8f0'},cardTitle:{fontSize:16,fontWeight:'800',color:'#0f172a',marginBottom:10},address:{color:'#334155',marginTop:8,fontSize:14},fare:{fontSize:20,fontWeight:'900',color:'#0f172a'},link:{color:'#2563eb',fontWeight:'700'},small:{fontSize:11,color:'#64748b',marginTop:12,lineHeight:16}});
