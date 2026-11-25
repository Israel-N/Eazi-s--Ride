import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key', {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
const RIDE_TYPES = { economy: { label: 'Economy', seats: 4, multiplier: 1 }, comfort: { label: 'Comfort', seats: 4, multiplier: 1.35 }, xl: { label: 'XL', seats: 6, multiplier: 1.7 } };
const money = (n) => `GHS ${Number(n || 0).toFixed(2)}`;
const haversine = (a,b) => { const rad=x=>x*Math.PI/180; const dLat=rad(b.lat-a.lat), dLng=rad(b.lng-a.lng); const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2; return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); };
let lastPlaceSearchAt = 0;
async function searchPlaces(query) {
  const wait = Math.max(0, 1100 - (Date.now() - lastPlaceSearchAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastPlaceSearchAt = Date.now();
  const q = /\bghana\b/i.test(query) ? query : `${query}, Ghana`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=gh&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Location search is temporarily unavailable. Please try again.');
  const rows = await res.json();
  return rows.map(row => ({ lat: Number(row.lat), lng: Number(row.lon), label: row.display_name }));
}

function Button({ title, onPress, disabled, secondary }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && { opacity: .5 }]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>; }
function Field({ label, ...props }) { const title = label || props.placeholder || 'Input'; return <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>{title}</Text><TextInput accessibilityLabel={title} placeholderTextColor="#94A3B8" style={styles.input} {...props} /></View>; }
export default function App() {
  const [session,setSession]=useState(null), [profile,setProfile]=useState(null), [loading,setLoading]=useState(true);
  const [mode,setMode]=useState('login'), [email,setEmail]=useState(''), [password,setPassword]=useState(''), [fullName,setFullName]=useState('');
  const [authMethod,setAuthMethod]=useState('email'), [authStage,setAuthStage]=useState('details'), [phone,setPhone]=useState('+233'), [otp,setOtp]=useState(''), [showPassword,setShowPassword]=useState(false);
  const [avatarUrl,setAvatarUrl]=useState(null), [suggestions,setSuggestions]=useState([]), [suggestionTarget,setSuggestionTarget]=useState(null);
  const [pickup,setPickup]=useState(''), [destination,setDestination]=useState(''), [pickupPoint,setPickupPoint]=useState(null), [destinationPoint,setDestinationPoint]=useState(null);
  const [rideCategory,setRideCategory]=useState('recommended'),
  const [rideType,setRideType]=useState('economy'), [payment,setPayment]=useState('cash'), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [currentRide,setCurrentRide]=useState(null), [history,setHistory]=useState([]), [tab,setTab]=useState('book'), [accountPage,setAccountPage]=useState('main');
  const [bookingStep,setBookingStep]=useState('home'), [stops,setStops]=useState([]);
  const goToBookingStep = (step) => {
    setBookingStep(step);
    setError('');
    setSuggestions([]);
    setSuggestionTarget(null);
  };

  const addStop = () => {
    setStops(previous => [
      ...previous,
      { id: `${Date.now()}-${previous.length}`, address: '', point: null }
    ]);
  };

  const removeStop = (id) => {
    setStops(previous => previous.filter(stop => stop.id !== id));
  };

  const updateStop = (id, changes) => {
    setStops(previous =>
      previous.map(stop => stop.id === id ? { ...stop, ...changes } : stop)
    );
  };

  const distance=useMemo(()=>pickupPoint&&destinationPoint?haversine(pickupPoint,destinationPoint):0, [pickupPoint,destinationPoint]);
  const estimatedFare=useMemo(()=>{const km=Math.max(.1,distance); const mins=Math.max(3,Math.ceil(km/30*60)); return Math.max(5,Math.round((5+km*1.5+mins*.5)*RIDE_TYPES[rideType].multiplier*100)/100);},[distance,rideType]);

  const loadProfile=useCallback(async (user)=>{
    const {data,error:profileError}=await supabase.from('profiles').select('id,full_name,email,phone,role,avatar_url').eq('id',user.id).single();
    if(profileError) throw profileError;
    if(data.role!=='rider') { await supabase.auth.signOut(); throw new Error('This account is not a rider account. Please sign in with a passenger account.'); }
    setProfile(data); setAvatarUrl(data.avatar_url || null);
  },[]);
  const refreshRides=useCallback(async()=>{
    const {data:{user}}=await supabase.auth.getUser(); if(!user) return;
    const {data,error:rideError}=await supabase.from('rides').select('*').eq('rider_id',user.id).order('created_at',{ascending:false}).limit(30);
    if(rideError) throw rideError;
    setHistory(data||[]); setCurrentRide((data||[]).find(r=>['requested','accepted','arriving','arrived','in_progress'].includes(r.status))||null);
  },[]);
  useEffect(()=>{
    let active=true;
    supabase.auth.getSession().then(async({data})=>{if(!active)return;setSession(data.session);if(data.session){try{await loadProfile(data.session.user);await refreshRides();}catch(e){setError(e.message);}}setLoading(false);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setProfile(null);if(next){Promise.resolve().then(async()=>{try{await loadProfile(next.user);await refreshRides();}catch(e){setError(e.message);}});}else{setHistory([]);setCurrentRide(null);}});
    return()=>{active=false;subscription.unsubscribe();};
  },[loadProfile,refreshRides]);
  useEffect(()=>{
    if(!session?.user?.id) return;
    const ch=supabase.channel(`rider-mobile-${session.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'rides',filter:`rider_id=eq.${session.user.id}`},()=>refreshRides().catch(e=>setError(e.message))).subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[session?.user?.id,refreshRides]);

  const authAction=async()=>{
    setBusy(true);setError('');
    try{
      if(!supabaseUrl||!supabaseKey) throw new Error('Set the Supabase URL and publishable key in apps/rider-mobile/.env first.');
      if(authStage==='otp'){
        if(!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit verification code.');
        const payload=authMethod==='email'?{email:email.trim().toLowerCase(),token:otp.trim(),type:'signup'}:{phone:phone.trim(),token:otp.trim(),type:'sms'};
        const {error:verifyError}=await supabase.auth.verifyOtp(payload);if(verifyError)throw verifyError;
      } else if(authMethod==='phone'){
        if(!/^\+[1-9]\d{7,14}$/.test(phone.trim())) throw new Error('Enter your phone number with country code, e.g. +233XXXXXXXXX.');
        const {error:otpError}=await supabase.auth.signInWithOtp({phone:phone.trim(),options:{shouldCreateUser:mode==='signup',...(mode==='signup'?{data:{full_name:fullName.trim(),phone:phone.trim()}}:{})}});if(otpError)throw otpError;
        setAuthStage('otp');Alert.alert('SMS sent','Enter the verification code sent to your phone.');
      } else if(mode==='signup'){
        if(!fullName.trim()) throw new Error('Enter your full name.');
        if(password.length<8) throw new Error('Use a password with at least 8 characters.');
        const {error:authError}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,options:{data:{full_name:fullName.trim()}}});
        if(authError)throw authError;setAuthStage('otp');Alert.alert('Check your email','Enter the verification code sent to your email address.');
      } else {const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});if(authError)throw authError;}
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };

  const locate=async()=>{
    setBusy(true);setError('');
    try{const p=await Location.requestForegroundPermissionsAsync();if(p.status!=='granted')throw new Error('Allow location access or enter your pickup address manually.');const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});const point={lat:pos.coords.latitude,lng:pos.coords.longitude};setPickupPoint(point);try{const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}`,{headers:{'Accept-Language':'en'}});const data=await res.json();setPickup(data.display_name||'My current location');}catch{setPickup('My current location');}}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const findSuggestions=async(target)=>{
    let query='';

    if(target==='pickup'){
      query=pickup;
    }else if(target==='destination'){
      query=destination;
    }else if(target.startsWith('stop:')){
      const stopId=target.slice(5);
      query=stops.find(stop=>stop.id===stopId)?.address||'';
    }

    if(!query.trim()){
      setError('Enter a location first.');
      return;
    }

    setBusy(true);
    setError('');
    setSuggestions([]);
    setSuggestionTarget(target);

    try{
      const rows=await searchPlaces(query.trim());
      if(!rows.length)throw new Error('No matching Ghana locations found. Try a town, community, landmark or business name.');
      setSuggestions(rows);
    }catch(e){
      setError(e.message);
      setSuggestionTarget(null);
    }finally{
      setBusy(false);
    }
  };

  const chooseSuggestion=(place)=>{
    if(suggestionTarget==='pickup'){
      setPickup(place.label);
      setPickupPoint(place);
    }else if(suggestionTarget==='destination'){
      setDestination(place.label);
      setDestinationPoint(place);
    }else if(suggestionTarget?.startsWith('stop:')){
      const stopId=suggestionTarget.slice(5);
      updateStop(stopId,{address:place.label,point:place});
    }

    setSuggestions([]);
    setSuggestionTarget(null);
    setError('');
  };
  const uploadAvatar=async()=>{
    setError('');
    try{
      const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted)throw new Error('Allow photo library access to choose a profile picture.');
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.8});
      if(result.canceled||!result.assets?.[0])return;
      const asset=result.assets[0];const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in again before uploading a profile picture.');
      if(asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
      const extension=asset.mimeType==='image/png'?'png':asset.mimeType==='image/webp'?'webp':'jpg';
      const path=`${user.id}/avatar-${Date.now()}.${extension}`;
      const response=await fetch(asset.uri);const body=await response.arrayBuffer();
      const {error:uploadError}=await supabase.storage.from('avatars').upload(path,body,{contentType:extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg',upsert:true});if(uploadError)throw uploadError;
      const {data:publicData}=supabase.storage.from('avatars').getPublicUrl(path);
      const {error:updateError}=await supabase.from('profiles').update({avatar_url:publicData.publicUrl}).eq('id',user.id);if(updateError)throw updateError;
      setAvatarUrl(publicData.publicUrl);setProfile(prev=>({...prev,avatar_url:publicData.publicUrl}));
    }catch(e){setError(e.message);}
  };

  const bookRide=async()=>{
    if(!pickupPoint||!destinationPoint){setError('Resolve both locations before requesting a ride.');return;}
    setBusy(true);setError('');
    try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in before requesting a ride.');
      const {data,error:rpcError}=await supabase.rpc('request_ride',{p_pickup_address:pickup,p_destination_address:destination,p_pickup_lat:pickupPoint.lat,p_pickup_lng:pickupPoint.lng,p_destination_lat:destinationPoint.lat,p_destination_lng:destinationPoint.lng,p_ride_type:rideType,p_scheduled_at:null,p_payment_method:payment});
      if(rpcError)throw rpcError;setCurrentRide(data);setTab('activity');await refreshRides();Alert.alert('Ride requested','Your request has been sent to eligible nearby drivers.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const cancel=async(ride)=>{Alert.alert('Cancel ride','Are you sure you want to cancel this ride?',[{text:'Keep ride',style:'cancel'},{text:'Cancel ride',style:'destructive',onPress:async()=>{try{const{error:e}=await supabase.rpc('cancel_my_ride',{p_ride_id:ride.id,p_reason:'Cancelled by rider'});if(e)throw e;await refreshRides();}catch(err){setError(err.message);}}}]);};
  const signOut=async()=>{await supabase.auth.signOut();setProfile(null);};

  const mapRegion = useMemo(() => {
    const points = [pickupPoint, destinationPoint].filter(Boolean);

    if (points.length === 0) {
      return {
        latitude: 5.6037,
        longitude: -0.1870,
        latitudeDelta: 0.035,
        longitudeDelta: 0.035,
      };
    }

    if (points.length === 1) {
      return {
        latitude: Number(points[0].lat),
        longitude: Number(points[0].lng),
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      };
    }

    const latitudes = points.map(point => Number(point.lat));
    const longitudes = points.map(point => Number(point.lng));

    return {
      latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      latitudeDelta: Math.max(0.015, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.8),
      longitudeDelta: Math.max(0.015, (Math.max(...longitudes) - Math.min(...longitudes)) * 1.8),
    };
  }, [pickupPoint, destinationPoint]);

  if(loading)return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading Eazi's Ride...</Text></SafeAreaView>;
  if(!session)return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={Platform.OS==='ios'?12:0} style={{flex:1}}><ScrollView contentContainerStyle={styles.auth} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets><Image source={require('./assets/brand-logo.png')} style={styles.brandLogo} resizeMode="contain"/><Text style={styles.subtitle}>Your ride, made easy.</Text><Text style={styles.heading}>{authStage==='otp'?'Verify your account':mode==='login'?'Welcome back':'Create your passenger account'}</Text>
    {authStage==='otp'?<><Text style={styles.muted}>Enter the 6-digit code sent to {authMethod==='email'?email:phone}.</Text><Field label="6-digit verification code" placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} value={otp} onChangeText={setOtp}/><Button title={busy?'Verifying...':'Verify code'} onPress={authAction} disabled={busy||otp.length!==6}/><Button title="Back" secondary onPress={()=>{setAuthStage('details');setOtp('');}}/></>:<>
    <View style={styles.authSwitch}><Pressable onPress={()=>{setAuthMethod('email');setError('');}} style={[styles.authChoice,authMethod==='email'&&styles.authChoiceActive]}><Text>Email</Text></Pressable><Pressable onPress={()=>{setAuthMethod('phone');setError('');}} style={[styles.authChoice,authMethod==='phone'&&styles.authChoiceActive]}><Text>Phone</Text></Pressable></View>
    {mode==='signup'&&<Field label="Full name" placeholder="Your full name" autoCapitalize="words" autoComplete="name" value={fullName} onChangeText={setFullName}/>}
    {authMethod==='email'?<><Field label="Email address" placeholder="name@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail}/><View style={styles.passwordRow}><View style={{flex:1}}><Field label="Password" placeholder="At least 8 characters" autoCapitalize="none" autoComplete={mode==='login'?'current-password':'new-password'} secureTextEntry={!showPassword} value={password} onChangeText={setPassword}/></View><Pressable accessibilityRole="button" accessibilityLabel={showPassword?'Hide password':'Show password'} style={styles.eyeButton} onPress={()=>setShowPassword(v=>!v)}><Text style={styles.link}>{showPassword?'Hide':'Show'}</Text></Pressable></View></>:<Field label="Phone number" placeholder="+233XXXXXXXXX" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone}/>}
    <Button title={busy?'Please wait...':mode==='login'?(authMethod==='email'?'Sign in':'Send SMS code'):(authMethod==='email'?'Create account and send code':'Send SMS code')} onPress={authAction} disabled={busy||(authMethod==='email'&&(!email.trim()||password.length<(mode==='signup'?8:1)))||(authMethod==='phone'&&!phone.trim())||(mode==='signup'&&!fullName.trim())}/><Pressable onPress={()=>{setMode(mode==='login'?'signup':'login');setAuthStage('details');setError('');}}><Text style={styles.link}>{mode==='login'?"New to Eazi's Ride? Create an account":"Already registered? Sign in"}</Text></Pressable></>}
    {error?<Text style={styles.error}>{error}</Text>:null}<Text style={styles.small}>Passenger accounts only. Driver applications are handled separately.</Text></ScrollView></KeyboardAvoidingView></SafeAreaView>;



  const formatMoney = (amount) =>
    `GHS ${Number(amount || 0).toFixed(2)}`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 25, fontWeight: "900", color: "#171717" }}>
              EAZI<Text style={{ color: "#2563EB" }}>'S RIDE</Text>
            </Text>
            <Text style={{ color: "#777", fontSize: 12, marginTop: 3 }}>
              Your ride. Your way.
            </Text>
          </View>

          <Pressable
            onPress={uploadAvatar}
            style={{ alignItems: "center", justifyContent: "center" }}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#E8E8E8" }}
              />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#171717", fontSize: 19, fontWeight: "900" }}>
                  {(profile?.full_name || profile?.name || "R").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 9, color: "#777", marginTop: 3 }}>
              Edit photo
            </Text>
          </Pressable>
        </View>

        {error ? (
          <View style={{ marginHorizontal: 20, marginBottom: 12, padding: 12, backgroundColor: "#FFF0F0", borderRadius: 12 }}>
            <Text style={{ color: "#B42318", fontSize: 12 }}>{error}</Text>
          </View>
        ) : null}


        {tab === "book" ? (
          bookingStep === "home" ? (
            <ScrollView
              style={{ flex: 1, backgroundColor: "#F8FAFC" }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 25 }}
            >
              <View style={{ height: 390, backgroundColor: "#DBEAFE" }}>
                <MapView
                  style={{ flex: 1 }}
                  region={mapRegion}
                  showsUserLocation
                  showsMyLocationButton={false}
                />

                <View style={{
                  position: "absolute",
                  top: 15,
                  left: 18,
                  backgroundColor: "#FFFFFF",
                  paddingHorizontal: 15,
                  paddingVertical: 10,
                  borderRadius: 20,
                  elevation: 3
                }}>
                  <Text style={{ color: "#1D4ED8", fontSize: 13, fontWeight: "900" }}>
                    EAZI'S RIDE
                  </Text>
                </View>

                <Pressable
                  onPress={locate}
                  style={{
                    position: "absolute",
                    right: 18,
                    bottom: 18,
                    backgroundColor: "#FFFFFF",
                    paddingHorizontal: 15,
                    paddingVertical: 12,
                    borderRadius: 25,
                    elevation: 4
                  }}
                >
                  <Text style={{ color: "#1D4ED8", fontWeight: "800", fontSize: 12 }}>
                    ◎ My location
                  </Text>
                </Pressable>
              </View>

              <View style={{
                marginHorizontal: 16,
                marginTop: -28,
                backgroundColor: "#FFFFFF",
                borderRadius: 22,
                padding: 20,
                borderWidth: 1,
                borderColor: "#DBEAFE",
                elevation: 5
              }}>
                <Text style={{
                  fontSize: 25,
                  fontWeight: "900",
                  color: "#0F172A"
                }}>
                  Where are you going?
                </Text>

                <Text style={{
                  fontSize: 13,
                  color: "#64748B",
                  marginTop: 6,
                  marginBottom: 18
                }}>
                  Your next journey starts here.
                </Text>

                <Pressable
                  onPress={() => goToBookingStep("locations")}
                  style={{
                    backgroundColor: "#EFF6FF",
                    borderWidth: 1,
                    borderColor: "#BFDBFE",
                    borderRadius: 15,
                    padding: 17,
                    flexDirection: "row",
                    alignItems: "center"
                  }}
                >
                  <View style={{
                    width: 35,
                    height: 35,
                    borderRadius: 18,
                    backgroundColor: "#DBEAFE",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12
                  }}>
                    <Text style={{ color: "#2563EB", fontSize: 19, fontWeight: "900" }}>
                      →
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: "#0F172A",
                      fontSize: 15,
                      fontWeight: "900"
                    }}>
                      Where to?
                    </Text>
                    <Text style={{
                      color: "#64748B",
                      fontSize: 11,
                      marginTop: 3
                    }}>
                      Enter your destination
                    </Text>
                  </View>

                  <Text style={{ color: "#2563EB", fontSize: 22, fontWeight: "900" }}>
                    ›
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setTab("activity")}
                  style={{
                    marginTop: 16,
                    padding: 14,
                    borderRadius: 13,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0"
                  }}
                >
                  <Text style={{ color: "#0F172A", fontWeight: "800", fontSize: 13 }}>
                    Recent activity
                  </Text>
                  <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                    View your previous and ongoing rides.
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : bookingStep === "locations" ? (
            <ScrollView
              style={{ flex: 1, backgroundColor: "#F8FAFC" }}
              contentContainerStyle={{ padding: 20, paddingBottom: 35 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={() => goToBookingStep("home")}>
                <Text style={{ color: "#2563EB", fontWeight: "800", fontSize: 14 }}>
                  ‹ Back
                </Text>
              </Pressable>

              <Text style={{
                color: "#0F172A",
                fontSize: 27,
                fontWeight: "900",
                marginTop: 22
              }}>
                Your journey
              </Text>

              <Text style={{
                color: "#64748B",
                fontSize: 13,
                marginTop: 6,
                marginBottom: 22
              }}>
                Choose your pickup, destination and any stops.
              </Text>

              <View style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 18,
                padding: 17,
                borderWidth: 1,
                borderColor: "#E2E8F0"
              }}>
                <Text style={{
                  color: "#2563EB",
                  fontSize: 11,
                  fontWeight: "900",
                  marginBottom: 8
                }}>
                  PICKUP LOCATION
                </Text>

                <TextInput
                  value={pickup}
                  onChangeText={(value) => {
                    setPickup(value);
                    setPickupPoint(null);
                  }}
                  placeholder="Enter pickup location"
                  placeholderTextColor="#94A3B8"
                  style={{
                    color: "#0F172A",
                    fontSize: 15,
                    paddingVertical: 11,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E2E8F0"
                  }}
                  onSubmitEditing={() => findSuggestions("pickup")}
                />

                <Pressable
                  onPress={locate}
                  style={{ paddingVertical: 12 }}
                >
                  <Text style={{ color: "#2563EB", fontWeight: "800" }}>
                    ◎ Use my current location
                  </Text>
                </Pressable>

                <View style={{
                  height: 1,
                  backgroundColor: "#E2E8F0",
                  marginVertical: 10
                }} />

                {stops.map((stop, index) => (
                  <View key={stop.id} style={{ marginBottom: 12 }}>
                    <Text style={{
                      color: "#64748B",
                      fontSize: 11,
                      fontWeight: "900"
                    }}>
                      STOP {index + 1}
                    </Text>

                    <View style={{
                      flexDirection: "row",
                      alignItems: "center"
                    }}>
                      <TextInput
                        value={stop.address}
                        onChangeText={(value) => updateStop(stop.id, {
                          address: value,
                          point: null
                        })}
                        placeholder="Enter stop location"
                        placeholderTextColor="#94A3B8"
                        style={{
                          flex: 1,
                          color: "#0F172A",
                          fontSize: 14,
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: "#E2E8F0"
                        }}
                        onSubmitEditing={() => findSuggestions(`stop:${stop.id}`)}
                      />

                      <Pressable
                        onPress={() => findSuggestions(`stop:${stop.id}`)}
                        style={{ padding: 10 }}
                      >
                        <Text style={{ color: "#2563EB", fontWeight: "800" }}>
                          Search
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => removeStop(stop.id)}
                        style={{ padding: 8 }}
                      >
                        <Text style={{ color: "#DC2626", fontWeight: "900" }}>
                          ×
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                <Text style={{
                  color: "#0F172A",
                  fontSize: 11,
                  fontWeight: "900",
                  marginTop: 8
                }}>
                  FINAL DESTINATION
                </Text>

                <View style={{
                  flexDirection: "row",
                  alignItems: "center"
                }}>
                  <TextInput
                    value={destination}
                    onChangeText={(value) => {
                      setDestination(value);
                      setDestinationPoint(null);
                    }}
                    placeholder="Where are you going?"
                    placeholderTextColor="#94A3B8"
                    style={{
                      flex: 1,
                      color: "#0F172A",
                      fontSize: 15,
                      paddingVertical: 11
                    }}
                    onSubmitEditing={() => findSuggestions("destination")}
                  />

                  <Pressable
                    onPress={() => findSuggestions("destination")}
                    style={{ padding: 10 }}
                  >
                    <Text style={{ color: "#2563EB", fontWeight: "800" }}>
                      Search
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={addStop}
                  style={{
                    marginTop: 15,
                    padding: 13,
                    borderRadius: 12,
                    backgroundColor: "#EFF6FF",
                    alignItems: "center"
                  }}
                >
                  <Text style={{ color: "#1D4ED8", fontWeight: "900" }}>
                    + Add a stop
                  </Text>
                </Pressable>
              </View>

              {suggestions?.length > 0 && (
                <View style={{
                  marginTop: 12,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 14,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "#E2E8F0"
                }}>
                  {suggestions.map((place, index) => (
                    <Pressable
                      key={place.place_id || place.osm_id || index}
                      onPress={() => chooseSuggestion(place)}
                      style={{
                        padding: 14,
                        borderBottomWidth: index === suggestions.length - 1 ? 0 : 1,
                        borderBottomColor: "#E2E8F0"
                      }}
                    >
                      <Text style={{ color: "#0F172A", fontSize: 13 }}>
                        {place.label || place.display_name || place.name || "Location"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {error ? (
                <Text style={{
                  color: "#DC2626",
                  fontSize: 13,
                  marginTop: 12
                }}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={() => {
                  if (!pickup.trim() || !pickupPoint) {
                    setError("Search for and select a valid pickup location.");
                    return;
                  }

                  if (stops.some(stop => !stop.address.trim() || !stop.point)) {
                    setError("Search for and select a valid location for every stop.");
                    return;
                  }

                  if (!destination.trim() || !destinationPoint) {
                    setError("Search for and select a valid destination.");
                    return;
                  }

                  setError("");
                  goToBookingStep("rides");
                }}
                style={{
                  marginTop: 22,
                  backgroundColor: "#2563EB",
                  padding: 17,
                  borderRadius: 14,
                  alignItems: "center"
                }}
              >
                <Text style={{
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: "900"
                }}>
                  Continue
                </Text>
              </Pressable>
            </ScrollView>
          ) : (
          <ScrollView
            style={{ flex: 1, backgroundColor: "#F8FAFC" }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 35 }}
          >
            <View style={{ height: 300, backgroundColor: "#DBEAFE" }}>
              <MapView
                style={{ flex: 1 }}
                region={mapRegion}
                showsUserLocation
                showsMyLocationButton={false}
              >
                {pickupPoint && (
                  <Marker
                    coordinate={{
                      latitude: Number(pickupPoint.lat),
                      longitude: Number(pickupPoint.lng),
                    }}
                    title="Pickup"
                    pinColor="#2563EB"
                  />
                )}

                {destinationPoint && (
                  <Marker
                    coordinate={{
                      latitude: Number(destinationPoint.lat),
                      longitude: Number(destinationPoint.lng),
                    }}
                    title="Destination"
                    pinColor="#171717"
                  />
                )}

                {pickupPoint && destinationPoint && (
                  <Polyline
                    coordinates={[
                      {
                        latitude: Number(pickupPoint.lat),
                        longitude: Number(pickupPoint.lng),
                      },
                      {
                        latitude: Number(destinationPoint.lat),
                        longitude: Number(destinationPoint.lng),
                      },
                    ]}
                    strokeWidth={4}
                    strokeColor="#2563EB"
                  />
                )}
              </MapView>

              <View style={{
                position: "absolute",
                top: 15,
                left: 18,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 20,
                elevation: 3
              }}>
                <Text style={{ color: "#1D4ED8", fontSize: 12, fontWeight: "900" }}>
                  EAZI'S RIDE
                </Text>
              </View>
            </View>

            <View style={{
              marginHorizontal: 16,
              marginTop: -28,
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              padding: 17,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              elevation: 5,
              shadowColor: "#000000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              zIndex: 2
            }}>
              <Text style={{ fontSize: 23, fontWeight: "900", color: "#0F172A" }}>
                Where to?
              </Text>
              <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4, marginBottom: 15 }}>
                Enter your pickup and destination.
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 11,
                  height: 11,
                  borderRadius: 6,
                  backgroundColor: "#2563EB",
                  marginRight: 12
                }} />

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "700" }}>
                    PICKUP LOCATION
                  </Text>
                  <TextInput
                    value={pickup}
                    onChangeText={(value) => {
                      setPickup(value);
                      setPickupPoint(null);
                    }}
                    placeholder="Enter pickup location"
                    placeholderTextColor="#94A3B8"
                    style={{
                      color: "#0F172A",
                      paddingVertical: 8,
                      fontSize: 14
                    }}
                    onSubmitEditing={() => findSuggestions("pickup")}
                  />
                </View>

                <Pressable
                  onPress={() => findSuggestions("pickup")}
                  style={{ padding: 9 }}
                >
                  <Text style={{ color: "#2563EB", fontWeight: "900", fontSize: 12 }}>
                    Search
                  </Text>
                </Pressable>
              </View>

              <View style={{
                height: 1,
                backgroundColor: "#E2E8F0",
                marginVertical: 5,
                marginLeft: 23
              }} />

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 11,
                  height: 11,
                  borderRadius: 2,
                  backgroundColor: "#0F172A",
                  marginRight: 12
                }} />

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "700" }}>
                    DESTINATION
                  </Text>
                  <TextInput
                    value={destination}
                    onChangeText={(value) => {
                      setDestination(value);
                      setDestinationPoint(null);
                    }}
                    placeholder="Where are you going?"
                    placeholderTextColor="#94A3B8"
                    style={{
                      color: "#0F172A",
                      paddingVertical: 8,
                      fontSize: 14
                    }}
                    onSubmitEditing={() => findSuggestions("destination")}
                  />
                </View>

                <Pressable
                  onPress={() => findSuggestions("destination")}
                  style={{ padding: 9 }}
                >
                  <Text style={{ color: "#2563EB", fontWeight: "900", fontSize: 12 }}>
                    Search
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={locate}
                style={{
                  marginTop: 10,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#E2E8F0"
                }}
              >
                <Text style={{ color: "#2563EB", fontWeight: "800", fontSize: 13 }}>
                  Use my current location
                </Text>
              </Pressable>
            </View>

            {suggestions?.length > 0 && (
              <View style={{
                marginHorizontal: 16,
                marginTop: 10,
                backgroundColor: "#FFFFFF",
                borderRadius: 14,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "#E2E8F0"
              }}>
                {suggestions.map((place, index) => (
                  <Pressable
                    key={place.place_id || place.osm_id || index}
                    onPress={() => chooseSuggestion(place)}
                    style={{
                      padding: 14,
                      borderBottomWidth: index === suggestions.length - 1 ? 0 : 1,
                      borderBottomColor: "#E2E8F0"
                    }}
                  >
                    <Text style={{ color: "#0F172A", fontSize: 13 }}>
                      {place.label || place.display_name || place.name || "Location"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={{ paddingHorizontal: 16, paddingTop: 25 }}>
              <Text style={{ fontSize: 20, fontWeight: "900", color: "#0F172A" }}>
                Choose your ride
              </Text>
              <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4, marginBottom: 13 }}>
                Select the vehicle that suits your journey.
              </Text>

              <View style={{ flexDirection: "row", gap: 9 }}>
                {[
                  { name: "economy", label: "Economy", seats: "4 seats", description: "Affordable" },
                  { name: "comfort", label: "Comfort", seats: "4 seats", description: "Extra comfort" },
                  { name: "xl", label: "XL", seats: "6 seats", description: "More space" },
                ].map((item) => {
                  const selected = rideType === item.name;
                  const baseFare = Number(estimatedFare || 0) /
                    (RIDE_TYPES[rideType]?.multiplier || 1);
                  const itemFare = baseFare *
                    (RIDE_TYPES[item.name]?.multiplier || 1);

                  return (
                    <Pressable
                      key={item.name}
                      onPress={() => setRideType(item.name)}
                      style={{
                        flex: 1,
                        backgroundColor: selected ? "#EFF6FF" : "#FFFFFF",
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? "#2563EB" : "#E2E8F0",
                        borderRadius: 15,
                        padding: 10
                      }}
                    >
                      <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "900" }}>
                        {item.name === "economy" ? "STANDARD" :
                          item.name === "comfort" ? "COMFORT" : "XL"}
                      </Text>

                      <Text style={{
                        fontSize: 12,
                        fontWeight: "900",
                        color: "#0F172A",
                        marginTop: 9
                      }}>
                        {item.label}
                      </Text>

                      <Text style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>
                        {item.seats}
                      </Text>

                      <Text style={{ fontSize: 9, color: "#64748B", marginTop: 3 }}>
                        {item.description}
                      </Text>

                      <Text style={{
                        fontSize: 12,
                        color: "#1D4ED8",
                        fontWeight: "900",
                        marginTop: 10
                      }}>
                        {formatMoney(itemFare)}
                      </Text>

                      {selected && (
                        <Text style={{
                          fontSize: 9,
                          color: "#2563EB",
                          fontWeight: "900",
                          marginTop: 4
                        }}>
                          SELECTED
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{
                fontSize: 19,
                fontWeight: "900",
                color: "#0F172A",
                marginTop: 25,
                marginBottom: 12
              }}>
                Payment method
              </Text>

              <View style={{ flexDirection: "row", gap: 10 }}>
                {["cash", "mobile_money"].map((method) => {
                  const selected = payment === method;

                  return (
                    <Pressable
                      key={method}
                      onPress={() => setPayment(method)}
                      style={{
                        flex: 1,
                        padding: 15,
                        borderRadius: 14,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? "#2563EB" : "#E2E8F0",
                        backgroundColor: selected ? "#EFF6FF" : "#FFFFFF"
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: "900",
                        color: "#0F172A"
                      }}>
                        {method === "cash" ? "Cash" : "Mobile Money"}
                      </Text>

                      <Text style={{
                        fontSize: 10,
                        color: selected ? "#1D4ED8" : "#64748B",
                        marginTop: 5
                      }}>
                        {selected ? "Selected" : "Tap to select"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{
                backgroundColor: "#0F172A",
                borderRadius: 17,
                padding: 18,
                marginTop: 22
              }}>
                <Text style={{ color: "#CBD5E1", fontSize: 12 }}>
                  Estimated trip fare
                </Text>

                <Text style={{
                  color: "#FFFFFF",
                  fontSize: 28,
                  fontWeight: "900",
                  marginTop: 5
                }}>
                  {formatMoney(estimatedFare)}
                </Text>

                <Text style={{ color: "#CBD5E1", fontSize: 11, marginTop: 6 }}>
                  {distance
                    ? `${Number(distance).toFixed(1)} km estimated distance`
                    : "Enter your locations to estimate your fare"}
                </Text>

                <View style={{
                  height: 1,
                  backgroundColor: "#334155",
                  marginVertical: 13
                }} />

                <Text style={{ color: "#CBD5E1", fontSize: 11 }}>
                  Vehicle: {RIDE_TYPES[rideType]?.label || rideType}
                </Text>

                <Text style={{ color: "#CBD5E1", fontSize: 11, marginTop: 5 }}>
                  Payment: {payment === "cash" ? "Cash" : "Mobile Money"}
                </Text>
              </View>

              <Pressable
                onPress={bookRide}
                disabled={busy}
                style={{
                  backgroundColor: busy ? "#93C5FD" : "#2563EB",
                  borderRadius: 15,
                  paddingVertical: 18,
                  alignItems: "center",
                  marginTop: 15,
                  elevation: 3
                }}
              >
                <Text style={{
                  color: "#FFFFFF",
                  fontWeight: "900",
                  fontSize: 16
                }}>
                  {busy ? "Requesting..." : "Find me a ride"}
                </Text>
              </Pressable>

              {currentRide && (
                <View style={{
                  marginTop: 15,
                  padding: 15,
                  borderRadius: 14,
                  backgroundColor: "#EFF6FF"
                }}>
                  <Text style={{ fontWeight: "900", color: "#0F172A" }}>
                    You have an active ride
                  </Text>

                  <Text style={{ color: "#475569", fontSize: 12, marginTop: 5 }}>
                    Check Activity for your ride details.
                  </Text>

                  <Pressable
                    onPress={() => setTab("activity")}
                    style={{ marginTop: 9 }}
                  >
                    <Text style={{ color: "#1D4ED8", fontWeight: "800" }}>
                      View ride
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>
          )
        ) : tab === "activity" ? (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 35 }}
          >
            <Text style={{ fontSize: 25, fontWeight: "900", color: "#171717", marginTop: 10 }}>
              Your activity
            </Text>
            <Text style={{ color: "#777", fontSize: 13, marginTop: 5, marginBottom: 20 }}>
              Your recent and ongoing rides.
            </Text>

            {history?.length ? history.map((ride, index) => (
              <View
                key={ride.id || index}
                style={{ backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E2E8F0" }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "900", color: "#171717" }}>
                    {ride.ride_type || "Ride"}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#1D4ED8" }}>
                    {ride.status || "Pending"}
                  </Text>
                </View>

                <Text style={{ color: "#555", fontSize: 12, marginTop: 12 }}>
                  Pickup: {ride.pickup_address || "Pickup"}
                </Text>
                <Text style={{ color: "#555", fontSize: 12, marginTop: 8 }}>
                  Destination: {ride.destination_address || "Destination"}
                </Text>

                <Text style={{ color: "#171717", fontWeight: "900", marginTop: 12 }}>
                  {formatMoney(ride.fare)}
                </Text>

                {["requested", "accepted", "driver_assigned"].includes(ride.status) && (
                  <Pressable
                    onPress={() => cancel(ride)}
                    style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: "#FFF0F0", alignItems: "center" }}
                  >
                    <Text style={{ color: "#B42318", fontWeight: "800", fontSize: 12 }}>
                      Cancel ride
                    </Text>
                  </Pressable>
                )}
              </View>
            )) : (
              <View style={{ backgroundColor: "white", borderRadius: 16, padding: 25, alignItems: "center" }}>
                <Text style={{ color: "#171717", fontWeight: "900", fontSize: 16, marginTop: 12 }}>
                  No rides yet
                </Text>
                <Text style={{ color: "#777", fontSize: 12, textAlign: "center", marginTop: 6 }}>
                  Your completed and ongoing rides will appear here.
                </Text>
                <Pressable onPress={() => setTab("book")} style={{ marginTop: 16, backgroundColor: "#2563EB", paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 }}>
                  <Text style={{ color: "#171717", fontWeight: "900" }}>Book a ride</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={signOut}
              style={{ padding: 15, alignItems: "center", marginTop: 12 }}
            >
              <Text style={{ color: "#B42318", fontWeight: "800" }}>
                Sign out
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            {accountPage === "main" ? (
              <>
                <Text style={{ fontSize: 25, fontWeight: "900", color: "#0F172A" }}>
                  Account
                </Text>
                <Text style={{ color: "#64748B", marginTop: 5, marginBottom: 18 }}>
                  Manage your Eazi Ride account and preferences.
                </Text>

                <Pressable
                  onPress={() => setAccountPage("profile")}
                  style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: "#BFDBFE" }}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={{ width: 54, height: 54, borderRadius: 27 }} />
                  ) : (
                    <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#1D4ED8", fontSize: 22, fontWeight: "900" }}>
                        {(profile?.full_name || "R").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 13 }}>
                    <Text style={{ color: "#0F172A", fontWeight: "900", fontSize: 16 }}>
                      {profile?.full_name || "Your profile"}
                    </Text>
                    <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
                      View and edit your profile
                    </Text>
                  </View>
                  <Text style={{ color: "#2563EB", fontSize: 22 }}>›</Text>
                </Pressable>

                {[
                  { key: "payment", title: "Payment", subtitle: "Eazi Balance and payment methods", icon: "💳" },
                  { key: "support", title: "Support", subtitle: "Get help with your rides and account", icon: "🎧" },
                  { key: "safety", title: "Safety", subtitle: "Your safety tools and information", icon: "🛡️" },
                  { key: "saved", title: "Saved Places", subtitle: "Manage your favourite destinations", icon: "📍" },
                  { key: "settings", title: "Settings", subtitle: "Communication, privacy, language and more", icon: "⚙️" },
                  { key: "food", title: "Eazi Food", subtitle: "Food delivery services", icon: "🍔" },
                  { key: "promotions", title: "Promotions", subtitle: "Offers, discounts and referral rewards", icon: "🎁" },
                  { key: "family", title: "Family Profile", subtitle: "Manage family ride arrangements", icon: "👨‍👩‍👧" },
                  { key: "work", title: "Work Profile", subtitle: "Separate work-related rides", icon: "💼" },
                  { key: "earn", title: "Earn with Eazi", subtitle: "Explore opportunities to earn", icon: "🚘" }
                ].map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setAccountPage(item.key)}
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 15, borderRadius: 14, marginBottom: 9, borderWidth: 1, borderColor: "#E2E8F0" }}
                  >
                    <Text style={{ fontSize: 22, width: 38 }}>{item.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#0F172A", fontWeight: "800", fontSize: 14 }}>{item.title}</Text>
                      <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>{item.subtitle}</Text>
                    </View>
                    <Text style={{ color: "#2563EB", fontSize: 22 }}>›</Text>
                  </Pressable>
                ))}

                <Pressable
                  onPress={signOut}
                  style={{ padding: 16, alignItems: "center", marginTop: 12, borderRadius: 12, backgroundColor: "#FEF2F2" }}
                >
                  <Text style={{ color: "#B91C1C", fontWeight: "900" }}>Log out</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setAccountPage("main")}
                  style={{ paddingVertical: 10, marginBottom: 12 }}
                >
                  <Text style={{ color: "#2563EB", fontWeight: "800", fontSize: 15 }}>‹ Back to Account</Text>
                </Pressable>

                <Text style={{ fontSize: 23, fontWeight: "900", color: "#0F172A", marginBottom: 16 }}>
                  {{
                    profile: "Profile",
                    payment: "Payment",
                    support: "Support",
                    safety: "Safety",
                    saved: "Saved Places",
                    settings: "Settings",
                    food: "Eazi Food",
                    promotions: "Promotions",
                    family: "Family Profile",
                    work: "Work Profile",
                    earn: "Earn with Eazi"
                  }[accountPage] || "Account"}
                </Text>

                {accountPage === "profile" ? (
                  <View style={{ backgroundColor: "#FFFFFF", padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
                    <Text style={{ color: "#64748B", fontSize: 12, marginBottom: 5 }}>Full name</Text>
                    <Text style={{ color: "#0F172A", fontWeight: "800", fontSize: 16 }}>{profile?.full_name || "Not provided"}</Text>
                    <Text style={{ color: "#64748B", fontSize: 12, marginTop: 16, marginBottom: 5 }}>Email address</Text>
                    <Text style={{ color: "#0F172A", fontWeight: "700" }}>{profile?.email || "Not provided"}</Text>
                    <Text style={{ color: "#64748B", fontSize: 12, marginTop: 16, marginBottom: 5 }}>Phone number</Text>
                    <Text style={{ color: "#0F172A", fontWeight: "700" }}>{profile?.phone || "Not provided"}</Text>

                    <Pressable onPress={uploadAvatar} style={{ backgroundColor: "#2563EB", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 22 }}>
                      <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>Add / Change Profile Picture</Text>
                    </Pressable>

                    <View style={{ marginTop: 18, padding: 13, backgroundColor: "#EFF6FF", borderRadius: 12 }}>
                      <Text style={{ color: "#1D4ED8", fontWeight: "800" }}>Email verification</Text>
                      <Text style={{ color: "#64748B", fontSize: 12, marginTop: 5 }}>Verification status and email editing still need to be connected.</Text>
                    </View>
                    <View style={{ marginTop: 10, padding: 13, backgroundColor: "#EFF6FF", borderRadius: 12 }}>
                      <Text style={{ color: "#1D4ED8", fontWeight: "800" }}>Identity verification</Text>
                      <Text style={{ color: "#64748B", fontSize: 12, marginTop: 5 }}>Identity verification is not yet connected.</Text>
                    </View>
                  </View>
                ) : accountPage === "settings" ? (
                  <View style={{ backgroundColor: "#FFFFFF", padding: 15, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
                    {[
                      "Communication",
                      "Calendar",
                      "Language",
                      "Privacy",
                      "Sign in and Security",
                      "Legal"
                    ].map((item) => (
                      <View key={item} style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
                        <Text style={{ color: "#0F172A", fontWeight: "800" }}>{item}</Text>
                        <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>Settings options will be connected here.</Text>
                      </View>
                    ))}
                    <Pressable onPress={signOut} style={{ paddingVertical: 17 }}>
                      <Text style={{ color: "#B91C1C", fontWeight: "900" }}>Log out</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ backgroundColor: "#EFF6FF", padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#BFDBFE" }}>
                    <Text style={{ color: "#1D4ED8", fontWeight: "900", fontSize: 15 }}>Coming soon</Text>
                    <Text style={{ color: "#475569", fontSize: 13, lineHeight: 20, marginTop: 8 }}>
                      This section is part of the Eazi Ride account experience. Its services and backend integration are not yet connected.
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
        <View style={{ flexDirection: "row", marginHorizontal: 0, marginTop: "auto", backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderColor: "#DBEAFE" }}>
          <Pressable
            onPress={() => setTab("book")}
            style={{ flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: tab === "book" ? "#2563EB" : "transparent", alignItems: "center" }}
          >
            <Text style={{ fontWeight: "800", color: tab === "book" ? "#FFFFFF" : "#64748B" }}>Home</Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("activity")}
            style={{ flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: tab === "activity" ? "#2563EB" : "transparent", alignItems: "center" }}
          >
            <Text style={{ fontWeight: "800", color: tab === "activity" ? "#FFFFFF" : "#64748B" }}>Activity</Text>
          </Pressable>

          <Pressable
            onPress={() => { setTab("account"); setAccountPage("main"); }}
            style={{ flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: tab === "account" ? "#2563EB" : "transparent", alignItems: "center" }}
          >
            <Text style={{ fontWeight: "800", color: tab === "account" ? "#FFFFFF" : "#64748B" }}>Account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,justifyContent:'center',alignItems:'center',padding:24},auth:{flexGrow:1,justifyContent:'center',width:'100%',gap:12,padding:22,paddingBottom:40},fieldWrap:{marginVertical:3},fieldLabel:{fontSize:13,fontWeight:'700',color:'#334155',marginBottom:4},authSwitch:{flexDirection:'row',gap:8},authChoice:{flex:1,padding:12,alignItems:'center',borderRadius:10,backgroundColor:'#E2E8F0'},authChoiceActive:{backgroundColor:'#DBEAFE',borderWidth:1,borderColor:'#2563EB'},passwordRow:{flexDirection:'row',alignItems:'flex-end',gap:8},eyeButton:{height:50,justifyContent:'center',paddingHorizontal:12,backgroundColor:'#EFF6FF',borderRadius:12},profileHeader:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:48,height:48,borderRadius:24},avatarPlaceholder:{width:48,height:48,borderRadius:24,backgroundColor:'#DBEAFE',alignItems:'center',justifyContent:'center'},avatarInitial:{fontSize:20,fontWeight:'900',color:'#1D4ED8'},suggestionBox:{backgroundColor:'#fff',borderRadius:14,padding:10,borderWidth:1,borderColor:'#CBD5E1'},suggestionItem:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#E2E8F0'},suggestionText:{fontSize:13,color:'#334155'},brandLogo:{width:230,height:76,alignSelf:'center'},brand:{fontSize:22,fontWeight:'900',letterSpacing:1,color:'#1E3A8A'},subtitle:{color:'#64748B',textAlign:'center',marginBottom:12},heading:{fontSize:23,fontWeight:'800',color:'#0F172A',marginVertical:12},muted:{color:'#64748B',fontSize:13},small:{color:'#64748B',fontSize:11,lineHeight:16},header:{padding:18,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#E2E8F0'},link:{color:'#2563EB',fontWeight:'700',padding:8},input:{backgroundColor:'#fff',borderColor:'#CBD5E1',borderWidth:1,borderRadius:14,padding:15,fontSize:15,color:'#0F172A',marginVertical:5},button:{backgroundColor:'#2563EB',padding:16,borderRadius:14,alignItems:'center',marginVertical:6},buttonText:{color:'#fff',fontWeight:'800',fontSize:15},secondary:{backgroundColor:'#EFF6FF',borderWidth:1,borderColor:'#BFDBFE'},secondaryText:{color:'#1D4ED8'},tabs:{flexDirection:'row',backgroundColor:'#fff',paddingHorizontal:12},tab:{flex:1,padding:15,alignItems:'center',borderBottomWidth:3,borderColor:'transparent'},tabActive:{borderColor:'#2563EB'},tabText:{color:'#64748B',fontWeight:'600'},tabTextActive:{color:'#1D4ED8',fontWeight:'800'},content:{padding:18,paddingBottom:36,gap:8},map:{height:220,borderRadius:16,marginVertical:10},section:{fontWeight:'800',fontSize:16,color:'#0F172A',marginTop:14},rideTypes:{flexDirection:'row',gap:8},rideCard:{flex:1,padding:14,borderRadius:14,borderWidth:1,borderColor:'#CBD5E1',backgroundColor:'#fff'},rideSelected:{borderColor:'#2563EB',backgroundColor:'#EFF6FF'},rideName:{fontWeight:'800',color:'#0F172A'},estimate:{padding:16,backgroundColor:'#fff',borderRadius:16,marginVertical:12},fare:{fontSize:25,fontWeight:'900',color:'#1D4ED8',marginVertical:4},rideHistory:{backgroundColor:'#fff',padding:16,borderRadius:16,marginBottom:12,borderWidth:1,borderColor:'#E2E8F0'},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},fareSmall:{fontWeight:'900',color:'#1D4ED8'},address:{fontSize:13,color:'#334155',marginTop:6},footer:{padding:10,alignItems:'center',borderTopWidth:1,borderColor:'#E2E8F0'},error:{color:'#B91C1C',backgroundColor:'#FEE2E2',padding:12,borderRadius:12,marginVertical:8}});







