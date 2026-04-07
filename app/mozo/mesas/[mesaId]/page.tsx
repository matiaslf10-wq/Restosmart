'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatPlanLabel, type PlanCode } from '@/lib/plans';

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  producto: {
    nombre: string;
    precio: number | null;
  } | null;
};

type Pedido = {
  id: number;
  mesa_id: number;
  creado_en: string;
  estado: string;
  paga_efectivo?: boolean;
  items: ItemPedido[];
};

export default function CuentaMesaPage() {
  const params = useParams();
  const router = useRouter();
  const mesaId = Number((params as { mesaId?: string }).mesaId);

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesandoPago, setProcesandoPago] = useState(false);

  const cargarPedidos = async () => {
    if (!mesaId) return;
    setCargando(true);
    setMensaje(null);

    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        mesa_id,
        creado_en,
        estado,
        paga_efectivo,
        items_pedido (
          id,
          cantidad,
          comentarios,
          producto:productos ( nombre, precio )
        )
      `)
      .eq('mesa_id', mesaId)
      .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo'])
      .order('creado_en', { ascending: true });

    if (error) {
      console.error('Error al cargar pedidos de la mesa:', error);
      setMensaje('No se pudo cargar la cuenta de la mesa.');
      setPedidos([]);
      setCargando(false);
      return;
    }

    if (data) {
      const formateados: Pedido[] = data.map((p: any) => ({
        id: p.id,
        mesa_id: p.mesa_id,
        creado_en: p.creado_en,
        estado: p.estado,
        paga_efectivo: p.paga_efectivo,
        items: p.items_pedido ?? [],
      }));
      setPedidos(formateados);
    } else {
      setPedidos([]);
    }

    setCargando(false);
  };

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
        const session = data?.session;

        if (!active) return;

        const plan = (session?.plan ?? 'esencial') as PlanCode;
        const enabled = !!session?.capabilities?.waiter_mode;

        setCurrentPlan(plan);
        setCanUseWaiterMode(enabled);
      } catch (error) {
        console.error('No se pudo verificar acceso a mozo/mesa', error);
        if (!active) return;
        setCanUseWaiterMode(false);
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

  useEffect(() => {
    if (!canUseWaiterMode) return;
    cargarPedidos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseWaiterMode, mesaId]);

  const subtotalPedido = (p: Pedido) =>
    p.items.reduce((acc, item) => {
      const precio = item.producto?.precio ?? 0;
      return acc + item.cantidad * precio;
    }, 0);

  const totalMesa = pedidos.reduce((acc, p) => acc + subtotalPedido(p), 0);

  const cerrarCuenta = async () => {
    if (pedidos.length === 0) {
      setMensaje('No hay pedidos abiertos para esta mesa.');
      return;
    }

    if (!confirm('¿Cerrar todos los pedidos de esta mesa?')) return;

    setCerrando(true);
    setMensaje(null);

    const ids = pedidos.map((p) => p.id);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'cerrado' })
      .in('id', ids);

    if (error) {
      console.error(error);
      setMensaje('No se pudo cerrar la cuenta.');
      setCerrando(false);
      return;
    }

    setMensaje('Cuenta cerrada correctamente.');
    setPedidos([]);
    setCerrando(false);
  };

  const marcarPagoEfectivoDesdeCliente = async () => {
    if (!mesaId) return;
    if (pedidos.length === 0) {
      setMensaje('No hay pedidos abiertos para marcar como efectivo.');
      return;
    }

    setProcesandoPago(true);
    setMensaje(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ paga_efectivo: true })
      .eq('mesa_id', mesaId)
      .in('estado', ['pendiente', 'en_preparacion', 'listo']);

    if (error) {
      console.error('Error al marcar pago en efectivo desde cliente:', error);
      setMensaje('No se pudo marcar el pago en efectivo. Avisá al mozo.');
      setProcesandoPago(false);
      return;
    }

    setMensaje('Listo, avisamos que vas a pagar en efectivo 💵');
    await cargarPedidos();
    setProcesandoPago(false);
  };

  const pagarVirtual = () => {
    const urlPago =
      process.env.NEXT_PUBLIC_PAGO_VIRTUAL_URL ||
      'https://www.mercadopago.com.ar';

    if (!urlPago) {
      setMensaje('Por ahora, pedile al mozo el QR de pago virtual 🙌');
      return;
    }

    window.open(urlPago, '_blank');
    setMensaje('Abrimos el pago virtual en una nueva ventana 💳');
  };

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Verificando acceso al modo mozo…</p>
      </main>
    );
  }

  if (!canUseWaiterMode) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border border-blue-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
              Disponible desde Pro
            </span>

            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              Vista de mozo por mesa
            </h1>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Tu plan actual es <strong>{formatPlanLabel(currentPlan)}</strong>.
              Esta funcionalidad forma parte del modo mozo, disponible desde
              <strong> Pro</strong>.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/#precios"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ver planes
              </a>
              <button
                onClick={() => router.push('/admin')}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Volver al admin
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!mesaId) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Falta el número de mesa en la URL.</p>
      </main>
    );
  }

  if (cargando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Cargando cuenta de la mesa...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-2xl font-bold">Cuenta – Mesa {mesaId}</h1>
          <button
            onClick={cargarPedidos}
            className="px-3 py-1 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700"
          >
            Actualizar
          </button>
        </header>

        {mensaje && (
          <p className="text-sm text-slate-700 bg-yellow-50 border border-yellow-300 px-3 py-2 rounded-lg">
            {mensaje}
          </p>
        )}

        {pedidos.length === 0 && (
          <p className="text-slate-600">
            No hay pedidos abiertos para esta mesa.
          </p>
        )}

        {pedidos.length > 0 && (
          <>
            <section className="space-y-3">
              {pedidos.map((p) => (
                <article
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">
                      Pedido #{p.id}
                    </h2>
                    <div className="text-xs text-slate-500">
                      {new Date(p.creado_en).toLocaleTimeString()} ·{' '}
                      {p.estado === 'solicitado'
                        ? 'Esperando confirmación del mozo'
                        : p.estado === 'pendiente'
                        ? 'Pendiente'
                        : p.estado === 'en_preparacion'
                        ? 'En preparación'
                        : 'Listo'}
                    </div>
                  </header>

                  <ul className="mt-2 space-y-1 text-sm">
                    {p.items.map((item) => (
                      <li key={item.id}>
                        <div className="flex justify-between">
                          <span>
                            {item.cantidad} × {item.producto?.nombre ?? '—'}
                          </span>
                          <span>
                            ${(item.producto?.precio ?? 0) * item.cantidad}
                          </span>
                        </div>
                        {item.comentarios && (
                          <p className="text-xs text-slate-600 ml-4">
                            Nota: {item.comentarios}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-2 text-right font-semibold">
                    Subtotal: ${subtotalPedido(p)}
                  </p>
                </article>
              ))}
            </section>

            <footer className="border-t border-slate-300 pt-3 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-lg font-bold">Total mesa: ${totalMesa}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={pagarVirtual}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700"
                  >
                    Pago virtual
                  </button>
                  <button
                    onClick={marcarPagoEfectivoDesdeCliente}
                    disabled={procesandoPago}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-emerald-50 font-semibold text-sm hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {procesandoPago ? 'Marcando...' : 'Pagar en efectivo'}
                  </button>
                  <button
                    onClick={cerrarCuenta}
                    disabled={cerrando}
                    className="px-4 py-2 rounded-lg bg-slate-500 text-white font-semibold text-sm hover:bg-slate-600 disabled:opacity-60"
                  >
                    {cerrando ? 'Cerrando...' : 'Cerrar cuenta'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                El mozo verá cómo elegiste pagar. Si algo no funciona, avisale directamente 😊
              </p>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}