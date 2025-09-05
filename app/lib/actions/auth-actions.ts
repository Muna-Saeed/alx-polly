'use server';

/**
 * Authentication action helpers for ALX Polly.
 *
 * WHAT
 * ----
 * This server-only module exposes thin wrappers around Supabase
 * authentication endpoints (sign-in, sign-up, sign-out, session helpers)
 * so that React components can trigger them through Server Actions.
 *
 * WHY
 * ---
 * Co-locating all auth calls in one place guarantees a single source of
 * truth for business rules such as rate-limiting, cookie handling and
 * redirect behaviour.  UI components stay declarative and we avoid
 * duplicating error-handling logic across pages.
 */

import { createClient } from '@/lib/supabase/server';
import { LoginFormData, RegisterFormData } from '../types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Sign a user into Supabase with an email/password combination.
 *
 * Implements a lightweight brute-force protection mechanism using
 * HTTP-only cookies:
 *   • After `MAX_ATTEMPTS` failed attempts within a short period,
 *     the user is locked out for `LOCK_DURATION`.
 *   • Attempt counters are reset on successful login.
 *
 * This client-side guard is not bullet-proof but good enough to protect
 * hobby deployments where a dedicated rate-limiter (e.g. Redis) would be
 * overkill.
 *
 * @param data - Credentials collected from the login form.
 * @returns An object shaped as `{ error: string | null }`. On success the
 *          function redirects to `/polls`, so execution never resumes on
 */
export async function login(data: LoginFormData) {
  const cookieStore = await cookies();
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
  /**
   * Check if the user is *currently* locked out by reading the timestamp
   * stored in `loginLockUntil`.  If the stored value is in the future we
   * deny the attempt immediately without hitting Supabase.
   */
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

/**
 * Create a Supabase user from registration form input.
 *
 * WHY: Wrapping the bare `signUp` call allows us to enforce extra
 * verification rules in the future (e.g. invite codes) without touching
 * the presentation layer.
 *
 * @param data - Name, email and password as collected on the registration page.
 * @returns `{ error: string | null }` indicating whether sign-up failed.
 */
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

/**
 * Destroy the current Supabase session.
 *
 * @returns `{ error: string | null }` error description if sign-out fails.
 */
export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

/**
 * Retrieve the authenticated user (if any) from Supabase.
 *
 * This helper exists mainly to abstract away the Supabase client import
 * from components.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/**
 * Retrieve the current auth session JWT and expiry information.
 */
export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}
