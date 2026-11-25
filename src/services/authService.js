import { supabase } from '../lib/supabase';

export const login = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const register = ({ fullName, email, phone, password, role = 'rider' }) =>
  supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone, role } },
  });

export const logout = () => supabase.auth.signOut();
