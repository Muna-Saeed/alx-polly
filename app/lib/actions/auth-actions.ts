'use server';

import { createClient } from '@/lib/supabase/server';
import { LoginFormData, RegisterFormData } from '../types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(data: LoginFormData) {
  const cookieStore = await cookies();
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
  
  // Check if user is currently locked out
  const lockUntil = cookieStore.get('loginLockUntil')?.value;
  if (lockUntil && Number(lockUntil) > Date.now()) {
    return { error: 'Too many failed attempts. Please try again later.' };
  }
  
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    // Handle failed login attempt
    const attempts = Number(cookieStore.get('loginAttempts')?.value || '0') + 1;
    
    if (attempts >= MAX_ATTEMPTS) {
      // Lock the user out
      cookieStore.set('loginLockUntil', String(Date.now() + LOCK_DURATION), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: LOCK_DURATION / 1000
      });
      cookieStore.delete('loginAttempts');
      return { error: 'Too many failed attempts. Account locked for 15 minutes.' };
    } else {
      // Increment attempt counter
      cookieStore.set('loginAttempts', String(attempts), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 // 1 hour
      });
    }
    
    return { error: error.message };
  }

  // Success: clear any existing attempt counters and redirect
  cookieStore.delete('loginAttempts');
  cookieStore.delete('loginLockUntil');
  
  redirect('/polls');
}

export async function register(data: RegisterFormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        name: data.name,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Success: no error
  return { error: null };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}
