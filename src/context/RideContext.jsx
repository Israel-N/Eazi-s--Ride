import React, { createContext, useState } from 'react';

export const RideContext = createContext();

export const RideProvider = ({ children }) => {
  const [currentRide, setCurrentRide] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);

  return (
    <RideContext.Provider value={{
      currentRide, setCurrentRide,
      pickup, setPickup,
      destination, setDestination
    }}>
      {children}
    </RideContext.Provider>
  );
};
