export const RIDE_TYPES = {
  economy: { label: 'Economy', multiplier: 1, seats: 4, description: 'Affordable everyday rides' },
  comfort: { label: 'Comfort', multiplier: 1.35, seats: 4, description: 'Newer, more spacious cars' },
  xl: { label: 'XL', multiplier: 1.7, seats: 6, description: 'Extra seats for groups' }
};

export const calculateFare = (distanceKm = 0, durationMin = 0, rideType = 'economy') => {
  const baseFare = 5;
  const perKm = 1.5;
  const perMinute = 0.5;
  const multiplier = RIDE_TYPES[rideType]?.multiplier || 1;
  return Math.max(5, Math.round((baseFare + distanceKm * perKm + durationMin * perMinute) * multiplier * 100) / 100);
};

export const estimateDuration = (distanceKm = 0) => Math.max(3, Math.ceil((distanceKm / 30) * 60));
