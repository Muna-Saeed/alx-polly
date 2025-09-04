'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { login } from '@/app/lib/actions/auth-actions';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

  useEffect(() => {
    const lockUntil = localStorage.getItem('loginLockUntil');
    if (lockUntil && Number(lockUntil) > Date.now()) {
      setIsLocked(true);
      const remainingTime = Number(lockUntil) - Date.now();
      setTimeout(() => setIsLocked(false), remainingTime);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (isLocked) {
      setError('Too many failed attempts. Please try again later.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;

      // Basic input validation
      if (!email.trim() || !password.trim()) {
        throw new Error('Please fill in all fields');
      }

      const result = await login({ email, password });

      if (result?.error) {
        setAttempts(prev => {
          const newAttempts = prev + 1;
          if (newAttempts >= MAX_ATTEMPTS) {
            setIsLocked(true);
            localStorage.setItem('loginLockUntil', String(Date.now() + LOCK_DURATION));
            setTimeout(() => {
              setIsLocked(false);
              setAttempts(0);
            }, LOCK_DURATION);
          }
          return newAttempts;
        });
        throw new Error(result.error);
      }

      // Use Next.js router for client-side navigation
      router.push('/polls');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Login to ALX Polly</CardTitle>
          <CardDescription className="text-center">Enter your credentials to access your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                name="email"
                type="email" 
                placeholder="your@email.com" 
                required
                autoComplete="email"
                disabled={isLocked}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                name="password"
                type="password" 
                required
                autoComplete="current-password"
                disabled={isLocked}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            {isLocked && (
              <p className="text-yellow-600 text-sm">
                Account temporarily locked due to too many failed attempts. Please try again later.
              </p>
            )}
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || isLocked}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:underline">
              Register
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}