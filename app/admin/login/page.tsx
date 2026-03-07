'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const login = async () => {
    setErrorMsg(null);
    setLoading(true);

    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      setErrorMsg('Usuario o contraseña incorrectos.');
      setLoading(false);
      return;
    }

    // guardamos sesión simple en localStorage
    localStorage.setItem('admin_session', JSON.stringify({
      email: data.email,
      logged: true
    }));

    router.replace('/admin');

  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white shadow-lg border border-slate-200 rounded-xl p-6 w-full max-w-sm">
        <h1 className="text-xl font-bold text-center mb-4">Panel Admin</h1>

        {errorMsg && (
          <p className="text-red-600 text-sm mb-3 text-center">
            {errorMsg}
          </p>
        )}

        <form className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-lg px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Contraseña"
            className="w-full border rounded-lg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={login}
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
