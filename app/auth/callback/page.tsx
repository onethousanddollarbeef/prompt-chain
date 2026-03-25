'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [message, setMessage] = useState('Completing Google login…');

  useEffect(() => {
    async function completeAuth() {
      if (!supabase) {
        setMessage(
          'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        );
        setMessage('Missing Supabase environment variables.');
        return;
      }

      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const code = url.searchParams.get('code');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(`Login failed: ${error.message}`);
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (error) {
          setMessage(`Login failed: ${error.message}`);
          return;
        }
      } else {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!session) {
          setMessage('Login failed: missing authorization parameters.');
          return;
        }
      }

      setMessage('Login successful. Redirecting…');
      window.location.replace('/');
    }

    void completeAuth();
  }, [supabase]);

  return (
    <main className="container">
      <h1>Auth callback</h1>
      <p>{message}</p>
    </main>
      <main className="container">
        <h1>Auth callback</h1>
        <p>{message}</p>
      </main>
  );
}
