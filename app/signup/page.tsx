'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeBusinessMode, type BusinessMode } from '@/lib/plans';

type SignupResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
  tenant?: {
    id?: string;
    slug?: string;
    restaurant_id?: string;
  };
  restaurant?: {
    id?: string;
    slug?: string;
    nombre_local?: string;
    business_mode?: BusinessMode;
  };
};

export default function SignupPage() {
  const router = useRouter();

  const [negocioNombre, setNegocioNombre] = useState('');
  const [sucursalNombre, setSucursalNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [businessMode, setBusinessMode] =
    useState<BusinessMode>('restaurant');

  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [celular, setCelular] = useState('');

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
          router.replace('/inicio');
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

    void checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function signup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setErrorMsg(null);
      setLoading(true);

      const negocio = negocioNombre.trim();
      const sucursal = sucursalNombre.trim() || negocio;
      const normalizedEmail = email.trim().toLowerCase();

      if (!negocio) {
        throw new Error('Ingresá el nombre del negocio.');
      }

      if (!normalizedEmail) {
        throw new Error('Ingresá un email.');
      }

      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
      }

      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          negocio_nombre: negocio,
          sucursal_nombre: sucursal,
          email: normalizedEmail,
          password,
          business_mode: normalizeBusinessMode(businessMode),
          direccion: direccion.trim(),
          telefono: telefono.trim(),
          celular: celular.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as SignupResponse | null;

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo crear la cuenta.');
      }

      router.replace(data?.redirectTo || '/inicio');
      router.refresh();
    } catch (error) {
      console.error(error);
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Ocurrió un error al crear la cuenta.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <p>Verificando acceso...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-3xl border border-slate-200 bg-slate-900 p-8 text-white shadow-lg">
          <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
            RestoSmart
          </span>

          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight">
            Creá tu cuenta y empezá a operar tu restaurante.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
            El alta crea automáticamente tu tenant, tu primera sucursal, tu
            usuario administrador y la configuración inicial del local.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-sm font-semibold">1. Tenant</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Se crea el grupo principal del negocio en plan Esencial.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-sm font-semibold">2. Sucursal</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Se crea una primera sucursal lista para configurar menú,
                mostrador y operación.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-sm font-semibold">3. Inicio</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Entrás directo a Inicio para empezar a administrar el local.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
            Esta primera versión crea la cuenta en plan Esencial. Después
            sumamos selección de plan, pago y activación automática.
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
          <h2 className="text-xl font-bold text-slate-900">Crear cuenta</h2>
          <p className="mt-1 text-sm text-slate-600">
            Completá los datos iniciales del negocio.
          </p>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMsg}
            </div>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={signup}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                Nombre del negocio
              </span>
              <input
                type="text"
                value={negocioNombre}
                onChange={(e) => {
                  setNegocioNombre(e.target.value);

                  if (!sucursalNombre.trim()) {
                    setSucursalNombre(e.target.value);
                  }
                }}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Ej: RestoSmart"
                autoComplete="organization"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                Nombre de la primera sucursal
              </span>
              <input
                type="text"
                value={sucursalNombre}
                onChange={(e) => setSucursalNombre(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Ej: RestoSmart Belgrano"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  businessMode === 'restaurant'
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="business_mode"
                  className="sr-only"
                  checked={businessMode === 'restaurant'}
                  onChange={() => setBusinessMode('restaurant')}
                />
                <p className="text-sm font-bold text-slate-900">
                  🍽️ Restaurante
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Salón, mesas, QR por mesa, cocina y mostrador.
                </p>
              </label>

              <label
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  businessMode === 'takeaway'
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="business_mode"
                  className="sr-only"
                  checked={businessMode === 'takeaway'}
                  onChange={() => setBusinessMode('takeaway')}
                />
                <p className="text-sm font-bold text-slate-900">
                  🛍️ Take Away
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Pedidos por mostrador y retiro sin mesas.
                </p>
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                Email administrador
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="admin@resto.com"
                autoComplete="email"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                Contraseña
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Dirección
                </span>
                <input
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Opcional"
                  autoComplete="street-address"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Teléfono
                </span>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Opcional"
                  autoComplete="tel"
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">
                Celular
              </span>
              <input
                type="text"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Opcional"
                autoComplete="tel"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta e ingresar'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            ¿Ya tenés cuenta?{' '}
            <Link
              href="/admin/login"
              className="font-semibold text-slate-900 underline"
            >
              Iniciar sesión
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}