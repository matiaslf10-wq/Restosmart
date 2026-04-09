'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import QRCode from 'react-qr-code';
import {
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type Mesa = {
  id: number;
  nombre: string | null;
  numero: number | null;
};

type AdminSessionPayload = {
  adminId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  restaurant?: {
    business_mode?: BusinessMode;
  } | null;
};

function getMesaNumero(mesa: Mesa, fallbackIndex = 1) {
  if (typeof mesa.numero === 'number' && mesa.numero > 0) {
    return mesa.numero;
  }
  return fallbackIndex;
}

function sortMesas(rows: Mesa[]) {
  return [...rows].sort((a, b) => {
    const numeroA = getMesaNumero(a, Number.MAX_SAFE_INTEGER);
    const numeroB = getMesaNumero(b, Number.MAX_SAFE_INTEGER);

    if (numeroA !== numeroB) return numeroA - numeroB;
    return a.id - b.id;
  });
}

function getNextAvailableMesaNumero(rows: Mesa[]) {
  const used = new Set(
    rows
      .map((mesa) => mesa.numero)
      .filter((numero): numero is number => typeof numero === 'number' && numero > 0)
  );

  let next = 1;
  while (used.has(next)) {
    next += 1;
  }

  return next;
}

function isDefaultMesaName(nombre: string | null | undefined, numero: number) {
  const normalized = String(nombre ?? '').trim().toLowerCase();
  return normalized === '' || normalized === `mesa ${numero}`.toLowerCase();
}

export default function AdminMesasPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [businessMode, setBusinessMode] = useState<BusinessMode>('restaurant');

  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [baseUrl, setBaseUrl] = useState<string>('');

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        const res = await fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }

        const data = await res.json().catch(() => null);
        const session = (data?.session as AdminSessionPayload | null) ?? null;

        if (!active) return;

        if (!session?.adminId) {
          router.replace('/admin/login');
          return;
        }

        const resolvedMode = normalizeBusinessMode(
          session?.business_mode ?? session?.restaurant?.business_mode
        );

        setBusinessMode(resolvedMode);
      } catch (err) {
        console.error('No se pudo verificar la sesión de mesas admin', err);
        if (!active) return;
        router.replace('/admin/login');
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    verifySession();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (checkingAccess || businessMode !== 'restaurant') {
      setCargando(false);
      return;
    }

    let active = true;

    const cargarMesas = async () => {
      setCargando(true);
      setError(null);

      const { data, error } = await supabase
        .from('mesas')
        .select('id, nombre, numero')
        .gt('id', DELIVERY_MESA_ID);

      if (!active) return;

      if (!error && data) {
        setMesas(sortMesas(data as Mesa[]));
      } else if (error) {
        console.error('Error cargando mesas:', error);
        setError('No se pudieron cargar las mesas.');
      }

      setCargando(false);
    };

    cargarMesas();

    return () => {
      active = false;
    };
  }, [checkingAccess, businessMode]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const duplicateNumbers = useMemo(() => {
    const counts = new Map<number, number>();

    for (const mesa of mesas) {
      if (typeof mesa.numero === 'number' && mesa.numero > 0) {
        counts.set(mesa.numero, (counts.get(mesa.numero) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([numero]) => numero)
      .sort((a, b) => a - b);
  }, [mesas]);

  const handleCrearMesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    setCreando(true);

    const nombreLimpio = nuevoNombre.trim();
    const numeroNuevo = getNextAvailableMesaNumero(mesas);
    const nombreFinal = nombreLimpio || `Mesa ${numeroNuevo}`;

    try {
      const { data, error } = await supabase
        .from('mesas')
        .insert({
          nombre: nombreFinal,
          numero: numeroNuevo,
        })
        .select('id, nombre, numero')
        .single();

      if (error) {
        console.error('Error creando mesa:', error);
        setError(
          'No se pudo crear la mesa. Verificá que exista la columna "numero" y que no haya una restricción incumplida.'
        );
        setCreando(false);
        return;
      }

      const mesaNueva = data as Mesa;

      if (mesaNueva.id <= DELIVERY_MESA_ID) {
        setMensaje(
          `Se creó la mesa "${mesaNueva.nombre}", pero no se mostrará acá porque la mesa ${DELIVERY_MESA_ID} está reservada para delivery.`
        );
        setNuevoNombre('');
        return;
      }

      setMesas((prev) => sortMesas([...prev, mesaNueva]));
      setNuevoNombre('');
      setMensaje(
        `Mesa ${getMesaNumero(mesaNueva)} creada con éxito. ID interno: ${mesaNueva.id}.`
      );
    } finally {
      setCreando(false);
    }
  };

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-6">
        <p className="text-slate-600">Verificando configuración del negocio...</p>
      </main>
    );
  }

  if (businessMode === 'takeaway') {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
              No aplica en modo Take Away
            </span>

            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              Administración de mesas
            </h1>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Este negocio está configurado en <strong>modo take away</strong>.
              Por eso la administración de mesas y los QR de salón no se usan en
              esta operación.
            </p>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Si más adelante querés trabajar con salón y mesas, podés cambiar el
              modo del negocio desde Configuración sin cambiar de plan.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/admin/configuracion"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ir a Configuración
              </Link>
              <button
                onClick={() => router.push('/inicio')}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Volver a inicio
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Cargando mesas...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col gap-2 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-2xl font-bold">Administración de mesas</h1>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/inicio')}
                className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50"
              >
                Volver a inicio
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-1 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
              >
                Imprimir todos los QR
              </button>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Cada QR apunta a <code>/mesa/[id]</code>, usando el <strong>ID interno</strong> de la mesa.
          </p>
          <p className="text-sm text-slate-600">
            La identificación visible del salón se hace con el <strong>número de mesa</strong>, no con el ID.
          </p>
          <p className="text-sm text-slate-600">
            La mesa #{DELIVERY_MESA_ID} está reservada para delivery y no se muestra
            en este listado ni en los QR del salón.
          </p>
        </header>

        {mensaje && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg print:hidden">
            {mensaje}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg print:hidden">
            {error}
          </p>
        )}

        {duplicateNumbers.length > 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg print:hidden">
            Atención: hay números de mesa duplicados en la base. Se repiten:{' '}
            <strong>{duplicateNumbers.join(', ')}</strong>. El código nuevo ya usa el
            menor número libre disponible, pero estas duplicaciones viejas conviene corregirlas.
          </p>
        ) : null}

        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 print:hidden">
          <h2 className="text-lg font-semibold">Agregar nueva mesa</h2>

          <form
            onSubmit={handleCrearMesa}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              placeholder="Nombre opcional. Ej: Terraza, Ventana, VIP..."
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creando}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {creando ? 'Creando...' : 'Agregar mesa'}
            </button>
          </form>

          <p className="text-xs text-slate-500">
            La nueva mesa toma automáticamente el menor número libre disponible.
            El QR usará el ID interno de base de datos, pero la UI mostrará el número de mesa.
          </p>
        </section>

        {mesas.length === 0 ? (
          <p className="text-slate-600">
            No hay mesas físicas cargadas en la base de datos.
          </p>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
            {mesas.map((mesa, index) => {
              const numeroMesa = getMesaNumero(mesa, index + 1);
              const url = baseUrl
                ? `${baseUrl}/mesa/${mesa.id}`
                : `/mesa/${mesa.id}`;

              return (
                <article
                  key={mesa.id}
                  className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col items-center gap-3 print:shadow-none"
                >
                  <div className="text-center">
                    <h2 className="font-semibold text-lg">Mesa {numeroMesa}</h2>

                    {!isDefaultMesaName(mesa.nombre, numeroMesa) ? (
                      <p className="text-sm text-slate-600">{mesa.nombre}</p>
                    ) : null}

                    <p className="text-xs text-slate-500 mt-1">
                      ID interno #{mesa.id}
                    </p>
                  </div>

                  <div className="bg-white p-2 rounded-md border border-slate-200">
                    <QRCode value={url} size={180} />
                  </div>

                  <p className="text-xs text-slate-600 break-all text-center">
                    {url}
                  </p>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}