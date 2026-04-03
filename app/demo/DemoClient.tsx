'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Categoria = {
  id: string;
  nombre: string;
  orden: number;
};

type Producto = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  activo: boolean;
  destacado?: boolean;
};

type ItemCarrito = {
  productoId: string;
  cantidad: number;
  nota?: string;
};

type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo';

type Pedido = {
  id: string;
  mesa: string;
  creado_en: string; // ISO
  estado: EstadoPedido;
  entregado: boolean;
  items: Array<{
    productoId: string;
    cantidad: number;
    nota?: string;
  }>;
};

type Vista = 'cliente' | 'cocina' | 'mozo';

function moneyARS(n: number) {
  return `$ ${n.toLocaleString('es-AR')}`;
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(' ');
}

function badgeEstado(estado: EstadoPedido) {
  if (estado === 'pendiente')
    return { label: 'Pendiente', cls: 'bg-zinc-100 text-zinc-700 border-black/10' };
  if (estado === 'en_preparacion')
    return { label: 'En preparación', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  return { label: 'Listo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

const DEMO = {
  local: {
    nombre: 'Cafetería RestoSmart (Demo)',
    direccion: 'CABA — Mesa QR',
  },
  categorias: [
    { id: 'cat_cafe', nombre: 'Café', orden: 1 },
    { id: 'cat_panaderia', nombre: 'Panadería', orden: 2 },
    { id: 'cat_sandwiches', nombre: 'Sandwiches', orden: 3 },
    { id: 'cat_bebidas', nombre: 'Bebidas', orden: 4 },
  ] satisfies Categoria[],
  productos: [
    {
      id: 'p_flatwhite',
      categoria_id: 'cat_cafe',
      nombre: 'Flat White',
      descripcion: 'Doble espresso con leche texturizada.',
      precio: 3200,
      activo: true,
      destacado: true,
    },
    {
      id: 'p_capuccino',
      categoria_id: 'cat_cafe',
      nombre: 'Cappuccino',
      descripcion: 'Espuma cremosa y cacao.',
      precio: 3400,
      activo: true,
    },
    {
      id: 'p_americano',
      categoria_id: 'cat_cafe',
      nombre: 'Americano',
      descripcion: 'Espresso + agua caliente.',
      precio: 2800,
      activo: true,
    },
    {
      id: 'p_medialunas',
      categoria_id: 'cat_panaderia',
      nombre: 'Medialunas (2u)',
      descripcion: 'Clásicas, recién horneadas.',
      precio: 1800,
      activo: true,
      destacado: true,
    },
    {
      id: 'p_budin',
      categoria_id: 'cat_panaderia',
      nombre: 'Budín marmolado',
      descripcion: 'Porción individual.',
      precio: 2500,
      activo: true,
    },
    {
      id: 'p_tostado',
      categoria_id: 'cat_sandwiches',
      nombre: 'Tostado',
      descripcion: 'Jamón y queso, pan de miga.',
      precio: 4500,
      activo: true,
      destacado: true,
    },
    {
      id: 'p_avotoast',
      categoria_id: 'cat_sandwiches',
      nombre: 'Avocado toast',
      descripcion: 'Palta, limón y semillas.',
      precio: 5200,
      activo: true,
    },
    {
      id: 'p_agua',
      categoria_id: 'cat_bebidas',
      nombre: 'Agua sin gas',
      descripcion: '500 ml.',
      precio: 1700,
      activo: true,
    },
    {
      id: 'p_gaseosa',
      categoria_id: 'cat_bebidas',
      nombre: 'Gaseosa',
      descripcion: 'Lata 354 ml.',
      precio: 2200,
      activo: true,
    },
  ] satisfies Producto[],
};

function normalizeMesa(x: string | null | undefined) {
  const v = String(x ?? '').trim();
  return v.length ? v : '12';
}

function normalizeVista(x: string | null | undefined): Vista {
  if (x === 'cliente' || x === 'cocina' || x === 'mozo') return x;
  return 'cliente';
}

export default function DemoClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [vista, setVista] = useState<Vista>('cliente');
  const [mesa, setMesa] = useState('12');

  const [catActiva, setCatActiva] = useState<string>(DEMO.categorias[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [mesaEfectivo, setMesaEfectivo] = useState<Record<string, boolean>>({});
  const [mesaPagada, setMesaPagada] = useState<Record<string, boolean>>({});

  const [pedidos, setPedidos] = useState<Pedido[]>(() => {
    return [
      {
        id: uid('ped'),
        mesa: '7',
        creado_en: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
        estado: 'en_preparacion',
        entregado: false,
        items: [
          { productoId: 'p_flatwhite', cantidad: 1, nota: 'Sin azúcar' },
          { productoId: 'p_medialunas', cantidad: 1 },
        ],
      },
      {
        id: uid('ped'),
        mesa: '3',
        creado_en: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        estado: 'pendiente',
        entregado: false,
        items: [{ productoId: 'p_tostado', cantidad: 1, nota: 'Bien tostado' }],
      },
      {
        id: uid('ped'),
        mesa: '12',
        creado_en: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        estado: 'listo',
        entregado: false,
        items: [{ productoId: 'p_capuccino', cantidad: 2 }],
      },
    ];
  });

  // ✅ leer query al montar (ahora en client)
  useEffect(() => {
    const mesaQ = normalizeMesa(sp.get('mesa'));
    const vistaQ = normalizeVista(sp.get('vista'));
    setMesa(mesaQ);
    setVista(vistaQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setQuery(next: { mesa?: string; vista?: Vista }) {
    const params = new URLSearchParams(sp?.toString() || '');
    if (next.mesa != null) params.set('mesa', String(next.mesa));
    if (next.vista != null) params.set('vista', String(next.vista));
    router.replace(`/demo?${params.toString()}`);
  }

  const productosById = useMemo(() => {
    const map: Record<string, Producto> = {};
    for (const p of DEMO.productos) map[p.id] = p;
    return map;
  }, []);

  const categoriasOrdenadas = useMemo(() => {
    return [...DEMO.categorias].sort((a, b) => a.orden - b.orden);
  }, []);

  const productosFiltrados = useMemo(() => {
    const base = DEMO.productos.filter((p) => p.activo);
    const byCat = base.filter((p) => p.categoria_id === catActiva);
    const bySearch = q.trim()
      ? byCat.filter((p) =>
          (p.nombre + ' ' + p.descripcion).toLowerCase().includes(q.trim().toLowerCase())
        )
      : byCat;
    return bySearch.sort((a, b) => Number(!!b.destacado) - Number(!!a.destacado));
  }, [catActiva, q]);

  const carritoTotal = useMemo(() => {
    let total = 0;
    for (const it of carrito) {
      const p = productosById[it.productoId];
      if (p) total += p.precio * it.cantidad;
    }
    return total;
  }, [carrito, productosById]);

  function addToCart(productoId: string) {
    setCarrito((prev) => {
      const idx = prev.findIndex((x) => x.productoId === productoId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 };
        return next;
      }
      return [...prev, { productoId, cantidad: 1 }];
    });
    setToast('Agregado al carrito');
    setTimeout(() => setToast(null), 1200);
  }

  function setQty(productoId: string, cantidad: number) {
    setCarrito((prev) => {
      const next = prev
        .map((x) => (x.productoId === productoId ? { ...x, cantidad } : x))
        .filter((x) => x.cantidad > 0);
      return next;
    });
  }

  function setNota(productoId: string, nota: string) {
    setCarrito((prev) => prev.map((x) => (x.productoId === productoId ? { ...x, nota } : x)));
  }

  function crearPedidoDesdeCarrito() {
    if (carrito.length === 0) {
      setToast('El carrito está vacío');
      setTimeout(() => setToast(null), 1200);
      return;
    }

    const mesaNorm = normalizeMesa(mesa);

    const nuevo: Pedido = {
      id: uid('ped'),
      mesa: mesaNorm,
      creado_en: nowIso(),
      estado: 'pendiente',
      entregado: false,
      items: carrito.map((x) => ({
        productoId: x.productoId,
        cantidad: x.cantidad,
        nota: x.nota,
      })),
    };

    setPedidos((prev) => [nuevo, ...prev]);
    setCarrito([]);
    setToast('Pedido enviado (demo)');
    setTimeout(() => setToast(null), 1400);

    setVista('cocina');
    setQuery({ mesa: mesaNorm, vista: 'cocina' });
  }

  function cambiarEstadoPedido(pedidoId: string, estado: EstadoPedido) {
    setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? { ...p, estado } : p)));
  }

  function marcarEntregado(pedidoId: string) {
    setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? { ...p, entregado: true } : p)));
    setToast('Marcado como entregado');
    setTimeout(() => setToast(null), 1200);
  }

  const statsCocina = useMemo(() => {
    const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length;
    const enPrep = pedidos.filter((p) => p.estado === 'en_preparacion').length;
    const listos = pedidos.filter((p) => p.estado === 'listo').length;
    return { pendientes, enPrep, listos };
  }, [pedidos]);

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-2xl bg-blue-600 text-white grid place-items-center font-bold">
                R
              </div>
              <div className="leading-tight">
                <div className="font-semibold">RestoSmart</div>
                <div className="text-xs text-zinc-500">Demo interactiva</div>
              </div>
            </Link>

            <span className="hidden md:inline-flex items-center rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
              {DEMO.local.nombre} · Mesa {mesa}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-black/10 bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  setVista('cliente');
                  setQuery({ mesa, vista: 'cliente' });
                }}
                className={classNames(
                  'px-3 py-2 text-xs font-semibold rounded-full',
                  vista === 'cliente' ? 'bg-blue-600 text-white' : 'text-zinc-700 hover:bg-zinc-50'
                )}
              >
                Cliente
              </button>
              <button
                type="button"
                onClick={() => {
                  setVista('cocina');
                  setQuery({ mesa, vista: 'cocina' });
                }}
                className={classNames(
                  'px-3 py-2 text-xs font-semibold rounded-full',
                  vista === 'cocina' ? 'bg-blue-600 text-white' : 'text-zinc-700 hover:bg-zinc-50'
                )}
              >
                Cocina
              </button>
              <button
                type="button"
                onClick={() => {
                  setVista('mozo');
                  setQuery({ mesa, vista: 'mozo' });
                }}
                className={classNames(
                  'px-3 py-2 text-xs font-semibold rounded-full',
                  vista === 'mozo' ? 'bg-blue-600 text-white' : 'text-zinc-700 hover:bg-zinc-50'
                )}
              >
                Mozo
              </button>
            </div>

            <Link
              href="/#contacto"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Pedir demo real
            </Link>
          </div>
        </div>
      </header>

      {vista === 'cliente' ? (
        <ClienteView
          mesa={mesa}
          setMesa={(v) => {
            const nv = normalizeMesa(v);
            setMesa(nv);
            setQuery({ mesa: nv });
          }}
          categorias={categoriasOrdenadas}
          catActiva={catActiva}
          setCatActiva={setCatActiva}
          q={q}
          setQ={setQ}
          productos={productosFiltrados}
          addToCart={addToCart}
          carrito={carrito}
          productosById={productosById}
          carritoTotal={carritoTotal}
          setQty={setQty}
          setNota={setNota}
          crearPedido={crearPedidoDesdeCarrito}
        />
      ) : vista === 'cocina' ? (
        <CocinaView
          pedidos={pedidos}
          productosById={productosById}
          stats={statsCocina}
          cambiarEstado={cambiarEstadoPedido}
          onIrMozo={() => {
            setVista('mozo');
            setQuery({ vista: 'mozo' });
          }}
        />
      ) : (
        <MozoView
          pedidos={pedidos}
          productosById={productosById}
          mesaEfectivo={mesaEfectivo}
          mesaPagada={mesaPagada}
          setMesaEfectivo={(mesaId, v) => setMesaEfectivo((p) => ({ ...p, [mesaId]: v }))}
          setMesaPagada={(mesaId, v) => setMesaPagada((p) => ({ ...p, [mesaId]: v }))}
          marcarEntregado={marcarEntregado}
          onIrCocina={() => {
            setVista('cocina');
            setQuery({ vista: 'cocina' });
          }}
        />
      )}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-8 text-xs text-zinc-500">
          Demo interna con datos ficticios. No se realiza ningún cobro ni pedido real.
        </div>
      </footer>
    </main>
  );
}

/* -------------------- SUBCOMPONENTES -------------------- */

function ClienteView(props: {
  mesa: string;
  setMesa: (v: string) => void;
  categorias: Categoria[];
  catActiva: string;
  setCatActiva: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  productos: Producto[];
  addToCart: (id: string) => void;
  carrito: ItemCarrito[];
  productosById: Record<string, Producto>;
  carritoTotal: number;
  setQty: (id: string, qty: number) => void;
  setNota: (id: string, nota: string) => void;
  crearPedido: () => void;
}) {
  const {
    mesa,
    setMesa,
    categorias,
    catActiva,
    setCatActiva,
    q,
    setQ,
    productos,
    addToCart,
    carrito,
    productosById,
    carritoTotal,
    setQty,
    setNota,
    crearPedido,
  } = props;

  return (
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs text-zinc-500">Menú (Demo)</div>
                <h1 className="text-2xl font-bold tracking-tight">Escaneá, elegí y pedí</h1>
                <p className="mt-1 text-sm text-zinc-700">
                  Mesa: <span className="font-semibold text-zinc-900">{mesa}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-600">Mesa</label>
                <input
                  value={mesa}
                  onChange={(e) => setMesa(e.target.value)}
                  className="h-10 w-20 rounded-2xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCatActiva(c.id)}
                  className={classNames(
                    'rounded-full border px-3 py-2 text-xs font-semibold',
                    c.id === catActiva
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-50'
                  )}
                >
                  {c.nombre}
                </button>
              ))}
              <div className="flex-1" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar…"
                className="h-10 w-full sm:w-56 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {productos.map((p) => (
              <div key={p.id} className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{p.nombre}</h3>
                      {p.destacado ? (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          Destacado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-zinc-700">{p.descripcion}</p>
                  </div>
                  <div className="text-sm font-bold text-zinc-900">{moneyARS(p.precio)}</div>
                </div>

                <button
                  type="button"
                  onClick={() => addToCart(p.id)}
                  className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Agregar
                </button>
              </div>
            ))}
          </div>
        </div>

        <aside className="md:sticky md:top-20 h-fit">
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Carrito</h2>
              <span className="rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                {carrito.length} ítems
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {carrito.length === 0 ? (
                <div className="rounded-2xl border border-black/10 bg-zinc-50 p-4 text-sm text-zinc-600">
                  Sumá productos para simular un pedido.
                </div>
              ) : (
                carrito.map((it) => {
                  const p = productosById[it.productoId];
                  if (!p) return null;

                  return (
                    <div key={it.productoId} className="rounded-2xl border border-black/10 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{p.nombre}</div>
                          <div className="text-xs text-zinc-500">{moneyARS(p.precio)} c/u</div>
                        </div>
                        <div className="text-sm font-bold">{moneyARS(p.precio * it.cantidad)}</div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQty(it.productoId, it.cantidad - 1)}
                          className="h-9 w-9 rounded-2xl border border-black/10 bg-white hover:bg-zinc-50"
                        >
                          −
                        </button>
                        <div className="h-9 min-w-10 rounded-2xl border border-black/10 bg-zinc-50 grid place-items-center text-sm font-semibold">
                          {it.cantidad}
                        </div>
                        <button
                          type="button"
                          onClick={() => setQty(it.productoId, it.cantidad + 1)}
                          className="h-9 w-9 rounded-2xl border border-black/10 bg-white hover:bg-zinc-50"
                        >
                          +
                        </button>

                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => setQty(it.productoId, 0)}
                          className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 underline"
                        >
                          Quitar
                        </button>
                      </div>

                      <input
                        value={it.nota ?? ''}
                        onChange={(e) => setNota(it.productoId, e.target.value)}
                        placeholder="Nota (opcional). Ej: sin azúcar / bien tostado"
                        className="mt-3 h-10 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-black/10 bg-zinc-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">Total</span>
                <span className="font-bold">{moneyARS(carritoTotal)}</span>
              </div>

              <button
                type="button"
                onClick={crearPedido}
                disabled={carrito.length === 0}
                className={classNames(
                  'mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white',
                  carrito.length === 0 ? 'bg-zinc-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                Enviar pedido (demo)
              </button>

              <div className="mt-3 text-xs text-zinc-500">
                Esto crea un pedido ficticio y aparece en Cocina / Mozo.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CocinaView(props: {
  pedidos: Pedido[];
  productosById: Record<string, Producto>;
  stats: { pendientes: number; enPrep: number; listos: number };
  cambiarEstado: (id: string, estado: EstadoPedido) => void;
  onIrMozo: () => void;
}) {
  const { pedidos, productosById, stats, cambiarEstado, onIrMozo } = props;

  const pedidosOrdenados = useMemo(() => {
    const rank: Record<EstadoPedido, number> = { pendiente: 0, en_preparacion: 1, listo: 2 };
    return [...pedidos].sort((a, b) => {
      const ra = rank[a.estado];
      const rb = rank[b.estado];
      if (ra !== rb) return ra - rb;
      return b.creado_en.localeCompare(a.creado_en);
    });
  }, [pedidos]);

  function totalPedido(p: Pedido) {
    let total = 0;
    for (const it of p.items) {
      const prod = productosById[it.productoId];
      if (prod) total += prod.precio * it.cantidad;
    }
    return total;
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs text-zinc-500">Cocina (Demo)</div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de cocina</h1>
          <p className="mt-1 text-sm text-zinc-700">Cambiá estados y marcá pedidos como listos.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onIrMozo}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Ir a Mozo
          </button>

          <Link
            href="/#contacto"
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Pedir demo real
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Kpi title="Pendientes" value={stats.pendientes} />
        <Kpi title="En preparación" value={stats.enPrep} />
        <Kpi title="Listos" value={stats.listos} />
      </div>

      <div className="mt-8 grid gap-4">
        {pedidosOrdenados.map((p) => {
          const b = badgeEstado(p.estado);
          return (
            <div key={p.id} className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold">Mesa {p.mesa}</div>
                    <span className={classNames('rounded-full border px-3 py-1 text-xs font-semibold', b.cls)}>
                      {b.label}
                    </span>
                    {p.entregado ? (
                      <span className="rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                        Entregado
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-zinc-500">{new Date(p.creado_en).toLocaleString('es-AR')}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cambiarEstado(p.id, 'pendiente')}
                    className={classNames(
                      'rounded-2xl border px-3 py-2 text-xs font-semibold',
                      p.estado === 'pendiente'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-50'
                    )}
                  >
                    Pendiente
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarEstado(p.id, 'en_preparacion')}
                    className={classNames(
                      'rounded-2xl border px-3 py-2 text-xs font-semibold',
                      p.estado === 'en_preparacion'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-50'
                    )}
                  >
                    En prep.
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarEstado(p.id, 'listo')}
                    className={classNames(
                      'rounded-2xl border px-3 py-2 text-xs font-semibold',
                      p.estado === 'listo'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-50'
                    )}
                  >
                    Listo
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {p.items.map((it, idx) => {
                  const prod = productosById[it.productoId];
                  if (!prod) return null;
                  return (
                    <div key={`${p.id}_${idx}`} className="rounded-2xl border border-black/10 bg-zinc-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {it.cantidad} × {prod.nombre}
                          </div>
                          {it.nota ? <div className="mt-1 text-xs text-zinc-600">Nota: {it.nota}</div> : null}
                        </div>
                        <div className="text-sm font-bold">{moneyARS(prod.precio * it.cantidad)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs text-zinc-500">Total del pedido</div>
                <div className="text-sm font-bold">{moneyARS(totalPedido(p))}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MozoView(props: {
  pedidos: Pedido[];
  productosById: Record<string, Producto>;
  mesaEfectivo: Record<string, boolean>;
  mesaPagada: Record<string, boolean>;
  setMesaEfectivo: (mesa: string, v: boolean) => void;
  setMesaPagada: (mesa: string, v: boolean) => void;
  marcarEntregado: (pedidoId: string) => void;
  onIrCocina: () => void;
}) {
  const {
    pedidos,
    productosById,
    mesaEfectivo,
    mesaPagada,
    setMesaEfectivo,
    setMesaPagada,
    marcarEntregado,
    onIrCocina,
  } = props;

  const listosParaEntregar = useMemo(() => {
    return pedidos
      .filter((p) => p.estado === 'listo' && !p.entregado)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  }, [pedidos]);

  const mesas = useMemo(() => {
    const set = new Set<string>();
    for (const p of pedidos) set.add(String(p.mesa));
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [pedidos]);

  function totalPedido(p: Pedido) {
    let total = 0;
    for (const it of p.items) {
      const prod = productosById[it.productoId];
      if (prod) total += prod.precio * it.cantidad;
    }
    return total;
  }

  function totalMesa(m: string) {
    return pedidos
      .filter((p) => String(p.mesa) === String(m))
      .reduce((acc, p) => acc + totalPedido(p), 0);
  }

  function resumenMesa(m: string) {
    const ps = pedidos.filter((p) => String(p.mesa) === String(m));
    return {
      pendientes: ps.filter((p) => p.estado === 'pendiente').length,
      enPrep: ps.filter((p) => p.estado === 'en_preparacion').length,
      listosNoEnt: ps.filter((p) => p.estado === 'listo' && !p.entregado).length,
    };
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs text-zinc-500">Mozo (Demo)</div>
          <h1 className="text-2xl font-bold tracking-tight">Pantalla mozo</h1>
          <p className="mt-1 text-sm text-zinc-700">Entregas + cuenta por mesa + pago efectivo.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onIrCocina}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Ir a Cocina
          </button>

          <Link
            href="/#contacto"
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Pedir demo real
          </Link>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Listos para entregar</h2>
          <span className="rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
            {listosParaEntregar.length} pedidos
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {listosParaEntregar.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-zinc-50 p-4 text-sm text-zinc-600">
              No hay pedidos listos sin entregar.
            </div>
          ) : (
            listosParaEntregar.map((p) => (
              <div key={p.id} className="rounded-2xl border border-black/10 bg-zinc-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-bold">Mesa {p.mesa}</div>
                    <div className="text-xs text-zinc-500">{new Date(p.creado_en).toLocaleString('es-AR')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold">{moneyARS(totalPedido(p))}</div>
                    <button
                      type="button"
                      onClick={() => marcarEntregado(p.id)}
                      className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Marcar entregado
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  {p.items.map((it, idx) => {
                    const prod = productosById[it.productoId];
                    if (!prod) return null;
                    return (
                      <div
                        key={`${p.id}_${idx}`}
                        className="flex items-start justify-between gap-3 rounded-xl bg-white p-3 border border-black/10"
                      >
                        <div className="text-sm">
                          <span className="font-semibold">{it.cantidad}×</span> {prod.nombre}
                          {it.nota ? <div className="text-xs text-zinc-500">Nota: {it.nota}</div> : null}
                        </div>
                        <div className="text-sm font-bold">{moneyARS(prod.precio * it.cantidad)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Cuentas por mesa</h2>
          <span className="text-xs text-zinc-500">Demo: total acumulado por mesa</span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {mesas.map((m) => {
            const tot = totalMesa(m);
            const r = resumenMesa(m);
            const efectivo = !!mesaEfectivo[m];
            const pagada = !!mesaPagada[m];

            return (
              <div key={m} className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">Mesa {m}</div>
                  {pagada ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Pagada
                    </span>
                  ) : (
                    <span className="rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                      Abierta
                    </span>
                  )}
                </div>

                <div className="mt-3 text-2xl font-bold">{moneyARS(tot)}</div>

                <div className="mt-3 grid gap-1 text-xs text-zinc-600">
                  <div>
                    Pendientes: <span className="font-semibold text-zinc-900">{r.pendientes}</span>
                  </div>
                  <div>
                    En prep.: <span className="font-semibold text-zinc-900">{r.enPrep}</span>
                  </div>
                  <div>
                    Listos sin entregar:{' '}
                    <span className="font-semibold text-zinc-900">{r.listosNoEnt}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMesaEfectivo(m, !efectivo)}
                    className={classNames(
                      'rounded-2xl border px-4 py-2 text-sm font-semibold',
                      efectivo
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-black/10 bg-white text-zinc-700 hover:bg-zinc-50'
                    )}
                  >
                    {efectivo ? 'Paga en efectivo ✓' : 'Marcar paga en efectivo'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMesaPagada(m, true)}
                    className={classNames(
                      'rounded-2xl px-4 py-2 text-sm font-semibold text-white',
                      pagada ? 'bg-zinc-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    )}
                    disabled={pagada}
                  >
                    Marcar cuenta pagada
                  </button>

                  {pagada ? (
                    <div className="text-xs text-zinc-500">Demo: en el sistema real esto cerraría la cuenta.</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}