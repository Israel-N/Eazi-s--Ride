import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return ctx;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (authUser) => {
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
  }, []);

  useEffect(() => {
    let active = true;
    let initialSessionResolved = false;
    let authVersion = 0;

    const applySession = async (session, version) => {
      if (!active || version !== authVersion) return;

      const nextUser = session?.user ?? null;

      setUser(nextUser);
      setProfile(null);

      if (!nextUser) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', nextUser.id)
          .maybeSingle();

        if (error) throw error;

        if (!active || version !== authVersion) return;

        setProfile(data);
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        if (active && version === authVersion) {
          setLoading(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'INITIAL_SESSION' && !initialSessionResolved) {
        return;
      }

      const version = ++authVersion;

      setTimeout(() => {
        if (active) {
          void applySession(session, version);
        }
      }, 0);
    });

    const initialize = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;
        if (!active) return;

        initialSessionResolved = true;

        const version = ++authVersion;
        await applySession(session, version);
      } catch (error) {
        console.error('Auth initialization error:', error);

        if (active) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginUser = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

const { data: userProfile, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, role')
  .eq('id', data.user.id)
  .maybeSingle();

console.log('Authenticated UID:', data.user.id);
console.log('Session user UID:', data.session?.user?.id);
console.log('Profile query error:', profileError);
console.log('Profile query result:', userProfile);

if (profileError) {
  throw new Error(`Profile lookup failed: ${profileError.message}`);
}

if (!userProfile) {
  throw new Error(
    'Profile lookup returned no row. Check the authenticated session and RLS policy.'
  );
}

    return userProfile;
  };

  const logoutUser = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
    }

    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        loginUser,
        logoutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
