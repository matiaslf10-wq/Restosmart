'use client';

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

const REFRESH_INTERVAL_MS = 10000;
const CLOCK_INTERVAL_MS = 1000;
const ROTATION_INTERVAL_MS = 7000;
const PREPARING_ITEMS_PER_PAGE = 3;
const READY_ITEMS_PER_PAGE = 3;

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatClock(value: Date) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeStyle: 'short',
    }).format(value);
  } catch {
    return '';
  }
}

function chunkItems<T>(items: T[], size: number) {
  if (!items.length) return [[]] as T[][];

  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

function getNameClass(
  nombre: string,
  variant: 'preparing' | 'ready'
): string {
  const length = nombre.trim().length;

  if (variant === 'ready') {
    if (length >= 18) {
      return 'text-[clamp(1.8rem,2.2vw,2.8rem)] leading-[0.95]';
    }
    if (length >= 12) {
      return 'text-[clamp(2rem,2.5vw,3.1rem)] leading-[0.95]';
    }
    return 'text-[clamp(2.2rem,2.8vw,3.4rem)] leading-[0.95]';
  }

  if (length >= 18) {
    return 'text-[clamp(1.7rem,2.1vw,2.6rem)] leading-[0.95]';
  }
  if (length >= 12) {
    return 'text-[clamp(1.9rem,2.3vw,2.9rem)] leading-[0.95]';
  }
  return 'text-[clamp(2.1rem,2.6vw,3.1rem)] leading-[0.95]';
}

export default function RetiroPage() {
  const [data, setData] = useState<PublicRetiroResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [preparingPage, setPreparingPage] = useState(0);
  const [readyPage, setReadyPage] = useState(0);

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
            body?.error || 'No se pudo cargar la pantalla pública de retiro.'
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

    const refreshInterval = setInterval(cargar, REFRESH_INTERVAL_MS);
    const clockInterval = setInterval(() => setNow(new Date()), CLOCK_INTERVAL_MS);

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

  const preparingPages = useMemo(
    () => chunkItems(data?.preparingOrders ?? [], PREPARING_ITEMS_PER_PAGE),
    [data?.preparingOrders]
  );

  const readyPages = useMemo(
    () => chunkItems(data?.readyOrders ?? [], READY_ITEMS_PER_PAGE),
    [data?.readyOrders]
  );

  useEffect(() => {
    setPreparingPage((current) =>
      current >= preparingPages.length ? 0 : current
    );
  }, [preparingPages.length]);

  useEffect(() => {
    setReadyPage((current) => (current >= readyPages.length ? 0 : current));
  }, [readyPages.length]);

  useEffect(() => {
    if (preparingPages.length <= 1 && readyPages.length <= 1) return;

    const interval = setInterval(() => {
      setPreparingPage((current) =>
        preparingPages.length > 1 ? (current + 1) % preparingPages.length : 0
      );

      setReadyPage((current) =>
        readyPages.length > 1 ? (current + 1) % readyPages.length : 0
      );
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [preparingPages.length, readyPages.length]);

  const visiblePreparingOrders = preparingPages[preparingPage] ?? [];
  const visibleReadyOrders = readyPages[readyPage] ?? [];

  const preparingTotal = data?.preparingOrders.length ?? 0;
  const readyTotal = data?.readyOrders.length ?? 0;
  const totalActivos = preparingTotal + readyTotal;

  return (
    <main className="h-screen overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col gap-3 px-3 py-3 xl:px-5">
        <header className="rounded-[28px] border border-slate-800 bg-slate-900 px-4 py-3 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                  Take Away
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                  Pantalla de retiro
                </span>
              </div>

              <h1 className="mt-2 text-[clamp(1.9rem,2.8vw,3.2rem)] font-black leading-none tracking-tight text-white">
                {localNombre}
              </h1>

              <p className="mt-1 text-sm font-medium text-slate-300 md:text-base">
                Cuando tu nombre aparezca en{' '}
                <span className="font-extrabold text-emerald-300">
                  LISTO PARA RETIRAR
                </span>
                , acercate al mostrador.
              </p>

              {error ? (
                <div className="mt-2 inline-flex max-w-full rounded-2xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3 lg:min-w-[380px]">
              <div className="rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Hora actual
                </p>
                <p className="mt-2 text-[clamp(1.7rem,2.2vw,2.8rem)] font-black leading-none tabular-nums text-white">
                  {formatClock(now)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {generatedLabel
                    ? `Actualizado: ${generatedLabel}`
                    : 'Actualización automática'}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Pedidos visibles
                </p>
                <p className="mt-2 text-[clamp(1.7rem,2.2vw,2.8rem)] font-black leading-none tabular-nums text-white">
                  {totalActivos}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Preparación {preparingTotal} · Listos {readyTotal}
                </p>
              </div>
            </div>
          </div>
        </header>

        {cargando && !data ? (
          <section className="flex flex-1 items-center justify-center rounded-[28px] border border-slate-800 bg-slate-900">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">
                Cargando pantalla de retiro...
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Esperá un momento.
              </p>
            </div>
          </section>
        ) : (
          <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
            <article className="flex min-h-0 flex-col rounded-[32px] border border-slate-800 bg-slate-900 px-4 py-4 shadow-2xl shadow-black/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-200">
                    En preparación
                  </p>
                  <h2 className="mt-1 text-[clamp(1.4rem,1.9vw,2.2rem)] font-black leading-none tracking-tight text-white">
                    Tu pedido está en curso
                  </h2>
                </div>

                <div className="rounded-[22px] bg-slate-950 px-4 py-3 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Activos
                  </p>
                  <p className="mt-1 text-3xl font-black leading-none tabular-nums text-white">
                    {preparingTotal}
                  </p>
                  {preparingPages.length > 1 ? (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Página {preparingPage + 1}/{preparingPages.length}
                    </p>
                  ) : null}
                </div>
              </div>

              {!data || preparingTotal === 0 ? (
                <div className="mt-3 flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-slate-700 bg-slate-950/60 px-6 py-8 text-center">
                  <div>
                    <p className="text-[clamp(1.4rem,1.8vw,2rem)] font-black tracking-tight text-white">
                      No hay pedidos en preparación
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Los nuevos pedidos van a aparecer acá.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                  {visiblePreparingOrders.map((pedido) => (
                    <article
                      key={pedido.id}
                      className="flex min-h-0 flex-1 flex-col justify-between rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                          {pedido.codigo}
                        </p>

                        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                          {pedido.estado === 'pendiente'
                            ? 'Pendiente'
                            : 'En preparación'}
                        </span>
                      </div>

                      <div className="mt-2 flex-1">
                        <h3
                          className={`break-words font-black tracking-tight text-white ${getNameClass(
                            pedido.cliente_nombre,
                            'preparing'
                          )}`}
                        >
                          {pedido.cliente_nombre}
                        </h3>
                      </div>

                      <p className="mt-2 text-sm font-medium text-slate-300">
                        Pedido de las {formatTime(pedido.creado_en)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="flex min-h-0 flex-col rounded-[32px] border border-emerald-500/35 bg-emerald-500/12 px-4 py-4 shadow-2xl shadow-emerald-950/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-200">
                    Listo para retirar
                  </p>
                  <h2 className="mt-1 text-[clamp(1.4rem,1.9vw,2.2rem)] font-black leading-none tracking-tight text-white">
                    Pasá por mostrador
                  </h2>
                </div>

                <div className="rounded-[22px] bg-emerald-400/20 px-4 py-3 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                    Listos
                  </p>
                  <p className="mt-1 text-3xl font-black leading-none tabular-nums text-white">
                    {readyTotal}
                  </p>
                  {readyPages.length > 1 ? (
                    <p className="mt-1 text-[10px] text-emerald-100/70">
                      Página {readyPage + 1}/{readyPages.length}
                    </p>
                  ) : null}
                </div>
              </div>

              {!data || readyTotal === 0 ? (
                <div className="mt-3 flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-emerald-300/30 bg-black/10 px-6 py-8 text-center">
                  <div>
                    <p className="text-[clamp(1.4rem,1.8vw,2rem)] font-black tracking-tight text-white">
                      Todavía no hay pedidos listos
                    </p>
                    <p className="mt-2 text-sm text-emerald-50/75">
                      Cuando un pedido esté listo, se va a mostrar acá.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                  {visibleReadyOrders.map((pedido) => (
                    <article
                      key={pedido.id}
                      className="flex min-h-0 flex-1 flex-col justify-between rounded-[24px] border border-emerald-300/30 bg-slate-950/70 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                          {pedido.codigo}
                        </p>

                        <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                          Retirar
                        </span>
                      </div>

                      <div className="mt-2 flex-1">
                        <h3
                          className={`break-words font-black tracking-tight text-white ${getNameClass(
                            pedido.cliente_nombre,
                            'ready'
                          )}`}
                        >
                          {pedido.cliente_nombre}
                        </h3>
                      </div>

                      <p className="mt-2 text-sm font-medium text-emerald-50/85">
                        Pedido de las {formatTime(pedido.creado_en)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        )}
      </div>
    </main>
  );
}