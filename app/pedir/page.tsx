'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  formatBusinessModeLabel,
  type BusinessMode,
} from '@/lib/plans';
import { supabase } from '@/lib/supabaseClient';

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url: string | null;
  disponible?: boolean | null;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  comentarios: string;
};

type LocalPublicConfig = {
  nombre_local?: string | null;
  direccion?: string | null;
  horario_atencion?: string | null;
  business_mode?: BusinessMode | string | null;
};

type PedidoCreado = {
  id: number;
  estado: string;
  mesa_id: number;
};

type FormaPago = 'virtual' | 'efectivo';

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeBusinessModeForPublic(value: unknown): BusinessMode {
  return String(value ?? '').trim().toLowerCase() === 'takeaway'
    ? 'takeaway'
    : 'restaurant';
}

export default function PedirPage() {
  const [localConfig, setLocalConfig] = useState<LocalPublicConfig | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteNombre, setClienteNombre] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const businessMode = normalizeBusinessModeForPublic(localConfig?.business_mode);
  const actualBusinessModeLabel = formatBusinessModeLabel(businessMode);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        setCargando(true);
        setMensaje(null);
        setError(null);

        const [configRes, productosRes] = await Promise.all([
          supabase
            .from('configuracion_local')
            .select('nombre_local, direccion, horario_atencion, business_mode')
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('productos')
            .select('id, nombre, descripcion, precio, categoria, imagen_url, disponible')
            .eq('disponible', true)
            .order('categoria', { ascending: true })
            .order('nombre', { ascending: true }),
        ]);

        if (!activo) return;

        if (configRes.error) {
          console.warn('No se pudo cargar configuracion_local en /pedir:', configRes.error);
        } else {
          setLocalConfig((configRes.data as LocalPublicConfig | null) ?? null);
        }

        if (productosRes.error) {
          throw new Error('No se pudieron cargar los productos.');
        }

        const listaProductos = (productosRes.data as Producto[]) ?? [];
        setProductos(listaProductos);

        const cats = Array.from(
          new Set(
            listaProductos
              .map((p) => p.categoria)
              .filter((c): c is string => !!c && c.trim() !== '')
          )
        ).sort((a, b) => a.localeCompare(b));

        setCategorias(cats);
        setCategoriaSeleccionada(cats[0] ?? null);
      } catch (err) {
        console.error(err);
        if (!activo) return;
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la pantalla de take away.'
        );
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargar();

    return () => {
      activo = false;
    };
  }, []);

  const productosFiltrados =
    categoriaSeleccionada == null
      ? []
      : productos.filter((p) => p.categoria === categoriaSeleccionada);

  function agregarAlCarrito(producto: Producto) {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);

      if (existente) {
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }

      return [...prev, { producto, cantidad: 1, comentarios: '' }];
    });
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    if (cantidad <= 0) {
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, cantidad } : i
      )
    );
  }

  function cambiarComentario(productoId: number, texto: string) {
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, comentarios: texto } : i
      )
    );
  }

  const total = useMemo(
    () =>
      carrito.reduce(
        (acc, item) => acc + item.producto.precio * item.cantidad,
        0
      ),
    [carrito]
  );

  async function confirmarPedido(formaPago: FormaPago) {
    if (!clienteNombre.trim()) {
      setError('Ingresá un nombre para el retiro.');
      return;
    }

    if (carrito.length === 0) {
      setError('El carrito está vacío.');
      return;
    }

    try {
      setEnviando(true);
      setError(null);
      setMensaje(null);

      const nombreRetiro = clienteNombre.trim();

      const items = carrito.map((item) => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        comentarios: item.comentarios.trim() || null,
      }));

      const payload = {
        total,
        forma_pago: formaPago,
        origen: 'takeaway_web',
        tipo_servicio: 'takeaway',
        medio_pago: formaPago,
        estado_pago: formaPago === 'efectivo' ? 'aprobado' : 'pendiente',
        efectivo_aprobado: formaPago === 'efectivo',
        paga_efectivo: formaPago === 'efectivo',
        cliente_nombre: nombreRetiro,
        items,
      };

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.pedido) {
        throw new Error(body?.error || 'No se pudo crear el pedido.');
      }

      const pedido = body.pedido as PedidoCreado;

      setCarrito([]);
      setClienteNombre('');
      setMensaje(
        formaPago === 'efectivo'
          ? `Pedido #${pedido.id} generado correctamente para ${nombreRetiro}. Quedó registrado para pagar al retirar.`
          : `Pedido #${pedido.id} generado correctamente para ${nombreRetiro}. Quedó registrado con pago virtual pendiente.`
      );
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al confirmar el pedido.'
      );
    } finally {
      setEnviando(false);
    }
  }

  const localNombre = localConfig?.nombre_local?.trim() || 'RestoSmart';
  const localDireccion = localConfig?.direccion?.trim() || '';
  const localHorario = localConfig?.horario_atencion?.trim() || '';

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <p className="text-slate-700">Cargando take away...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  TAKE AWAY
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Modo configurado: {actualBusinessModeLabel}
                </span>

                {businessMode === 'restaurant' ? (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                    El local sigue configurado como restaurante
                  </span>
                ) : null}
              </div>

              <h1 className="mt-3 text-3xl font-bold text-slate-900">
                {localNombre}
              </h1>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Hacé tu pedido para retirar por mostrador, sin depender de una mesa.
              </p>

              {(localDireccion || localHorario) && (
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  {localDireccion ? <p>📍 {localDireccion}</p> : null}
                  {localHorario ? <p>🕒 {localHorario}</p> : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ir al sitio
              </Link>

              <Link
                href="/login"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ingresar
              </Link>
            </div>
          </div>
        </header>

        {businessMode === 'restaurant' ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Esta pantalla sigue funcionando para retiro, pero el negocio figura
            configurado como <strong>{actualBusinessModeLabel}</strong>. Si querés que
            todo el flujo quede alineado, revisá la configuración del local.
          </div>
        ) : null}

        {mensaje ? (
          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            {mensaje}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Datos para el retiro
              </h2>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Nombre para retirar
                  </span>
                  <input
                    type="text"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    className="rounded-xl border px-3 py-2"
                    placeholder="Ej: Lucía"
                  />
                </label>

                <p className="text-xs text-slate-500">
                  Este nombre se guarda dentro del pedido y se usa para identificarlo cuando esté listo.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Categorías</h2>

              {categorias.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No hay categorías disponibles.
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {categorias.map((cat) => {
                    const activa = categoriaSeleccionada === cat;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoriaSeleccionada(cat)}
                        className={
                          'rounded-full border px-3 py-1 text-sm ' +
                          (activa
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-900')
                        }
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Menú para retiro
              </h2>

              {categoriaSeleccionada == null && (
                <p className="text-sm text-slate-600">
                  No hay una categoría seleccionada.
                </p>
              )}

              {categoriaSeleccionada != null && productosFiltrados.length === 0 && (
                <p className="text-sm text-slate-600">
                  No hay productos disponibles en esta categoría.
                </p>
              )}

              {categoriaSeleccionada != null && productosFiltrados.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {productosFiltrados.map((p) => (
                    <article
                      key={p.id}
                      className="overflow-hidden rounded-3xl border bg-white shadow-sm"
                    >
                      <div className="flex gap-3 p-4">
                        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {p.imagen_url ? (
                            <img
                              src={p.imagen_url}
                              alt={p.nombre}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">
                              Sin imagen
                            </div>
                          )}
                        </div>

                        <div className="flex flex-1 flex-col justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900">
                              {p.nombre}
                            </h3>
                            {p.descripcion ? (
                              <p className="mt-1 text-sm text-slate-600">
                                {p.descripcion}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="font-bold text-slate-900">
                              {formatMoney(p.precio)}
                            </p>

                            <button
                              type="button"
                              onClick={() => agregarAlCarrito(p)}
                              className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                            >
                              Agregar
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Tu pedido</h2>

              {carrito.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  El carrito está vacío.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {carrito.map((item) => (
                    <div
                      key={item.producto.id}
                      className="rounded-2xl border px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {item.producto.nombre}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              cambiarCantidad(item.producto.id, item.cantidad - 1)
                            }
                            className="h-8 w-8 rounded-full border bg-slate-100 text-slate-700"
                          >
                            -
                          </button>

                          <input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            onChange={(e) =>
                              cambiarCantidad(
                                item.producto.id,
                                Number(e.target.value)
                              )
                            }
                            className="w-14 rounded border px-1 py-1 text-center text-sm"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              cambiarCantidad(item.producto.id, item.cantidad + 1)
                            }
                            className="h-8 w-8 rounded-full border bg-amber-100 text-amber-700"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <textarea
                        className="mt-3 w-full rounded border px-2 py-1 text-sm"
                        placeholder="Notas del producto (opcional)"
                        value={item.comentarios}
                        onChange={(e) =>
                          cambiarComentario(item.producto.id, e.target.value)
                        }
                      />

                      <p className="mt-2 text-right text-sm text-slate-700">
                        Subtotal: {formatMoney(item.producto.precio * item.cantidad)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
                <p className="text-right text-lg font-bold text-slate-900">
                  Total: {formatMoney(total)}
                </p>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => confirmarPedido('virtual')}
                    disabled={enviando || carrito.length === 0}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {enviando
                      ? 'Confirmando...'
                      : 'Confirmar pedido con pago virtual'}
                  </button>

                  <button
                    type="button"
                    onClick={() => confirmarPedido('efectivo')}
                    disabled={enviando || carrito.length === 0}
                    className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {enviando
                      ? 'Confirmando...'
                      : 'Confirmar pedido para pagar al retirar'}
                  </button>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  El pedido se envía a cocina con lógica de take away y el nombre de retiro queda guardado como dato propio del pedido.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}