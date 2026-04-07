'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const res = await fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!active) return;

        if (res.ok) {
          router.replace('/admin');
          router.refresh();
          return;
        }
      } catch (error) {
        console.error('No se pudo verificar la sesión actual', error);
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setErrorMsg(null);
      setLoading(true);

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo iniciar sesión.');
      }

      router.replace('/admin');
      router.refresh();
    } catch (error) {
      console.error(error);
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Ocurrió un error al iniciar sesión.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <p>Verificando acceso...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white shadow-lg border border-slate-200 rounded-xl p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold text-center mb-4">Panel Admin</h1>

        {errorMsg ? (
          <p className="text-red-600 text-sm mb-3 text-center">{errorMsg}</p>
        ) : null}

        <form className="space-y-3" onSubmit={login}>
          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-lg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="Contraseña"
            className="w-full border rounded-lg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 hover:bg-slate-700 disabled:opacity-40"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </main>
  );
}