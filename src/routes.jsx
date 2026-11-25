import React from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Home from './pages/Home';
import Booking from './pages/Booking';
import Tracking from './pages/Tracking';
import Completed from './pages/Completed';
import History from './pages/History';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading Eazi's Ride...</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<Home />} />
      <Route path="/booking" element={<Booking />} />
      <Route path="/tracking" element={<Tracking />} />
      <Route path="/completed" element={<Completed />} />
      <Route path="/history" element={<History />} />
      <Route path="/wallet" element={<Wallet />} />
      <Route path="/profile" element={<Profile />} />
    </Route>
  </Routes>
);

export default AppRoutes;
