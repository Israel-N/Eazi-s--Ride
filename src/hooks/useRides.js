import { useContext } from 'react';
import { RideContext } from '../context/RideContext';

export const useRides = () => {
  const context = useContext(RideContext);
  if (!context) throw new Error('useRides must be used within a RideProvider');
  return context;
};
