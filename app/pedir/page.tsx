'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BusinessMode } from '@/lib/plans';
import { supabase } from '@/lib/supabaseClient';

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url: string | null;
  disponible?: boolean | null;
  control_stock?: boolean | null;
  stock_actual?: number | null;
  permitir_sin_stock?: boolean | null;
  marca_id?: string | null;
};

type Marca = {
  id: string;
  nombre: string;
  descripcion: string | null;
  logo_url?: string | null;
  color_hex?: string | null;
  activa: boolean | null;
  orden: number | null;
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

function getStockDisponible(producto: Producto) {
  if (!producto.control_stock) return null;
  if (producto.permitir_sin_stock) return null;
  return Math.max(Number(producto.stock_actual ?? 0), 0);
}

function isProductoAgotado(producto: Producto) {
  const stockDisponible = getStockDisponible(producto);
  return stockDisponible !== null && stockDisponible <= 0;
}

function getMaxCantidadCarrito(producto: Producto) {
  const stockDisponible = getStockDisponible(producto);
  return stockDisponible === null ? Number.MAX_SAFE_INTEGER : stockDisponible;
}

function getStockMessage(producto: Producto) {
  if (!producto.control_stock) return null;
  if (producto.permitir_sin_stock) return 'Stock flexible';

  const stock = Math.max(Number(producto.stock_actual ?? 0), 0);

  if (stock <= 0) return 'Sin stock';
  if (stock <= 5) return `Disponibles: ${stock}`;

  return null;
}

export default function PedirPage() {
  const [localConfig, setLocalConfig] = useState<LocalPublicConfig | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
const [marcas, setMarcas] = useState<Marca[]>([]);
const [categorias, setCategorias] = useState<string[]>([]);
const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(
  null
);
const [marcaSeleccionada, setMarcaSeleccionada] = useState<string>('todas');

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteNombre, setClienteNombre] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const businessMode = normalizeBusinessModeForPublic(localConfig?.business_mode);
  const isTakeawayMode = businessMode === 'takeaway';

  const cargarProductos = useCallback(async () => {
  const res = await fetch('/api/productos?soloDisponibles=1', {
    method: 'GET',
    cache: 'no-store',
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(body?.error || 'No se pudieron cargar los productos.');
  }

  const listaProductos = (body ?? []) as Producto[];
  setProductos(listaProductos);

  const cats = Array.from(
    new Set(
      listaProductos
        .map((p) => p.categoria)
        .filter((c): c is string => !!c && c.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b));

  setCategorias(cats);
  setCategoriaSeleccionada((prev) =>
    prev && cats.includes(prev) ? prev : cats[0] ?? null
  );
}, []);

  useEffect(() => {
  let activo = true;

  async function cargar() {
    try {
      setCargando(true);
      setMensaje(null);
      setError(null);

      const [configRes, productosRes, marcasRes] = await Promise.all([
  supabase
    .from('configuracion_local')
    .select('nombre_local, direccion, horario_atencion, business_mode')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle(),
  fetch('/api/productos?soloDisponibles=1', {
    method: 'GET',
    cache: 'no-store',
  }),
  supabase
    .from('marcas')
    .select('id, nombre, descripcion, logo_url, color_hex, activa, orden')
    .eq('activa', true)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true }),
]);

      if (!activo) return;

      if (configRes.error) {
        console.warn(
          'No se pudo cargar configuracion_local en /pedir:',
          configRes.error
        );
      } else {
        setLocalConfig((configRes.data as LocalPublicConfig | null) ?? null);
      }

      if (marcasRes.error) {
  console.warn('No se pudieron cargar marcas en /pedir:', marcasRes.error);
  setMarcas([]);
  setMarcaSeleccionada('todas');
} else {
  const listaMarcas = (marcasRes.data as Marca[]) ?? [];
  setMarcas(listaMarcas);
  setMarcaSeleccionada((prev) => {
    if (prev === 'todas') return prev;
    return listaMarcas.some((marca) => marca.id === prev) ? prev : 'todas';
  });
}

      const productosBody = await productosRes.json().catch(() => null);

      if (!productosRes.ok) {
        throw new Error(
          productosBody?.error || 'No se pudieron cargar los productos.'
        );
      }

      const listaProductos = (productosBody as Producto[]) ?? [];
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
          : 'No se pudo cargar el menú.'
      );
    } finally {
      if (activo) {
        setCargando(false);
      }
    }
  }

  void cargar();

  return () => {
    activo = false;
  };
}, []);

  const marcasPorId = useMemo(() => {
  return new Map(marcas.map((marca) => [marca.id, marca]));
}, [marcas]);

const mostrarFiltroMarcas = isTakeawayMode && marcas.length > 1;

function getMarcaNombre(producto: Producto) {
  if (!producto.marca_id) return null;
  return marcasPorId.get(producto.marca_id)?.nombre ?? null;
}

const productosFiltrados = useMemo(() => {
  if (categoriaSeleccionada == null) return [];

  return productos.filter((p) => {
    const coincideCategoria = p.categoria === categoriaSeleccionada;

    const coincideMarca =
      !mostrarFiltroMarcas ||
      marcaSeleccionada === 'todas' ||
      (p.marca_id ?? '') === marcaSeleccionada;

    return coincideCategoria && coincideMarca;
  });
}, [
  productos,
  categoriaSeleccionada,
  marcaSeleccionada,
  mostrarFiltroMarcas,
]);

  function agregarAlCarrito(producto: Producto) {
    setError(null);

    if (isProductoAgotado(producto)) {
      setError(`"${producto.nombre}" está sin stock.`);
      return;
    }

    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);
      const maxCantidad = getMaxCantidadCarrito(producto);

      if (existente) {
        if (existente.cantidad >= maxCantidad) {
          setError(`No hay más stock disponible para "${producto.nombre}".`);
          return prev;
        }

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
    const itemActual = carrito.find((item) => item.producto.id === productoId);
    if (!itemActual) return;

    if (cantidad <= 0) {
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    const maxCantidad = getMaxCantidadCarrito(itemActual.producto);
    const cantidadAjustada = Math.min(cantidad, maxCantidad);

    if (cantidadAjustada <= 0) {
      setError(`"${itemActual.producto.nombre}" está sin stock.`);
      setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
      return;
    }

    if (cantidadAjustada !== cantidad) {
      setError(`Solo hay ${maxCantidad} unidad(es) disponible(s) de "${itemActual.producto.nombre}".`);
    } else {
      setError(null);
    }

    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, cantidad: cantidadAjustada } : i
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
      await cargarProductos();
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

  const heroBadge = isTakeawayMode ? 'TAKE AWAY' : 'PEDIDO ONLINE';
const heroTitle = 'Hacé tu pedido para retirar';
const heroDescription =
  'Elegí tus productos, indicá tu nombre y confirmá el pedido. Te avisaremos cuando esté listo para retirar por el mostrador.';

const sideTitle = 'Tu pedido';
const menuTitle = 'Menú';
const helperText =
  'Tu pedido queda registrado con tu nombre para que puedan identificarlo al momento del retiro.';
  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <p className="text-slate-700">Cargando menú...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border bg-white p-6 shadow-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2">
  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
    {heroBadge}
  </span>
</div>

            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              {localNombre}
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {heroTitle}
            </p>

            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {heroDescription}
            </p>

            {(localDireccion || localHorario) && (
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {localDireccion ? <p>📍 {localDireccion}</p> : null}
                {localHorario ? <p>🕒 {localHorario}</p> : null}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/retiro"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                Ver pantalla de retiro
              </Link>

              {isRestaurantMode ? (
                <Link
                  href="/inicio"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Volver al flujo principal
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        {isRestaurantMode ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Este negocio está configurado como <strong>{actualBusinessModeLabel}</strong>.
            La operación principal del salón sigue identificándose por <strong>mesa</strong>.
            Esta pantalla queda habilitada como flujo opcional de <strong>retiro por persona</strong>.
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
                  Este nombre se guarda dentro del pedido y se usa para identificarlo
                  cuando esté listo. En esta pantalla la referencia principal siempre
                  es la persona que retira.
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

            {mostrarFiltroMarcas ? (
  <div className="rounded-3xl border bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-900">Marcas</h2>

    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setMarcaSeleccionada('todas')}
        className={
          'rounded-full border px-3 py-1 text-sm ' +
          (marcaSeleccionada === 'todas'
            ? 'border-emerald-700 bg-emerald-700 text-white'
            : 'border-slate-300 bg-white text-slate-900')
        }
      >
        Todas las marcas
      </button>

      {marcas.map((marca) => {
        const activa = marcaSeleccionada === marca.id;

        return (
          <button
            key={marca.id}
            type="button"
            onClick={() => setMarcaSeleccionada(marca.id)}
            className={
              'rounded-full border px-3 py-1 text-sm ' +
              (activa
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-slate-300 bg-white text-slate-900')
            }
          >
            {marca.nombre}
          </button>
        );
      })}
    </div>
  </div>
) : null}

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {menuTitle}
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
                  {productosFiltrados.map((p) => {
  const agotado = isProductoAgotado(p);
  const marcaNombre = getMarcaNombre(p);
  const itemEnCarrito = carrito.find((item) => item.producto.id === p.id);                    const maxCantidad = getMaxCantidadCarrito(p);
                    const llegoAlMaximo =
                      itemEnCarrito != null && itemEnCarrito.cantidad >= maxCantidad;
                    const stockMessage = getStockMessage(p);

                    return (
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

                              {mostrarFiltroMarcas && marcaNombre ? (
  <p className="mt-1 text-xs font-semibold text-emerald-700">
    {marcaNombre}
  </p>
) : null}
                              {p.descripcion ? (
                                <p className="mt-1 text-sm text-slate-600">
                                  {p.descripcion}
                                </p>
                              ) : null}

                              {stockMessage ? (
                                <p
                                  className={`mt-2 text-xs font-medium ${
                                    agotado ? 'text-rose-700' : 'text-slate-500'
                                  }`}
                                >
                                  {stockMessage}
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
                                disabled={agotado || llegoAlMaximo}
                                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                  agotado || llegoAlMaximo
                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'bg-amber-500 text-white hover:bg-amber-600'
                                }`}
                              >
                                {agotado ? 'Agotado' : llegoAlMaximo ? 'Máximo' : 'Agregar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                {sideTitle}
              </h2>

              {carrito.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  El carrito está vacío.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {carrito.map((item) => {
                    const maxCantidad = getMaxCantidadCarrito(item.producto);
                    const tieneLimite = Number.isFinite(maxCantidad);

                    return (
                      <div
                        key={item.producto.id}
                        className="rounded-2xl border px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-medium text-slate-900">
                              {item.producto.nombre}
                            </span>
                            {tieneLimite ? (
                              <p className="text-xs text-slate-500">
                                Máximo disponible: {maxCantidad}
                              </p>
                            ) : null}
                          </div>

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
                              max={tieneLimite ? maxCantidad : undefined}
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
                              disabled={item.cantidad >= maxCantidad}
                              className="h-8 w-8 rounded-full border bg-amber-100 text-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    );
                  })}
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
                  {helperText}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}