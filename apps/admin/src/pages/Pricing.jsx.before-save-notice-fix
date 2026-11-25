import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, SlidersHorizontal, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ErrorNote, Notice, PageHeader, ghs } from '../components/ui';

const DEFAULTS = {
  base_fare: '5.00',
  per_km: '1.50',
  per_minute: '0.50',
  minimum_fare: '5.00',
  economy_multiplier: '1.000',
  comfort_multiplier: '1.350',
  xl_multiplier: '1.700',
  automatic_pricing_enabled: true,
  manual_multiplier: '1.000',
  maximum_surge_multiplier: '1.500',
  demand_radius_km: '5.00',
};

const FIELDS = [
  { key: 'base_fare', label: 'Base fare', help: 'Starting amount charged for a ride.', min: 0, step: 0.5 },
  { key: 'per_km', label: 'Price per kilometre', help: 'Additional fare for every kilometre travelled.', min: 0, step: 0.1 },
  { key: 'per_minute', label: 'Price per minute', help: 'Additional fare for estimated journey time.', min: 0, step: 0.1 },
  { key: 'minimum_fare', label: 'Minimum fare', help: 'Lowest amount a rider can be charged.', min: 0, step: 0.5 },
  { key: 'economy_multiplier', label: 'Economy multiplier', help: 'Standard Economy fare multiplier.', min: 0.5, max: 5, step: 0.05 },
  { key: 'comfort_multiplier', label: 'Comfort multiplier', help: 'Standard Comfort fare multiplier.', min: 0.5, max: 5, step: 0.05 },
  { key: 'xl_multiplier', label: 'XL multiplier', help: 'Standard XL fare multiplier.', min: 0.5, max: 5, step: 0.05 },
  { key: 'manual_multiplier', label: 'Manual fare adjustment', help: 'Applies an additional multiplier to fares. 1.00 means no adjustment.', min: 0.5, max: 3, step: 0.05 },
  { key: 'maximum_surge_multiplier', label: 'Maximum automatic surge', help: 'Upper limit for demand-based price increases.', min: 1, max: 3, step: 0.05 },
  { key: 'demand_radius_km', label: 'Demand calculation radius (km)', help: 'Area used to compare nearby drivers and ride requests.', min: 1, max: 30, step: 0.5 },
];

function NumberField({ field, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1">{field.label}</span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm num focus:outline-none focus:ring-2 focus:ring-brand"
        required
      />
      <span className="block text-xs text-muted mt-1">{field.help}</span>
    </label>
  );
}

export default function Pricing() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');

    const { data, error: rpcError } = await supabase.rpc('admin_get_ride_pricing');

    if (rpcError) {
      setError(rpcError.message);
    } else if (data) {
      const next = { ...DEFAULTS };
      Object.keys(DEFAULTS).forEach((key) => {
        if (data[key] !== undefined && data[key] !== null) {
          next[key] = typeof DEFAULTS[key] === 'boolean'
            ? Boolean(data[key])
            : String(data[key]);
        }
      });
      setSettings(next);
      setUpdatedAt(data.updated_at || '');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeField = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice('');
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const numericFields = FIELDS;
    for (const field of numericFields) {
      const value = Number(settings[field.key]);
      if (settings[field.key] === '' || !Number.isFinite(value) ||
          value < field.min || (field.max !== undefined && value > field.max)) {
        setError(`${field.label} must be between ${field.min} and ${field.max ?? 'the allowed maximum'}.`);
        return;
      }
    }

    const payload = {};
    numericFields.forEach((field) => {
      payload[field.key] = Number(settings[field.key]);
    });
    payload.automatic_pricing_enabled = settings.automatic_pricing_enabled;

    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc(
      'admin_update_ride_pricing',
      { p_settings: payload }
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setNotice('Pricing settings saved successfully.');
      if (data?.updated_at) setUpdatedAt(data.updated_at);
      await load();
    }

    setSaving(false);
  };

  return (
    <>
      <PageHeader
        title="Ride Pricing"
        note="Manage standard fares, ride categories and automatic demand-based pricing."
      >
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </PageHeader>

      <ErrorNote>{error}</ErrorNote>
      <Notice>{notice}</Notice>

      {loading ? (
        <div className="rounded-xl border border-line bg-white p-10 text-center text-muted">
          Loading pricing settings...
        </div>
      ) : (
        <form onSubmit={save} className="space-y-5">
          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={19} className="text-brand" />
              <h2 className="font-bold text-lg">Automatic demand pricing</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              Automatically adjust fares according to nearby available drivers and outstanding ride requests.
            </p>

            <label className="flex items-center justify-between gap-4 rounded-lg bg-chalk p-4">
              <span>
                <span className="block font-semibold text-sm">Enable automatic pricing</span>
                <span className="block text-xs text-muted mt-1">
                  Allow demand-based fare adjustments.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.automatic_pricing_enabled}
                onChange={(e) => changeField('automatic_pricing_enabled', e.target.checked)}
                className="h-5 w-5 accent-blue-600"
              />
            </label>
          </section>

          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal size={19} className="text-brand" />
              <h2 className="font-bold text-lg">Standard fare settings</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {FIELDS.slice(0, 4).map((field) => (
                <NumberField key={field.key} field={field} value={settings[field.key]} onChange={changeField} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-bold text-lg mb-4">Ride category multipliers</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {FIELDS.slice(4, 7).map((field) => (
                <NumberField key={field.key} field={field} value={settings[field.key]} onChange={changeField} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-bold text-lg mb-4">Manual and demand controls</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {FIELDS.slice(7).map((field) => (
                <NumberField key={field.key} field={field} value={settings[field.key]} onChange={changeField} />
              ))}
            </div>
            {!settings.automatic_pricing_enabled && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-signal">
                Automatic demand pricing is disabled. The manual fare adjustment still applies.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-line bg-blue-50 p-5">
            <h2 className="font-bold mb-2">Current pricing configuration</h2>
            <p className="text-sm text-muted">
              Example starting fare before distance, time and category adjustments:
            </p>
            <p className="text-2xl font-bold text-brand mt-2">
              {ghs(Number(settings.base_fare) * Number(settings.manual_multiplier))}
            </p>
            <p className="text-xs text-muted mt-2">
              This is an illustration, not a live ride quote. Actual fares depend on journey details and demand.
            </p>
          </section>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-muted">
              {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : 'Pricing settings have not been loaded yet.'}
            </p>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save pricing settings'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
