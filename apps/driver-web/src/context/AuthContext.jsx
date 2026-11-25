import React, { createContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser) => {
    if (!authUser) {
      setProfile(null);
      return null;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) {
      console.error('Failed to load profile:', error);
      return null;
    }
    setProfile(data);
    return data;
  };

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.error('Session error:', error);
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) await loadProfile(currentUser);
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initialize();

    // Do not await database queries inside onAuthStateChange. Supabase auth
    // callbacks can deadlock when another Supabase request is awaited here.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const registerUser = async ({ fullName, email, phone, password, role = 'rider' }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, role } },
    });
    if (error) throw error;
    if (data.user && data.session) await loadProfile(data.user);
    return data;
  };

  const loginUser = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await loadProfile(data.user);
    return data;
  };

  const logoutUser = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => (user ? loadProfile(user) : null);

  return (
    <AuthContext.Provider value={{ user, profile, loading, registerUser, loginUser, logoutUser, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
