'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type Pedido = {
  id: number;
  mesa_id: number;
  creado_en: string;
  estado: string;
  total: number | string | null;
  codigo_publico?: string | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  cliente_nombre?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  forma_pago?: 'efectivo' | 'virtual' | null;
  paga_efectivo?: boolean | null;
  efectivo_aprobado?: boolean | null;
};

type MesaRef = {
  id: number;
  numero: number | null;
  nombre: string | null;
};

type Producto = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
};

type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  comentarios: string;
};

type PedidoKind = 'salon' | 'takeaway' | 'delivery';
type ManualMode = 'salon' | 'takeaway';
type FormaPago = 'efectivo' | 'virtual';

type AdminSessionPayload = {
  adminId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  capabilities?: {
    waiter_mode?: boolean;
  };
  restaurant?: {
    business_mode?: BusinessMode;
  } | null;
};

type MesaActiva = {
  id: number;
  numero: number | null;
  nombre: string;
  pedidos: Pedido[];
  totalMesa: number;
};

function formatMoney(value: number | string | null | undefined) {
  const num = Number(value ?? 0);

  if (!Number.isFinite(num)) return '$0';

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isDeliveryPedido(pedido: Pedido) {
  const tipo = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    pedido.mesa_id === DELIVERY_MESA_ID ||
    tipo === 'delivery' ||
    tipo === 'envio' ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual'
  );
}

function isTakeawayPedido(pedido: Pedido) {
  const tipo = normalizeText(pedido.tipo_servicio);
  const origen = normalizeText(pedido.origen);

  return (
    tipo === 'takeaway' ||
    tipo === 'take_away' ||
    tipo === 'pickup' ||
    tipo === 'pick_up' ||
    tipo === 'retiro' ||
    origen === 'takeaway' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'takeaway_manual_mostrador' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function getPedidoKind(pedido: Pedido): PedidoKind {
  if (isDeliveryPedido(pedido)) return 'delivery';
  if (isTakeawayPedido(pedido)) return 'takeaway';
  return 'salon';
}

function isMostradorManagedPedido(pedido: Pedido) {
  return normalizeText(pedido.origen).includes('mostrador');
}

function getMesaDisplayName(
  mesa: MesaActiva | { numero: number | null; nombre: string }
) {
  if (mesa.numero != null && mesa.numero > 0) {
    return `Mesa ${mesa.numero}`;
  }

  return mesa.nombre;
}

function getTakeawayLabel(pedido: Pedido) {
  const cliente = String(pedido.cliente_nombre ?? '').trim();
  return cliente || 'Cliente sin nombre';
}

function getPaymentBadge(pedido: Pedido) {
  const raw = normalizeText(
    pedido.medio_pago ??
      pedido.forma_pago ??
      (pedido.paga_efectivo ? 'efectivo' : '')
  );

  if (raw === 'efectivo') {
    return {
      label: '💵 Efectivo',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (raw === 'virtual') {
    return {
      label: '💳 Virtual',
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
  }

  return {
    label: 'Pago sin definir',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function getEstadoBadgeClass(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'listo') {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }

  if (normalized === 'en_preparacion') {
    return 'bg-sky-100 text-sky-800 border-sky-200';
  }

  if (normalized === 'pendiente' || normalized === 'solicitado') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }

  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatEstadoLabel(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized === 'solicitado') return 'Solicitado';
  if (normalized === 'pendiente') return 'Pendiente';
  if (normalized === 'en_preparacion') return 'En preparación';
  if (normalized === 'listo') return 'Listo';
  if (normalized === 'entregado') return 'Entregado';
  if (normalized === 'cerrado') return 'Cerrado';

  return estado || 'Sin estado';
}

function calcularEstadoMesa(mesa: MesaActiva) {
  if (mesa.pedidos.length === 0) return 'libre';

  const hayEnCurso = mesa.pedidos.some((p) => {
    const estado = normalizeText(p.estado);
    return (
      estado === 'solicitado' ||
      estado === 'pendiente' ||
      estado === 'en_preparacion'
    );
  });

  if (hayEnCurso) return 'en_curso';

  return 'lista';
}

function getMesaEstadoBadge(estado: 'libre' | 'en_curso' | 'lista') {
  if (estado === 'lista') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Lista para entregar / cobrar
      </span>
    );
  }

  if (estado === 'en_curso') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        En curso
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      Libre
    </span>
  );
}

function sortMesas(a: MesaRef, b: MesaRef) {
  const aNumero =
    typeof a.numero === 'number' && a.numero > 0 ? a.numero : Number.MAX_SAFE_INTEGER;
  const bNumero =
    typeof b.numero === 'number' && b.numero > 0 ? b.numero : Number.MAX_SAFE_INTEGER;

  if (aNumero !== bNumero) return aNumero - bNumero;
  return a.id - b.id;
}

export default function MostradorPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');
  const [businessMode, setBusinessMode] = useState<BusinessMode>('restaurant');
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesasMap, setMesasMap] = useState<Record<number, MesaRef>>({});
  const [mesasList, setMesasList] = useState<MesaRef[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  const [manualMode, setManualMode] = useState<ManualMode>('takeaway');
  const [manualMesaId, setManualMesaId] = useState<string>('');
  const [manualClienteNombre, setManualClienteNombre] = useState('');
  const [manualFormaPago, setManualFormaPago] = useState<FormaPago>('efectivo');
  const [resolverEnMostrador, setResolverEnMostrador] = useState(false);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(null);
  const [cerrandoMesaId, setCerrandoMesaId] = useState<number | null>(null);
  const [creandoPedido, setCreandoPedido] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
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

        setCurrentPlan((session?.plan ?? 'esencial') as PlanCode);
        setCanUseWaiterMode(!!session?.capabilities?.waiter_mode);
        setBusinessMode(
          normalizeBusinessMode(
            session?.business_mode ?? session?.restaurant?.business_mode
          )
        );
      } catch (err) {
        console.error('No se pudo verificar acceso a mostrador', err);
        if (!active) return;
        router.replace('/admin/login');
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    verifyAccess();

    return () => {
      active = false;
    };
  }, [router]);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);

    const [
      { data: pedidosData, error: pedidosError },
      { data: mesasData, error: mesasError },
      { data: productosData, error: productosError },
    ] = await Promise.all([
      supabase
        .from('pedidos')
        .select(
          `
            id,
            mesa_id,
            creado_en,
            estado,
            total,
            codigo_publico,
            origen,
            tipo_servicio,
            cliente_nombre,
            medio_pago,
            estado_pago,
            forma_pago,
            paga_efectivo,
            efectivo_aprobado
          `
        )
        .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo'])
        .order('creado_en', { ascending: false }),
      supabase.from('mesas').select('id, numero, nombre'),
      supabase
        .from('productos')
        .select('id, nombre, descripcion, precio, categoria, imagen_url, disponible')
        .eq('disponible', true)
        .order('categoria', { ascending: true })
        .order('nombre', { ascending: true }),
    ]);

    if (pedidosError) {
      console.error('Error cargando pedidos en mostrador:', pedidosError);
      setError('No se pudieron cargar los pedidos de mostrador.');
      setPedidos([]);
    } else {
      const formateados: Pedido[] = ((pedidosData ?? []) as any[]).map((p) => ({
        id: p.id,
        mesa_id: p.mesa_id,
        creado_en: p.creado_en,
        estado: p.estado,
        total: p.total ?? 0,
        codigo_publico: p.codigo_publico ?? null,
        origen: p.origen ?? null,
        tipo_servicio: p.tipo_servicio ?? null,
        cliente_nombre: p.cliente_nombre ?? null,
        medio_pago: p.medio_pago ?? null,
        estado_pago: p.estado_pago ?? null,
        forma_pago: p.forma_pago ?? null,
        paga_efectivo: p.paga_efectivo ?? null,
        efectivo_aprobado: p.efectivo_aprobado ?? null,
      }));

      setPedidos(formateados);
    }

    if (mesasError) {
      console.error('Error cargando mesas en mostrador:', mesasError);
    } else {
      const mesas = ((mesasData ?? []) as MesaRef[])
        .filter((mesa) => mesa.id > DELIVERY_MESA_ID)
        .sort(sortMesas);

      const map: Record<number, MesaRef> = {};
      for (const mesa of mesas) {
        map[mesa.id] = mesa;
      }

      setMesasMap(map);
      setMesasList(mesas);

      if (!manualMesaId && mesas.length > 0) {
        setManualMesaId(String(mesas[0].id));
      }
    }

    if (productosError) {
      console.error('Error cargando productos en mostrador:', productosError);
    } else {
      const listaProductos = (productosData ?? []) as Producto[];
      setProductos(listaProductos);

      const cats = Array.from(
        new Set(
          listaProductos
            .map((p) => p.categoria)
            .filter((c): c is string => !!c && c.trim() !== '')
        )
      ).sort((a, b) => a.localeCompare(b));

      setCategorias(cats);
      setCategoriaSeleccionada((prev) => prev ?? cats[0] ?? null);
    }

    setCargando(false);
  }, [manualMesaId]);

  useEffect(() => {
    if (checkingAccess) return;

    void cargarDatos();

    const interval = setInterval(() => {
      void cargarDatos();
    }, 10000);

    return () => clearInterval(interval);
  }, [checkingAccess, cargarDatos]);

  useEffect(() => {
    if (manualMode === 'salon' && !manualMesaId && mesasList.length > 0) {
      setManualMesaId(String(mesasList[0].id));
    }
  }, [manualMesaId, manualMode, mesasList]);

  const productosFiltrados =
    categoriaSeleccionada == null
      ? []
      : productos.filter((p) => p.categoria === categoriaSeleccionada);

  const totalCarrito = useMemo(
    () =>
      carrito.reduce(
        (acc, item) => acc + item.producto.precio * item.cantidad,
        0
      ),
    [carrito]
  );

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

  const pedidosLocal = useMemo(
    () => pedidos.filter((pedido) => getPedidoKind(pedido) !== 'delivery'),
    [pedidos]
  );

  const takeawayPedidos = useMemo(
    () => pedidosLocal.filter((pedido) => getPedidoKind(pedido) === 'takeaway'),
    [pedidosLocal]
  );

  const mesasSalonActivas = useMemo<MesaActiva[]>(() => {
    const pedidosSalon = pedidosLocal.filter(
      (pedido) => getPedidoKind(pedido) === 'salon'
    );

    const grouped = new Map<number, Pedido[]>();

    for (const pedido of pedidosSalon) {
      if (!grouped.has(pedido.mesa_id)) {
        grouped.set(pedido.mesa_id, []);
      }

      grouped.get(pedido.mesa_id)!.push(pedido);
    }

    return Array.from(grouped.entries())
      .map(([mesaId, pedidosMesa]) => {
        const mesaRef = mesasMap[mesaId];

        const totalMesa = pedidosMesa.reduce(
          (acc, pedido) => acc + Number(pedido.total ?? 0),
          0
        );

        return {
          id: mesaId,
          numero: mesaRef?.numero ?? null,
          nombre: mesaRef?.nombre?.trim() || `Mesa ID ${mesaId}`,
          pedidos: pedidosMesa.sort((a, b) => {
            const timeA = new Date(a.creado_en).getTime();
            const timeB = new Date(b.creado_en).getTime();
            return timeA - timeB;
          }),
          totalMesa,
        };
      })
      .sort((a, b) => {
        const aNumero = a.numero ?? Number.MAX_SAFE_INTEGER;
        const bNumero = b.numero ?? Number.MAX_SAFE_INTEGER;

        if (aNumero !== bNumero) return aNumero - bNumero;
        return a.id - b.id;
      });
  }, [mesasMap, pedidosLocal]);

  const takeawayResumen = useMemo(() => {
    return takeawayPedidos.reduce(
      (acc, pedido) => {
        const estado = normalizeText(pedido.estado);

        if (estado === 'listo') {
          acc.listos += 1;
        } else if (estado === 'en_preparacion') {
          acc.preparando += 1;
        } else {
          acc.pendientes += 1;
        }

        return acc;
      },
      { pendientes: 0, preparando: 0, listos: 0 }
    );
  }, [takeawayPedidos]);

  const salonResumen = useMemo(() => {
    return mesasSalonActivas.reduce(
      (acc, mesa) => {
        const estado = calcularEstadoMesa(mesa);

        if (estado === 'lista') {
          acc.listas += 1;
        } else if (estado === 'en_curso') {
          acc.enCurso += 1;
        }

        return acc;
      },
      { enCurso: 0, listas: 0 }
    );
  }, [mesasSalonActivas]);

  async function actualizarEstadoPedido(pedidoId: number, nuevoEstado: string) {
    setActualizandoPedidoId(pedidoId);
    setMensaje(null);
    setError(null);

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id', pedidoId);

    if (updateError) {
      console.error('No se pudo actualizar el pedido:', updateError);
      setError('No se pudo actualizar el estado del pedido.');
      setActualizandoPedidoId(null);
      return;
    }

    setMensaje(`Pedido #${pedidoId} actualizado a ${formatEstadoLabel(nuevoEstado)}.`);
    setActualizandoPedidoId(null);
    await cargarDatos();
  }

  async function cerrarCuentaMesa(mesaId: number) {
    const mesa = mesasSalonActivas.find((item) => item.id === mesaId);
    if (!mesa) return;

    const mesaLabel = getMesaDisplayName(mesa);

    const confirmar = window.confirm(
      `¿Cerrar la cuenta de ${mesaLabel}? Esto va a pasar todos sus pedidos activos a "cerrado".`
    );
    if (!confirmar) return;

    setCerrandoMesaId(mesaId);
    setMensaje(null);
    setError(null);

    const ids = mesa.pedidos.map((pedido) => pedido.id);

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado: 'cerrado' })
      .in('id', ids);

    if (updateError) {
      console.error('No se pudo cerrar la cuenta de la mesa:', updateError);
      setError('No se pudo cerrar la cuenta de la mesa.');
      setCerrandoMesaId(null);
      return;
    }

    setMensaje(`Cuenta de ${mesaLabel} cerrada correctamente.`);
    setCerrandoMesaId(null);
    await cargarDatos();
  }

  async function crearPedidoManual() {
    if (carrito.length === 0) {
      setError('Agregá al menos un producto al pedido.');
      return;
    }

    if (manualMode === 'salon') {
      const mesaId = Number(manualMesaId);
      if (!Number.isFinite(mesaId) || mesaId <= DELIVERY_MESA_ID) {
        setError('Seleccioná una mesa válida.');
        return;
      }
    }

    if (manualMode === 'takeaway' && !manualClienteNombre.trim()) {
      setError('Ingresá el nombre del cliente para retirar.');
      return;
    }

    setCreandoPedido(true);
    setMensaje(null);
    setError(null);

    try {
      const payload = {
        mesa_id: manualMode === 'salon' ? Number(manualMesaId) : undefined,
        total: totalCarrito,
        forma_pago: manualFormaPago,
        origen:
          manualMode === 'salon'
            ? resolverEnMostrador
              ? 'salon_manual_mostrador'
              : 'salon_manual'
            : resolverEnMostrador
            ? 'takeaway_manual_mostrador'
            : 'takeaway_manual',
        tipo_servicio: manualMode === 'salon' ? 'mesa' : 'takeaway',
        medio_pago: manualFormaPago,
        estado_pago: manualFormaPago === 'efectivo' ? 'aprobado' : 'pendiente',
        efectivo_aprobado: manualFormaPago === 'efectivo',
        paga_efectivo: manualFormaPago === 'efectivo',
        cliente_nombre:
          manualMode === 'takeaway' ? manualClienteNombre.trim() : undefined,
        items: carrito.map((item) => ({
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          comentarios: item.comentarios.trim() || null,
        })),
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
        throw new Error(body?.error || 'No se pudo crear el pedido manual.');
      }

      const pedidoId = Number(body.pedido.id);

      setCarrito([]);
      setManualClienteNombre('');
      setResolverEnMostrador(false);

      setMensaje(
        resolverEnMostrador
          ? `Pedido #${pedidoId} creado en mostrador. Ya podés tomarlo y prepararlo desde esta misma pantalla.`
          : `Pedido #${pedidoId} creado correctamente. Va a seguir el circuito normal del local.`
      );

      await cargarDatos();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo crear el pedido manual.'
      );
    } finally {
      setCreandoPedido(false);
    }
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p>Verificando acceso a Mostrador / Caja...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                  MOSTRADOR / CAJA
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Plan {formatPlanLabel(currentPlan)}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Modo {formatBusinessModeLabel(businessMode)}
                </span>

                {businessMode === 'restaurant' && canUseWaiterMode ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Pro / mozo disponible
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">
                Punto de venta y operación final
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Desde acá podés crear pedidos manuales, resolver pedidos rápidos
                sin cocina, entregar take away y cerrar cuentas del salón.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void cargarDatos();
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Actualizar
              </button>

              <button
                onClick={() => router.push('/cocina')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ver cocina
              </button>

              <button
                onClick={() => router.push('/retiro')}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                Ver pantalla pública
              </button>

              {businessMode === 'restaurant' && canUseWaiterMode ? (
                <button
                  onClick={() => router.push('/mozo/mesas')}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Ver mozo
                </button>
              ) : null}

              <button
                onClick={() => router.push('/inicio')}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Volver a inicio
              </button>
            </div>
          </div>
        </header>

        {mensaje ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {mensaje}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualMode('takeaway')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                manualMode === 'takeaway'
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Pedido take away
            </button>

            <button
              type="button"
              onClick={() => setManualMode('salon')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                manualMode === 'salon'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Pedido de salón
            </button>
          </div>

          <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_1.1fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Datos del pedido manual
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Si el pedido no requiere cocina, activá la opción para resolverlo
                  desde este mismo mostrador.
                </p>
              </div>

              {manualMode === 'salon' ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Mesa</span>
                  <select
                    value={manualMesaId}
                    onChange={(e) => setManualMesaId(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {mesasList.length === 0 ? (
                      <option value="">No hay mesas disponibles</option>
                    ) : null}

                    {mesasList.map((mesa) => (
                      <option key={mesa.id} value={mesa.id}>
                        {mesa.numero != null && mesa.numero > 0
                          ? `Mesa ${mesa.numero}`
                          : mesa.nombre || `Mesa ID ${mesa.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Nombre del cliente
                  </span>
                  <input
                    type="text"
                    value={manualClienteNombre}
                    onChange={(e) => setManualClienteNombre(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Ej: Lucía"
                  />
                </label>
              )}

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Forma de pago
                </span>
                <select
                  value={manualFormaPago}
                  onChange={(e) => setManualFormaPago(e.target.value as FormaPago)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="virtual">Virtual</option>
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <input
                  type="checkbox"
                  checked={resolverEnMostrador}
                  onChange={(e) => setResolverEnMostrador(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Resolver en mostrador (sin cocina)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    Usalo para café, bebida, sandwich ya listo u otras salidas
                    rápidas que no necesiten pasar por cocina.
                  </p>
                </div>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Comportamiento de esta primera versión
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Por ahora esta decisión es por pedido completo. Más adelante la
                  podemos refinar por producto desde administración.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Categorías</h3>

                {categorias.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    No hay categorías disponibles.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
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

              <div className="space-y-3">
                {categoriaSeleccionada == null ? (
                  <p className="text-sm text-slate-600">
                    Elegí una categoría para cargar productos.
                  </p>
                ) : productosFiltrados.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No hay productos disponibles en esta categoría.
                  </p>
                ) : (
                  productosFiltrados.map((producto) => (
                    <article
                      key={producto.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="flex gap-3 p-4">
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                          {producto.imagen_url ? (
                            <img
                              src={producto.imagen_url}
                              alt={producto.nombre}
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
                              {producto.nombre}
                            </h3>
                            {producto.descripcion ? (
                              <p className="mt-1 text-sm text-slate-600">
                                {producto.descripcion}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="font-bold text-slate-900">
                              {formatMoney(producto.precio)}
                            </p>

                            <button
                              type="button"
                              onClick={() => agregarAlCarrito(producto)}
                              className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                            >
                              Agregar
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Pedido actual</h3>

              {carrito.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  Todavía no agregaste productos.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {carrito.map((item) => (
                    <div
                      key={item.producto.id}
                      className="rounded-2xl border border-slate-200 px-3 py-3"
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
                  Total: {formatMoney(totalCarrito)}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    void crearPedidoManual();
                  }}
                  disabled={creandoPedido || carrito.length === 0}
                  className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {creandoPedido
                    ? 'Creando pedido...'
                    : resolverEnMostrador
                    ? 'Crear pedido y resolver en mostrador'
                    : 'Crear pedido manual'}
                </button>
              </div>
            </aside>
          </div>
        </section>

        {cargando ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600 shadow-sm">
            Cargando mostrador...
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Take away
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Pedidos para mostrador
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Si el pedido fue creado para resolverse en mostrador, podés
                  tomarlo, prepararlo, marcarlo listo y entregarlo desde acá.
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-2xl bg-slate-50 px-4 py-2">
                  <p className="text-xs text-slate-500">Pendientes</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {takeawayResumen.pendientes}
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-2">
                  <p className="text-xs text-sky-700">Preparando</p>
                  <p className="text-2xl font-bold text-sky-900">
                    {takeawayResumen.preparando}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-2">
                  <p className="text-xs text-emerald-700">Listos</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {takeawayResumen.listos}
                  </p>
                </div>
              </div>
            </div>

            {takeawayPedidos.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-slate-600">
                No hay pedidos take away activos.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {takeawayPedidos.map((pedido) => {
                  const paymentBadge = getPaymentBadge(pedido);
                  const ready = normalizeText(pedido.estado) === 'listo';
                  const inPreparation =
                    normalizeText(pedido.estado) === 'en_preparacion';
                  const pending =
                    normalizeText(pedido.estado) === 'pendiente' ||
                    normalizeText(pedido.estado) === 'solicitado';
                  const handledHere = isMostradorManagedPedido(pedido);

                  return (
                    <article
                      key={pedido.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        ready
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                              TAKE AWAY
                            </span>

                            {handledHere ? (
                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                                RESUELVE MOSTRADOR
                              </span>
                            ) : null}

                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getEstadoBadgeClass(
                                pedido.estado
                              )}`}
                            >
                              {formatEstadoLabel(pedido.estado)}
                            </span>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${paymentBadge.className}`}
                            >
                              {paymentBadge.label}
                            </span>
                          </div>

                          <h3 className="mt-3 text-xl font-bold text-slate-900">
                            {getTakeawayLabel(pedido)}
                          </h3>

                          <p className="mt-1 text-sm text-slate-600">
                            {pedido.codigo_publico || `Pedido #${pedido.id}`}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            Creado: {formatDateTime(pedido.creado_en)}
                          </p>

                          {pedido.estado_pago ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Estado de pago: {pedido.estado_pago}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-500">Total</p>
                          <p className="text-xl font-bold text-slate-900">
                            {formatMoney(pedido.total)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {handledHere && pending ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actualizarEstadoPedido(pedido.id, 'en_preparacion');
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? 'Actualizando...'
                              : 'Tomar y preparar'}
                          </button>
                        ) : null}

                        {handledHere && inPreparation ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actualizarEstadoPedido(pedido.id, 'listo');
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? 'Actualizando...'
                              : 'Marcar listo'}
                          </button>
                        ) : null}

                        {ready ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actualizarEstadoPedido(pedido.id, 'entregado');
                            }}
                            disabled={actualizandoPedidoId === pedido.id}
                            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            {actualizandoPedidoId === pedido.id
                              ? 'Actualizando...'
                              : 'Marcar entregado'}
                          </button>
                        ) : null}

                        {!handledHere && !ready ? (
                          <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                            Esperando que cocina lo marque como listo
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Salón
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Mesas activas
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  En Esencial, esta pantalla también sirve para tomar pedidos
                  manuales de una mesa, resolver salidas rápidas y cerrar la cuenta.
                </p>
              </div>

              <div className="grid gap-2 text-right">
                <div className="rounded-2xl bg-amber-50 px-4 py-2">
                  <p className="text-xs text-amber-700">En curso</p>
                  <p className="text-2xl font-bold text-amber-900">
                    {salonResumen.enCurso}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-2">
                  <p className="text-xs text-emerald-700">Listas</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {salonResumen.listas}
                  </p>
                </div>
              </div>
            </div>

            {mesasSalonActivas.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
                No hay mesas con pedidos activos.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {mesasSalonActivas.map((mesa) => {
                  const estadoMesa = calcularEstadoMesa(mesa);

                  return (
                    <article
                      key={mesa.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        estadoMesa === 'lista'
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {getMesaEstadoBadge(estadoMesa)}
                          </div>

                          <h3 className="mt-3 text-xl font-bold text-slate-900">
                            {getMesaDisplayName(mesa)}
                          </h3>

                          <p className="mt-1 text-sm text-slate-600">
                            {mesa.pedidos.length} pedido
                            {mesa.pedidos.length !== 1 ? 's' : ''} activo
                            {mesa.pedidos.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-500">Total mesa</p>
                          <p className="text-xl font-bold text-slate-900">
                            {formatMoney(mesa.totalMesa)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        {mesa.pedidos.map((pedido) => {
                          const paymentBadge = getPaymentBadge(pedido);
                          const handledHere = isMostradorManagedPedido(pedido);
                          const pending =
                            normalizeText(pedido.estado) === 'pendiente' ||
                            normalizeText(pedido.estado) === 'solicitado';
                          const inPreparation =
                            normalizeText(pedido.estado) === 'en_preparacion';

                          return (
                            <div
                              key={pedido.id}
                              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">
                                      {pedido.codigo_publico || `Pedido #${pedido.id}`}
                                    </span>

                                    {handledHere ? (
                                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                                        RESUELVE MOSTRADOR
                                      </span>
                                    ) : null}

                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getEstadoBadgeClass(
                                        pedido.estado
                                      )}`}
                                    >
                                      {formatEstadoLabel(pedido.estado)}
                                    </span>

                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${paymentBadge.className}`}
                                    >
                                      {paymentBadge.label}
                                    </span>
                                  </div>

                                  <p className="mt-1 text-xs text-slate-500">
                                    {formatTime(pedido.creado_en)}
                                    {pedido.estado_pago
                                      ? ` · Pago: ${pedido.estado_pago}`
                                      : ''}
                                  </p>
                                </div>

                                <div className="text-right text-sm font-semibold text-slate-900">
                                  {formatMoney(pedido.total)}
                                </div>
                              </div>

                              {handledHere ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {pending ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void actualizarEstadoPedido(
                                          pedido.id,
                                          'en_preparacion'
                                        );
                                      }}
                                      disabled={actualizandoPedidoId === pedido.id}
                                      className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                                    >
                                      {actualizandoPedidoId === pedido.id
                                        ? 'Actualizando...'
                                        : 'Tomar y preparar'}
                                    </button>
                                  ) : null}

                                  {inPreparation ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void actualizarEstadoPedido(
                                          pedido.id,
                                          'listo'
                                        );
                                      }}
                                      disabled={actualizandoPedidoId === pedido.id}
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                      {actualizandoPedidoId === pedido.id
                                        ? 'Actualizando...'
                                        : 'Marcar listo'}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void cerrarCuentaMesa(mesa.id);
                          }}
                          disabled={cerrandoMesaId === mesa.id}
                          className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {cerrandoMesaId === mesa.id
                            ? 'Cerrando...'
                            : 'Cerrar cuenta / liberar mesa'}
                        </button>

                        {estadoMesa === 'lista' ? (
                          <span className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
                            La mesa ya tiene todo listo
                          </span>
                        ) : (
                          <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                            Todavía hay pedidos en curso para esta mesa
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {businessMode === 'takeaway' ? (
              <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El local está configurado en modo <strong>take away</strong>. Esta
                sección de salón puede quedar vacía y eso es normal.
              </div>
            ) : null}
          </article>
        </section>
      </div>
    </main>
  );
}