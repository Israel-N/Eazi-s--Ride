import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function Field({ label, ...props }) {
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#94A3B8" style={styles.input} {...props} /></View>;
}
function Button({ title, onPress, disabled, secondary }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>;
}

export function DriverAuthScreen({ supabase, configured }) {
  const [mode, setMode] = useState('login');
  const [method, setMethod] = useState('email');
  const [stage, setStage] = useState('details');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+233');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message || 'Authentication failed.'); } finally { setBusy(false); } };
  const sendEmailOtp = () => run(async () => {
    if (mode === 'signup') {
      if (!fullName.trim()) throw new Error('Enter your full name.');
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      const { error: e } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: fullName.trim() } } });
      if (e) throw e;
      setStage('otp');
      Alert.alert('Check your email', 'Enter the verification code sent to your email address.');
    } else {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (e) throw e;
    }
  });
  const sendPhoneOtp = () => run(async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) throw new Error('Enter your phone number with country code, e.g. +233XXXXXXXXX.');
    const { error: e } = await supabase.auth.signInWithOtp({ phone: phone.trim(), options: { shouldCreateUser: mode === 'signup', ...(mode === 'signup' ? { data: { full_name: fullName.trim(), phone: phone.trim() } } : {}) } });
    if (e) throw e;
    setStage('otp');
    Alert.alert('SMS sent', 'Enter the verification code sent to your phone.');
  });
  const verify = () => run(async () => {
    if (!/^\d{6}$/.test(otp.trim())) throw new Error('Enter the 6-digit verification code.');
    const payload = method === 'email'
      ? { email: email.trim().toLowerCase(), token: otp.trim(), type: 'signup' }
      : { phone: phone.trim(), token: otp.trim(), type: 'sms' };
    const { error: e } = await supabase.auth.verifyOtp(payload);
    if (e) throw e;
  });

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={styles.brand}>EAZI DRIVER</Text><Text style={styles.heading}>{stage === 'otp' ? 'Verify your account' : mode === 'signup' ? 'Create your driver account' : 'Driver sign in'}</Text>
      {stage === 'otp' ? <>
        <Text style={styles.hint}>Enter the 6-digit code sent to {method === 'email' ? email : phone}.</Text>
        <Field label="6-digit verification code" placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} value={otp} onChangeText={setOtp}/>
        <Button title={busy ? 'Verifying…' : 'Verify code'} onPress={verify} disabled={busy || otp.length !== 6}/>
        <Button title="Back" secondary onPress={() => { setStage('details'); setOtp(''); }} disabled={busy}/>
      </> : <>
        <View style={styles.switchRow}><Pressable onPress={() => { setMethod('email'); setError(''); }} style={[styles.switch, method === 'email' && styles.active]}><Text style={styles.switchText}>Email</Text></Pressable><Pressable onPress={() => { setMethod('phone'); setError(''); }} style={[styles.switch, method === 'phone' && styles.active]}><Text style={styles.switchText}>Phone</Text></Pressable></View>
        <View style={styles.switchRow}><Pressable onPress={() => { setMode('login'); setError(''); }} style={[styles.switch, mode === 'login' && styles.active]}><Text style={styles.switchText}>Sign in</Text></Pressable><Pressable onPress={() => { setMode('signup'); setError(''); }} style={[styles.switch, mode === 'signup' && styles.active]}><Text style={styles.switchText}>Register</Text></Pressable></View>
        {mode === 'signup' && <Field label="Full name" placeholder="Your full name" autoCapitalize="words" autoComplete="name" value={fullName} onChangeText={setFullName}/>}
        {method === 'email' ? <>
          <Field label="Email address" placeholder="name@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail}/>
          <View style={styles.passwordRow}><View style={styles.passwordField}><Field label="Password" placeholder="At least 8 characters" autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} secureTextEntry={!showPassword} value={password} onChangeText={setPassword}/></View><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(v => !v)} style={styles.eye}><Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable></View>
        </> : <Field label="Phone number" placeholder="+233 XXX XXX XXX" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone}/>}
        <Button title={busy ? 'Please wait…' : mode === 'login' ? (method === 'email' ? 'Sign in' : 'Send SMS code') : (method === 'email' ? 'Create account and send code' : 'Send SMS code')} onPress={method === 'email' ? sendEmailOtp : sendPhoneOtp} disabled={busy || !configured || (method === 'email' && (!email.trim() || password.length < (mode === 'signup' ? 8 : 1))) || (method === 'phone' && !phone.trim()) || (mode === 'signup' && !fullName.trim())}/>
      </>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!configured ? <Text style={styles.error}>Supabase configuration is missing. Add the app's EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.</Text> : null}
      <Text style={styles.hint}>New driver accounts remain applicants until an administrator approves the application. Verification does not grant driver access.</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

export function DriverApplicationScreen({ supabase, profile, application, onSubmitted, onSignOut }) {
  const [form, setForm] = useState({ full_name: profile?.full_name || '', phone: profile?.phone || '', license_number: '', vehicle_make: '', vehicle_model: '', vehicle_color: '', license_plate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const required = ['full_name','phone','license_number','vehicle_make','vehicle_model','vehicle_color','license_plate'];
      const missing = required.find(k => !String(form[k] || '').trim());
      if (missing) throw new Error('Complete all application fields before submitting.');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const { error: e } = await supabase.from('driver_applications').upsert({ ...form, user_id: user.id, status: 'pending', submitted_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null, review_reason: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (e) throw e;
      await onSubmitted();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const fields = [
    ['full_name','Full name','Your legal full name','default'], ['phone','Phone number','+233XXXXXXXXX','phone-pad'],
    ['license_number','Driver licence number','Licence number','default'], ['vehicle_make','Vehicle make','e.g. Toyota','default'],
    ['vehicle_model','Vehicle model','e.g. Corolla','default'], ['vehicle_color','Vehicle colour','e.g. Silver','default'], ['license_plate','Vehicle registration number','e.g. GR 1234-24','default'],
  ];
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Text style={styles.brand}>EAZI DRIVER</Text><Text style={styles.heading}>Driver application</Text>
    {application ? <View style={styles.notice}><Text style={styles.noticeTitle}>Application: {application.status.toUpperCase()}</Text><Text style={styles.hint}>{application.status === 'pending' ? 'Your application has been submitted and is waiting for admin review.' : application.status === 'rejected' ? `Your application was not approved. ${application.review_reason || 'You can update your details and resubmit.'}` : 'Your driver application status is being reviewed.'}</Text></View> : <Text style={styles.hint}>Your account is verified. Complete the details below. An administrator must approve your application before you can go online or accept rides.</Text>}
    {fields.map(([key,label,placeholder,type]) => <View key={key} style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} placeholder={placeholder} placeholderTextColor="#94A3B8" keyboardType={type === 'phone-pad' ? 'phone-pad' : 'default'} autoCapitalize={key === 'full_name' ? 'words' : 'characters'} value={String(form[key] || '')} onChangeText={v => update(key,v)} editable={!application || application.status === 'rejected'}/></View>)}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {(!application || application.status === 'rejected') && <Button title={busy ? 'Submitting…' : application ? 'Resubmit application' : 'Submit driver application'} onPress={submit} disabled={busy}/>}
    <Button title="Sign out" secondary onPress={onSignOut} disabled={busy}/>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#F8FAFC'}, flex:{flex:1}, content:{flexGrow:1,justifyContent:'center',padding:22,paddingBottom:40,gap:10}, brand:{fontSize:14,fontWeight:'900',letterSpacing:2,color:'#2563EB',textAlign:'center',marginBottom:8}, heading:{fontSize:23,fontWeight:'900',color:'#0F172A',marginBottom:8}, hint:{fontSize:13,color:'#64748B',lineHeight:19,marginVertical:4}, fieldWrap:{marginTop:5}, label:{fontSize:13,fontWeight:'700',color:'#334155',marginBottom:5}, input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#CBD5E1',borderRadius:12,padding:14,color:'#0F172A',fontSize:15,minHeight:50}, passwordRow:{flexDirection:'row',alignItems:'flex-end',gap:8}, passwordField:{flex:1}, eye:{height:50,justifyContent:'center',paddingHorizontal:12,marginBottom:0,borderRadius:12,backgroundColor:'#E2E8F0'}, eyeText:{fontWeight:'800',color:'#1E40AF'}, button:{backgroundColor:'#2563EB',padding:15,borderRadius:12,alignItems:'center',marginTop:8}, buttonText:{color:'#fff',fontWeight:'800'}, secondary:{backgroundColor:'#E2E8F0'}, secondaryText:{color:'#0F172A'}, disabled:{opacity:.5}, switchRow:{flexDirection:'row',gap:8}, switch:{flex:1,padding:12,borderRadius:10,backgroundColor:'#E2E8F0',alignItems:'center'}, active:{backgroundColor:'#DBEAFE',borderWidth:1,borderColor:'#2563EB'}, switchText:{fontWeight:'800',color:'#1E293B'}, error:{color:'#B91C1C',backgroundColor:'#FEE2E2',padding:10,borderRadius:10,marginTop:8}, notice:{backgroundColor:'#FEF3C7',padding:14,borderRadius:12}, noticeTitle:{fontWeight:'900',color:'#92400E'} });
