import { supabase } from "@/lib/supabase/client";

export const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  return { user: data?.user, error };
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { user: data?.user, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};