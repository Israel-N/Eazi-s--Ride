import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RideProvider } from './context/RideContext';
import AppRoutes from './routes';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RideProvider>
          <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100">
            <AppRoutes />
          </div>
        </RideProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
