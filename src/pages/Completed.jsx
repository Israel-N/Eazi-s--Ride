import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import RatingStars from '../components/RatingStars';
import { CheckCircle2 } from 'lucide-react';
import { useRides } from '../hooks/useRides';
import { getMyRideRating, submitRideRating } from '../services/ratingService';
import { getMyRides } from '../services/rideService';
import { supabase } from '../lib/supabase';

const Completed = () => {
  const navigate = useNavigate();
  const { currentRide } = useRides();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [ride, setRide] = useState(currentRide);
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [paymentState, setPaymentState] = useState('');
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadRating = async () => {
      let ride = currentRide;
      if (!ride?.id) {
        try { ride = (await getMyRides()).find(r => r.status === 'completed'); setRide(ride); } catch {}
      }
      if (!ride?.id) {
        setLoadingExisting(false);
        return;
      }

      try {
        const existing = await getMyRideRating(ride.id);
        if (!mounted) return;
        if (existing) {
          setRating(existing.rating);
          setComment(existing.comment || '');
          setSubmitted(true);
        }
      } catch (err) {
        console.error('Could not load existing rating:', err);
      } finally {
        if (mounted) setLoadingExisting(false);
      }
    };

    loadRating();
    return () => { mounted = false; };
  }, [currentRide?.id]);

  useEffect(() => {
    if (!ride?.id) return;
    let mounted = true;
    supabase.from('payments').select('id,amount,currency,method,provider,provider_reference,status,paid_at,created_at')
      .eq('ride_id', ride.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error: queryError }) => { if (mounted && !queryError) setPaymentRecord(data); });
    return () => { mounted = false; };
  }, [ride?.id, paymentState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;
    let mounted = true;
    (async () => {
      setPaymentBusy(true); setPaymentState('Verifying payment with provider…');
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('payment-verify', { body: { reference } });
        if (invokeError) throw invokeError;
        if (data?.status !== 'successful') throw new Error(data?.error || 'Payment is not confirmed yet.');
        if (mounted) setPaymentState('Payment confirmed. Your receipt is recorded securely.');
        params.delete('reference'); params.delete('trxref');
        const query = params.toString(); window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      } catch (e) { if (mounted) setPaymentState(e.message || 'Could not verify payment. You can retry verification from your payment provider reference.'); }
      finally { if (mounted) setPaymentBusy(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const startPayment = async () => {
    if (!ride?.id) { setPaymentState('No completed ride was found for payment.'); return; }
    setPaymentBusy(true); setPaymentState('Opening secure checkout…');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('payment-initiate', { body: { ride_id: ride.id, method: paymentMethod } });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      if (data?.status === 'successful') { setPaymentState('This ride is already paid.'); setPaymentBusy(false); return; }
      if (!data?.authorization_url) throw new Error('The payment provider did not return a checkout URL.');
      window.location.assign(data.authorization_url);
    } catch (e) { setPaymentState(e.message || 'Could not start payment.'); setPaymentBusy(false); }
  };

  const handleSubmit = async () => {
    if (!rating) {
      setError('Please choose a star rating first.');
      return;
    }

    if (!ride?.driver_id) {
      setError('This ride has no assigned driver to rate.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await submitRideRating({
        rideId: ride.id,
        driverId: ride.driver_id,
        rating,
        comment
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not submit your rating.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 size={48} className="text-green-600" />
      </div>

      <h1 className="text-3xl font-bold mb-2 text-center">Arrived!</h1>
      <p className="text-gray-500 mb-8 text-center">Hope you enjoyed your Eazi's Ride trip.</p>

      <div className="w-full max-w-sm bg-gray-50 rounded-2xl p-6 border mb-8">
        <div className="flex justify-between mb-4 pb-4 border-b">
          <span className="text-gray-500">Fare</span>
          <span className="font-bold">GH₵{Number(ride?.fare || 0).toFixed(2)}</span>
        </div>

        <div className="flex justify-between mb-6">
          <span className="text-gray-500">Distance</span>
          <span className="font-medium">{ride?.distance ? `${ride.distance} km` : '—'}</span>
        </div>

        {ride?.payment_method && ride.payment_method !== 'cash' && <section className="mb-6 border-t pt-4"><h3 className="font-bold">Electronic payment</h3><p className="text-sm text-gray-500 mt-1">Choose your payment method. Checkout is handled securely by Paystack; Eazi's Ride does not collect your PIN or card security code.</p><div className="grid grid-cols-2 gap-2 mt-3">{[{id:'mobile_money',label:'Mobile Money'},{id:'card',label:'Bank card'}].map(m=><button key={m.id} type="button" onClick={()=>setPaymentMethod(m.id)} className={`rounded-xl border p-3 text-sm font-semibold ${paymentMethod===m.id?'border-blue-600 bg-blue-50':'border-gray-200'}`}>{m.label}</button>)}</div>{paymentRecord?.status === 'successful' ? <div className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-800"><b>Payment successful</b><p>Receipt reference: {paymentRecord.provider_reference || paymentRecord.id}</p><p>Paid: {paymentRecord.paid_at ? new Date(paymentRecord.paid_at).toLocaleString() : 'Confirmed'}</p></div> : <Button className="w-full mt-3 py-3" onClick={startPayment} disabled={paymentBusy}>{paymentBusy?'Processing…':'Pay securely'}</Button>}{paymentRecord && paymentRecord.status !== 'successful' && <p className="mt-2 text-xs text-gray-500">Payment status: {paymentRecord.status}</p>}{paymentState && <p role="status" className="mt-3 text-sm text-blue-700 break-words">{paymentState}</p>}</section>}

        <p className="text-center text-sm font-semibold text-gray-700 mb-3">
          {submitted ? 'Thanks for rating your ride!' : 'How was your ride?'}
        </p>

        {loadingExisting ? (
          <p className="text-center text-sm text-gray-400">Loading rating...</p>
        ) : (
          <>
            <RatingStars value={rating} onChange={setRating} disabled={loading || submitted} />

            {!submitted && (
              <>
                <p className="text-center text-sm font-medium text-gray-500 mt-3 mb-3">
                  {rating ? `${rating} out of 5 stars` : 'Tap a star to rate'}
                </p>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  rows={3}
                  placeholder="Tell us about your experience (optional)"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="text-right text-xs text-gray-400 mt-1">{comment.length}/300</p>

                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

                <Button
                  className="w-full mt-4 py-3"
                  onClick={handleSubmit}
                  disabled={loading || !rating}
                >
                  {loading ? 'Submitting rating...' : 'Submit rating'}
                </Button>
              </>
            )}

            {submitted && comment && (
              <p className="text-center text-sm text-gray-500 mt-3 italic">“{comment}”</p>
            )}
          </>
        )}
      </div>

      <Button className="w-full max-w-sm py-4" onClick={() => navigate('/')}>
        Back Home
      </Button>
    </div>
  );
};

export default Completed;
