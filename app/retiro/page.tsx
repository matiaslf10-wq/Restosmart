'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type PublicRetiroPedido = {
  id: number;
  codigo: string;
  cliente_nombre: string;
  creado_en: string;
  estado: string;
};

type PublicRetiroResponse = {
  local: {
    nombre: string;
    slug: string | null;
    business_mode: 'restaurant' | 'takeaway';
  };
  readyOrders: PublicRetiroPedido[];
  preparingOrders: PublicRetiroPedido[];
  generatedAt: string;
};

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function RetiroPage() {
  const [data, setData] = useState<PublicRetiroResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const res = await fetch('/api/public/retiro', {
          method: 'GET',
          cache: 'no-store',
        });

        const body = await res.json().catch(() => null);

        if (!activo) return;

        if (!res.ok) {
          throw new Error(
            body?.error ||
              'No se pudo cargar la pantalla pública de retiro.'
          );
        }

        setData((body as PublicRetiroResponse | null) ?? null);
        setError('');
      } catch (err) {
        console.error(err);

        if (!activo) return;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la pantalla pública de retiro.'
        );
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargar();

    const refreshInterval = setInterval(cargar, 10000);
    const clockInterval = setInterval(() => setNow(new Date()), 30000);

    return () => {
      activo = false;
      clearInterval(refreshInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const localNombre = data?.local?.nombre?.trim() || 'RestoSmart';
  const generatedLabel = useMemo(() => {
    if (!data?.generatedAt) return null;
    return formatTime(data.generatedAt);
  }, [data?.generatedAt]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
                  TAKE AWAY
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                  Pantalla pública de retiro
                </span>
              </div>

              <h1 className="mt-3 text-3xl font-bold">{localNombre}</h1>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
                Cuando tu nombre aparezca en “Listos para retirar”, podés acercarte
                al mostrador a buscar tu pedido.
              </p>

              {data?.local?.business_mode === 'restaurant' ? (
                <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  El negocio sigue configurado como restaurante, pero esta pantalla
                  igualmente puede usarse para pedidos de retiro.
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-right">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Hora actual
              </span>
              <span className="text-2xl font-bold">
                {new Intl.DateTimeFormat('es-AR', {
                  timeStyle: 'short',
                }).format(now)}
              </span>
              <span className="text-xs text-slate-500">
                Actualización automática cada 10 segundos
              </span>
              {generatedLabel ? (
                <span className="text-xs text-slate-500">
                  Última actualización: {generatedLabel}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {cargando && !data ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-8 text-center text-slate-300">
            Cargando pantalla de retiro...
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Listos para retirar
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Pasá por mostrador
                </h2>
              </div>

              <div className="rounded-2xl bg-emerald-400/20 px-4 py-2 text-right">
                <p className="text-xs text-emerald-100">Pedidos listos</p>
                <p className="text-2xl font-bold text-white">
                  {data?.readyOrders.length ?? 0}
                </p>
              </div>
            </div>

            {!data || data.readyOrders.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-emerald-300/30 bg-black/10 px-5 py-12 text-center">
                <p className="text-xl font-semibold text-emerald-100">
                  Todavía no hay pedidos listos
                </p>
                <p className="mt-2 text-sm text-emerald-50/80">
                  Cuando un pedido esté listo, va a aparecer acá con nombre y código.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {data.readyOrders.map((pedido) => (
                  <article
                    key={pedido.id}
                    className="rounded-3xl border border-emerald-300/30 bg-slate-950/40 p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                      {pedido.codigo}
                    </p>

                    <h3 className="mt-3 text-3xl font-extrabold leading-tight text-white">
                      {pedido.cliente_nombre}
                    </h3>

                    <p className="mt-4 text-sm text-emerald-100/80">
                      Listo desde las {formatTime(pedido.creado_en)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  En preparación
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Tu pedido está en curso
                </h2>
              </div>

              <div className="rounded-2xl bg-slate-800 px-4 py-2 text-right">
                <p className="text-xs text-slate-400">Pedidos activos</p>
                <p className="text-2xl font-bold text-white">
                  {data?.preparingOrders.length ?? 0}
                </p>
              </div>
            </div>

            {!data || data.preparingOrders.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-slate-400">
                No hay pedidos en preparación.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {data.preparingOrders.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">
                          {pedido.cliente_nombre}
                        </p>
                        <p className="text-sm text-slate-400">{pedido.codigo}</p>
                      </div>

                      <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
                        {pedido.estado === 'pendiente'
                          ? 'Pendiente'
                          : 'En preparación'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
              <p className="text-sm text-slate-300">
                Esta pantalla está pensada para una TV, tablet o monitor cerca del
                mostrador.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/pedir"
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  Abrir toma de pedidos
                </Link>

                <Link
                  href="/inicio"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Volver a inicio
                </Link>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}