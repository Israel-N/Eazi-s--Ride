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
const money = (n) => `GH₵ ${Number(n || 0).toFixed(2)}`;
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
  const [rideType,setRideType]=useState('economy'), [payment,setPayment]=useState('cash'), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [currentRide,setCurrentRide]=useState(null), [history,setHistory]=useState([]), [tab,setTab]=useState('book');
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
    const query=target==='pickup'?pickup:destination;
    if(!query.trim()){setError(`Enter a ${target} location first.`);return;}
    setBusy(true);setError('');setSuggestions([]);setSuggestionTarget(target);
    try{const rows=await searchPlaces(query.trim());if(!rows.length)throw new Error('No matching Ghana locations found. Try a town, community, landmark or business name.');setSuggestions(rows);}
    catch(e){setError(e.message);setSuggestionTarget(null);}finally{setBusy(false);}
  };
  const chooseSuggestion=(place)=>{
    if(suggestionTarget==='pickup'){setPickup(place.label);setPickupPoint(place);}else{setDestination(place.label);setDestinationPoint(place);}
    setSuggestions([]);setSuggestionTarget(null);setError('');
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

  if(loading)return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading Eazi's Ride…</Text></SafeAreaView>;
  if(!session)return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={Platform.OS==='ios'?12:0} style={{flex:1}}><ScrollView contentContainerStyle={styles.auth} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets><Image source={require('./assets/brand-logo.png')} style={styles.brandLogo} resizeMode="contain"/><Text style={styles.subtitle}>Your ride, made easy.</Text><Text style={styles.heading}>{authStage==='otp'?'Verify your account':mode==='login'?'Welcome back':'Create your passenger account'}</Text>
    {authStage==='otp'?<><Text style={styles.muted}>Enter the 6-digit code sent to {authMethod==='email'?email:phone}.</Text><Field label="6-digit verification code" placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} value={otp} onChangeText={setOtp}/><Button title={busy?'Verifying…':'Verify code'} onPress={authAction} disabled={busy||otp.length!==6}/><Button title="Back" secondary onPress={()=>{setAuthStage('details');setOtp('');}}/></>:<>
    <View style={styles.authSwitch}><Pressable onPress={()=>{setAuthMethod('email');setError('');}} style={[styles.authChoice,authMethod==='email'&&styles.authChoiceActive]}><Text>Email</Text></Pressable><Pressable onPress={()=>{setAuthMethod('phone');setError('');}} style={[styles.authChoice,authMethod==='phone'&&styles.authChoiceActive]}><Text>Phone</Text></Pressable></View>
    {mode==='signup'&&<Field label="Full name" placeholder="Your full name" autoCapitalize="words" autoComplete="name" value={fullName} onChangeText={setFullName}/>}
    {authMethod==='email'?<><Field label="Email address" placeholder="name@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail}/><View style={styles.passwordRow}><View style={{flex:1}}><Field label="Password" placeholder="At least 8 characters" autoCapitalize="none" autoComplete={mode==='login'?'current-password':'new-password'} secureTextEntry={!showPassword} value={password} onChangeText={setPassword}/></View><Pressable accessibilityRole="button" accessibilityLabel={showPassword?'Hide password':'Show password'} style={styles.eyeButton} onPress={()=>setShowPassword(v=>!v)}><Text style={styles.link}>{showPassword?'Hide':'Show'}</Text></Pressable></View></>:<Field label="Phone number" placeholder="+233XXXXXXXXX" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone}/>}
    <Button title={busy?'Please wait…':mode==='login'?(authMethod==='email'?'Sign in':'Send SMS code'):(authMethod==='email'?'Create account and send code':'Send SMS code')} onPress={authAction} disabled={busy||(authMethod==='email'&&(!email.trim()||password.length<(mode==='signup'?8:1)))||(authMethod==='phone'&&!phone.trim())||(mode==='signup'&&!fullName.trim())}/><Pressable onPress={()=>{setMode(mode==='login'?'signup':'login');setAuthStage('details');setError('');}}><Text style={styles.link}>{mode==='login'?"New to Eazi's Ride? Create an account":"Already registered? Sign in"}</Text></Pressable></>}
    {error?<Text style={styles.error}>{error}</Text>:null}<Text style={styles.small}>Passenger accounts only. Driver applications are handled separately.</Text></ScrollView></KeyboardAvoidingView></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><View style={styles.header}><View style={styles.profileHeader}>{avatarUrl?<Image source={{uri:avatarUrl}} style={styles.avatar}/>:<View style={styles.avatarPlaceholder}><Text style={styles.avatarInitial}>{(profile?.full_name||'R').slice(0,1).toUpperCase()}</Text></View>}<View><Text style={styles.brand}>EAZI'S RIDE</Text><Text style={styles.muted}>Hello, {profile?.full_name||'there'}</Text><Pressable onPress={uploadAvatar}><Text style={styles.link}>Change profile picture</Text></Pressable></View></View><Pressable onPress={signOut}><Text style={styles.link}>Sign out</Text></Pressable></View>
    <View style={styles.tabs}><Pressable onPress={()=>setTab('book')} style={[styles.tab,tab==='book'&&styles.tabActive]}><Text style={tab==='book'?styles.tabTextActive:styles.tabText}>Book a ride</Text></Pressable><Pressable onPress={()=>setTab('activity')} style={[styles.tab,tab==='activity'&&styles.tabActive]}><Text style={tab==='activity'?styles.tabTextActive:styles.tabText}>My rides</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {error?<Text style={styles.error}>{error}</Text>:null}
      {tab==='book'?<>
        <Text style={styles.heading}>Where are you going?</Text><Field label="Pickup location" placeholder="Enter town, community, landmark or business" value={pickup} onChangeText={v=>{setPickup(v);setPickupPoint(null);setSuggestions([]);setSuggestionTarget(null);}}/><Button title={busy?'Searching…':'Search pickup suggestions'} secondary onPress={()=>findSuggestions('pickup')} disabled={busy||!pickup.trim()}/><Button title={busy?'Getting location…':'Use my current location'} secondary onPress={locate} disabled={busy}/><Field label="Destination" placeholder="Enter town, community, landmark or business" value={destination} onChangeText={v=>{setDestination(v);setDestinationPoint(null);setSuggestions([]);setSuggestionTarget(null);}}/><Button title={busy?'Searching…':'Search destination suggestions'} secondary onPress={()=>findSuggestions('destination')} disabled={busy||!destination.trim()}/>{suggestions.length>0&&<View style={styles.suggestionBox}><Text style={styles.section}>Choose the correct {suggestionTarget}:</Text>{suggestions.map((place,index)=><Pressable key={`${place.lat}-${place.lng}-${index}`} style={styles.suggestionItem} onPress={()=>chooseSuggestion(place)}><Text style={styles.suggestionText}>{place.label}</Text></Pressable>)}</View>}
        {(pickupPoint || destinationPoint) ? (
          <MapView
            style={styles.map}
            region={{
              latitude: ((pickupPoint?.lat ?? destinationPoint?.lat ?? 5.6037) + (destinationPoint?.lat ?? pickupPoint?.lat ?? 5.6037)) / 2,
              longitude: ((pickupPoint?.lng ?? destinationPoint?.lng ?? -0.1870) + (destinationPoint?.lng ?? pickupPoint?.lng ?? -0.1870)) / 2,
              latitudeDelta: 0.06,
              longitudeDelta: 0.06,
            }}
          >
            {pickupPoint ? <Marker coordinate={{ latitude: pickupPoint.lat, longitude: pickupPoint.lng }} title="Pickup" pinColor="green" /> : null}
            {destinationPoint ? <Marker coordinate={{ latitude: destinationPoint.lat, longitude: destinationPoint.lng }} title="Destination" pinColor="red" /> : null}
            {pickupPoint && destinationPoint ? <Polyline coordinates={[{ latitude: pickupPoint.lat, longitude: pickupPoint.lng }, { latitude: destinationPoint.lat, longitude: destinationPoint.lng }]} strokeColor="#2563EB" strokeWidth={4} /> : null}
          </MapView>
        ) : null}
        <Text style={styles.section}>Choose your ride</Text><View style={styles.rideTypes}>{Object.entries(RIDE_TYPES).map(([key,v])=><Pressable key={key} onPress={()=>setRideType(key)} style={[styles.rideCard,rideType===key&&styles.rideSelected]}><Text style={styles.rideName}>{v.label}</Text><Text style={styles.muted}>{v.seats} seats</Text></Pressable>)}</View>
        <Text style={styles.section}>Payment method</Text><View style={styles.rideTypes}><Pressable onPress={()=>setPayment('cash')} style={[styles.rideCard,payment==='cash'&&styles.rideSelected]}><Text style={styles.rideName}>Cash</Text></Pressable><Pressable onPress={()=>setPayment('mobile_money')} style={[styles.rideCard,payment==='mobile_money'&&styles.rideSelected]}><Text style={styles.rideName}>Mobile Money</Text></Pressable></View>
        {distance>0&&<View style={styles.estimate}><Text style={styles.muted}>Straight-line distance estimate: {distance.toFixed(1)} km</Text><Text style={styles.fare}>{money(estimatedFare)}</Text><Text style={styles.small}>Final fare is calculated by the Supabase request_ride function. Route distance and price may differ.</Text></View>}
        <Button title={busy?'Sending request…':'Request ride'} onPress={bookRide} disabled={busy||!pickupPoint||!destinationPoint}/>
      </>:<>
        <Text style={styles.heading}>Ride activity</Text>{history.length===0?<Text style={styles.muted}>Your rides will appear here.</Text>:history.map(ride=><View key={ride.id} style={styles.rideHistory}><View style={styles.row}><Text style={styles.rideName}>{String(ride.status).replace('_',' ').toUpperCase()}</Text><Text style={styles.fareSmall}>{money(ride.fare)}</Text></View><Text style={styles.address}>From: {ride.pickup_address}</Text><Text style={styles.address}>To: {ride.destination_address}</Text><Text style={styles.small}>{new Date(ride.created_at).toLocaleString()}</Text>{['requested','accepted','arriving','arrived'].includes(ride.status)&&<Button title="Cancel ride" secondary onPress={()=>cancel(ride)}/>}</View>)}
      </>}
    </ScrollView>
    <View style={styles.footer}><Text style={styles.small}>Eazi's Ride · Akosombo and beyond</Text></View>
  </SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,justifyContent:'center',alignItems:'center',padding:24},auth:{flexGrow:1,justifyContent:'center',width:'100%',gap:12,padding:22,paddingBottom:40},fieldWrap:{marginVertical:3},fieldLabel:{fontSize:13,fontWeight:'700',color:'#334155',marginBottom:4},authSwitch:{flexDirection:'row',gap:8},authChoice:{flex:1,padding:12,alignItems:'center',borderRadius:10,backgroundColor:'#E2E8F0'},authChoiceActive:{backgroundColor:'#DBEAFE',borderWidth:1,borderColor:'#2563EB'},passwordRow:{flexDirection:'row',alignItems:'flex-end',gap:8},eyeButton:{height:50,justifyContent:'center',paddingHorizontal:12,backgroundColor:'#EFF6FF',borderRadius:12},profileHeader:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:48,height:48,borderRadius:24},avatarPlaceholder:{width:48,height:48,borderRadius:24,backgroundColor:'#DBEAFE',alignItems:'center',justifyContent:'center'},avatarInitial:{fontSize:20,fontWeight:'900',color:'#1D4ED8'},suggestionBox:{backgroundColor:'#fff',borderRadius:14,padding:10,borderWidth:1,borderColor:'#CBD5E1'},suggestionItem:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#E2E8F0'},suggestionText:{fontSize:13,color:'#334155'},brandLogo:{width:230,height:76,alignSelf:'center'},brand:{fontSize:22,fontWeight:'900',letterSpacing:1,color:'#1E3A8A'},subtitle:{color:'#64748B',textAlign:'center',marginBottom:12},heading:{fontSize:23,fontWeight:'800',color:'#0F172A',marginVertical:12},muted:{color:'#64748B',fontSize:13},small:{color:'#64748B',fontSize:11,lineHeight:16},header:{padding:18,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#E2E8F0'},link:{color:'#2563EB',fontWeight:'700',padding:8},input:{backgroundColor:'#fff',borderColor:'#CBD5E1',borderWidth:1,borderRadius:14,padding:15,fontSize:15,color:'#0F172A',marginVertical:5},button:{backgroundColor:'#2563EB',padding:16,borderRadius:14,alignItems:'center',marginVertical:6},buttonText:{color:'#fff',fontWeight:'800',fontSize:15},secondary:{backgroundColor:'#EFF6FF',borderWidth:1,borderColor:'#BFDBFE'},secondaryText:{color:'#1D4ED8'},tabs:{flexDirection:'row',backgroundColor:'#fff',paddingHorizontal:12},tab:{flex:1,padding:15,alignItems:'center',borderBottomWidth:3,borderColor:'transparent'},tabActive:{borderColor:'#2563EB'},tabText:{color:'#64748B',fontWeight:'600'},tabTextActive:{color:'#1D4ED8',fontWeight:'800'},content:{padding:18,paddingBottom:36,gap:8},map:{height:220,borderRadius:16,marginVertical:10},section:{fontWeight:'800',fontSize:16,color:'#0F172A',marginTop:14},rideTypes:{flexDirection:'row',gap:8},rideCard:{flex:1,padding:14,borderRadius:14,borderWidth:1,borderColor:'#CBD5E1',backgroundColor:'#fff'},rideSelected:{borderColor:'#2563EB',backgroundColor:'#EFF6FF'},rideName:{fontWeight:'800',color:'#0F172A'},estimate:{padding:16,backgroundColor:'#fff',borderRadius:16,marginVertical:12},fare:{fontSize:25,fontWeight:'900',color:'#1D4ED8',marginVertical:4},rideHistory:{backgroundColor:'#fff',padding:16,borderRadius:16,marginBottom:12,borderWidth:1,borderColor:'#E2E8F0'},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},fareSmall:{fontWeight:'900',color:'#1D4ED8'},address:{fontSize:13,color:'#334155',marginTop:6},footer:{padding:10,alignItems:'center',borderTopWidth:1,borderColor:'#E2E8F0'},error:{color:'#B91C1C',backgroundColor:'#FEE2E2',padding:12,borderRadius:12,marginVertical:8}});
