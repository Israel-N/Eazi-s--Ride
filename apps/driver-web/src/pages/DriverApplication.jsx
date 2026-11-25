import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/Button';

const initial = { fullName: '', phone: '', licenseNumber: '', vehicleMake: '', vehicleModel: '', vehicleColor: '', licensePlate: '' };
const DriverApplication = () => {
  const { user, profile } = useAuth();
  const [form, setForm] = useState(initial);
  const [licenseFile, setLicenseFile] = useState(null);
  const [vehicleFile, setVehicleFile] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!user) return;
    supabase.from('driver_applications').select('*').eq('user_id', user.id).maybeSingle().then(({data})=>{
      if (data) { setApplication(data); setForm({fullName:data.full_name,phone:data.phone,licenseNumber:data.license_number,vehicleMake:data.vehicle_make,vehicleModel:data.vehicle_model,vehicleColor:data.vehicle_color,licensePlate:data.license_plate}); }
    });
  }, [user?.id]);
  const set = (key) => (e) => setForm(v=>({...v,[key]:e.target.value}));
  const upload = async (file, label) => {
    if (!file) return null;
    const allowed = ['image/jpeg','image/png','application/pdf'];
    if (!allowed.includes(file.type)) throw new Error(`${label} must be a JPG, PNG, or PDF file.`);
    if (file.size > 10 * 1024 * 1024) throw new Error(`${label} must be 10 MB or smaller.`);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${user.id}/${label}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('driver-documents').upload(path,file,{contentType:file.type,upsert:false});
    if (uploadError) throw uploadError;
    return path;
  };
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      if (!user) throw new Error('Sign in before applying.');
      if (profile?.role !== 'rider') throw new Error('This application form is only for rider accounts that have not already been approved as drivers.');
      const licensePath = await upload(licenseFile,'driving-licence');
      const vehiclePath = await upload(vehicleFile,'vehicle-document');
      const { data, error: rpcError } = await supabase.rpc('submit_driver_application', {
        p_full_name: form.fullName, p_phone: form.phone, p_license_number: form.licenseNumber,
        p_vehicle_make: form.vehicleMake, p_vehicle_model: form.vehicleModel, p_vehicle_color: form.vehicleColor,
        p_license_plate: form.licensePlate, p_license_document_path: licensePath || application?.license_document_path || null,
        p_vehicle_document_path: vehiclePath || application?.vehicle_document_path || null,
      });
      if (rpcError) throw rpcError;
      setApplication(data); setNotice('Application submitted. Your driver account stays disabled until an administrator approves it.');
    } catch (e) { setError(e.message || 'Could not submit application.'); }
    finally { setLoading(false); }
  };
  if (profile?.role === 'driver') return <main className="max-w-xl mx-auto p-6"><div className="rounded-2xl border bg-white p-6"><ShieldCheck className="text-green-600 mb-3" size={32}/><h1 className="text-2xl font-bold">Driver account</h1><p className="mt-2 text-gray-600">Your account is configured as a driver. Open the driver dashboard to check availability.</p><Link className="inline-block mt-4 text-blue-600 font-semibold" to="/">Go to driver dashboard</Link></div></main>;
  return <main className="max-w-2xl mx-auto p-4 md:p-8"><h1 className="text-3xl font-bold">Apply to drive</h1><p className="text-gray-500 mt-2 mb-6">Submit your driver and vehicle details. Upload documents only through this private form.</p>
    {application && <div className="mb-4 rounded-xl bg-blue-50 p-3 text-blue-800 text-sm">Current application status: <b className="uppercase">{application.status}</b>{application.review_reason ? ` — ${application.review_reason}` : ''}</div>}
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-700 text-sm">{error}</div>}{notice && <div role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-green-700 text-sm">{notice}</div>}
    <form onSubmit={submit} className="rounded-2xl border bg-white p-5 md:p-7 space-y-4">
      {[['fullName','Full legal name'],['phone','Phone number'],['licenseNumber','Driving licence number'],['vehicleMake','Vehicle make'],['vehicleModel','Vehicle model'],['vehicleColor','Vehicle colour'],['licensePlate','Vehicle registration number']].map(([key,label])=><label key={key} className="block text-sm font-semibold">{label}<input required value={form[key]} onChange={set(key)} maxLength={120} className="mt-1 block w-full rounded-xl border p-3 font-normal" /></label>)}
      <label className="block text-sm font-semibold">Driving licence document (JPG, PNG or PDF; max 10 MB)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setLicenseFile(e.target.files?.[0]||null)} className="mt-2 block w-full text-sm"/><span className="mt-1 block text-xs text-gray-500">{licenseFile?.name || (application?.license_document_path ? 'Existing document saved privately' : 'Optional for draft submission; required before approval by your administrator')}</span></label>
      <label className="block text-sm font-semibold">Vehicle document (JPG, PNG or PDF; max 10 MB)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setVehicleFile(e.target.files?.[0]||null)} className="mt-2 block w-full text-sm"/><span className="mt-1 block text-xs text-gray-500">{vehicleFile?.name || (application?.vehicle_document_path ? 'Existing document saved privately' : 'Optional for draft submission; required before approval by your administrator')}</span></label>
      <Button type="submit" className="w-full py-3" disabled={loading}>{loading?'Submitting…':application?'Update application':'Submit application'}</Button>
    </form>
    <p className="mt-4 text-xs text-gray-500">Your application is private. An authorized administrator reviews it. Do not upload documents belonging to another person.</p>
  </main>;
};
export default DriverApplication;
