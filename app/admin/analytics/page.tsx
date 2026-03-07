'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type RowPedidosHora = { hora: string; pedidos: number };
type RowTopProductos = {
  producto_id: number;
  producto_nombre: string;
  unidades: number;
  ingresos: number;
};
type RowTiemposPedido = {
  pedido_id: number;
  mesa_id: number;
  creado_en: string;
  estado_actual: string;

  min_mozo_confirma: number | null;
  min_espera_cocina: number | null;
  min_preparacion: number | null;
  min_total_hasta_listo: number | null;
};

// ⚠️ Importante: para que el rango "Desde/Hasta" respete Argentina (UTC-03)
// no usamos toISOString() con "T00:00:00" local sin offset, porque puede correrse el día.
// Forzamos el offset -03:00 (Buenos Aires).
function toIsoStartOfDayAR(localDate: string) {
  return new Date(localDate + 'T00:00:00-03:00').toISOString();
}

function toIsoEndOfDayAR(localDate: string) {
  return new Date(localDate + 'T23:59:59.999-03:00').toISOString();
}

export default function AdminAnalyticsPage() {
  // Rango por defecto: últimos 7 días
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const y2 = sevenDaysAgo.getFullYear();
  const m2 = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
  const d2 = String(sevenDaysAgo.getDate()).padStart(2, '0');
  const sevenDaysAgoStr = `${y2}-${m2}-${d2}`;

  const [desde, setDesde] = useState(sevenDaysAgoStr);
  const [hasta, setHasta] = useState(todayStr);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pedidosHora, setPedidosHora] = useState<RowPedidosHora[]>([]);
  const [topProductos, setTopProductos] = useState<RowTopProductos[]>([]);
  const [tiempos, setTiempos] = useState<RowTiemposPedido[]>([]);
  const [kpiPedidosTotal, setKpiPedidosTotal] = useState(0);
const [kpiPedidosCerrados, setKpiPedidosCerrados] = useState(0);
const [kpiPedidosCancelados, setKpiPedidosCancelados] = useState(0);
const [kpiIngresos, setKpiIngresos] = useState(0);
const [kpiTicketProm, setKpiTicketProm] = useState<number | null>(null);


  const isoDesde = useMemo(() => toIsoStartOfDayAR(desde), [desde]);
  const isoHasta = useMemo(() => toIsoEndOfDayAR(hasta), [hasta]);

  const cargar = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // 0) KPIs base (rango)
const { data: pedidosRango, error: errPedidosRango } = await supabase
  .from('pedidos')
  .select(
    `
    id,
    estado,
    creado_en,
    items_pedido (
      cantidad,
      producto:productos ( precio )
    )
  `
  )
  .gte('creado_en', isoDesde)
  .lte('creado_en', isoHasta);

if (errPedidosRango) throw errPedidosRango;

const lista = (pedidosRango ?? []) as any[];

const total = lista.length;
const cerrados = lista.filter((p) => p.estado === 'cerrado').length;
const cancelados = lista.filter((p) => p.estado === 'cancelado').length;

// ingresos: sumamos SOLO pedidos cerrados
const ingresos = lista
  .filter((p) => p.estado === 'cerrado')
  .reduce((acc: number, p: any) => {
    const items = p.items_pedido ?? [];
    const subtotal = items.reduce((a: number, it: any) => {
      const precio = it.producto?.precio ?? 0;
      const cant = it.cantidad ?? 0;
      return a + precio * cant;
    }, 0);
    return acc + subtotal;
  }, 0);

setKpiPedidosTotal(total);
setKpiPedidosCerrados(cerrados);
setKpiPedidosCancelados(cancelados);
setKpiIngresos(ingresos);

if (cerrados > 0) {
  setKpiTicketProm(Math.round((ingresos / cerrados) * 100) / 100);
} else {
  setKpiTicketProm(null);
}

      // 1) Pedidos por hora
      const r1 = await supabase
        .from('vw_pedidos_por_hora')
        .select('*')
        .gte('hora', isoDesde)
        .lte('hora', isoHasta)
        .order('hora', { ascending: true });

      if (r1.error) throw r1.error;
      setPedidosHora((r1.data ?? []) as any);

      // 2) Top productos (POR RANGO) usando RPC
      const r2 = await supabase.rpc('fn_top_productos_rango', {
        p_desde: isoDesde,
        p_hasta: isoHasta,
        p_limit: 15,
      });

      if (r2.error) throw r2.error;
      setTopProductos((r2.data ?? []) as any);

      // 3) Tiempos (solo pedidos creados en rango)
      const r3 = await supabase
        .from('vw_tiempos_pedido')
        .select(
          `
          pedido_id,
          mesa_id,
          creado_en,
          estado_actual,
          min_mozo_confirma,
          min_espera_cocina,
          min_preparacion,
          min_total_hasta_listo
        `
        )
        .gte('creado_en', isoDesde)
        .lte('creado_en', isoHasta)
        .order('creado_en', { ascending: false });

      if (r3.error) throw r3.error;
      setTiempos((r3.data ?? []) as any);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? 'Error cargando analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promedio = (vals: (number | null)[]) => {
    const xs = vals.filter(
      (v): v is number => typeof v === 'number' && !Number.isNaN(v)
    );
    if (xs.length === 0) return null;
    const s = xs.reduce((a, b) => a + b, 0);
    return Math.round((s / xs.length) * 100) / 100;
  };

  const promMozo = useMemo(
    () => promedio(tiempos.map((t) => t.min_mozo_confirma)),
    [tiempos]
  );
  const promCola = useMemo(
    () => promedio(tiempos.map((t) => t.min_espera_cocina)),
    [tiempos]
  );
  const promPrep = useMemo(
    () => promedio(tiempos.map((t) => t.min_preparacion)),
    [tiempos]
  );
  const promTotal = useMemo(
    () => promedio(tiempos.map((t) => t.min_total_hasta_listo)),
    [tiempos]
  );

  const outliers = useMemo(() => {
    // pedidos con total >= 30 min (ajustalo como quieras)
    return tiempos
      .filter((t) => (t.min_total_hasta_listo ?? 0) >= 30)
      .sort(
        (a, b) =>
          (b.min_total_hasta_listo ?? 0) - (a.min_total_hasta_listo ?? 0)
      )
      .slice(0, 10);
  }, [tiempos]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-600">
              Descriptivo + diagnóstico (y base lista para predictivo liviano).
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Desde</span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs text-slate-500">Hasta</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white"
              />
            </label>

            <button
              onClick={cargar}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              Actualizar
            </button>
          </div>
        </header>

        {errorMsg && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
            {errorMsg}
          </p>
        )}

        {loading ? (
          <p className="text-slate-600">Cargando analytics…</p>
        ) : (
          <>
            {/* KPIs */}
{/* KPIs */}
<section className="grid gap-3 md:grid-cols-4">
  {/* KPIs gerenciales */}
  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Pedidos totales</div>
    <div className="text-xl font-bold">{kpiPedidosTotal}</div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Pedidos cerrados</div>
    <div className="text-xl font-bold">{kpiPedidosCerrados}</div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Pedidos cancelados</div>
    <div className="text-xl font-bold">{kpiPedidosCancelados}</div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Ingresos (cerrados)</div>
    <div className="text-xl font-bold">
      ${Number(kpiIngresos ?? 0).toFixed(0)}
    </div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3 md:col-span-2">
    <div className="text-xs text-slate-500">Ticket promedio (cerrados)</div>
    <div className="text-xl font-bold">
      {kpiTicketProm == null ? '—' : `$${kpiTicketProm.toFixed(0)}`}
    </div>
    <div className="text-[11px] text-slate-500 mt-1">
      Calculado como ingresos / cantidad de pedidos cerrados
    </div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3 md:col-span-2">
    <div className="text-xs text-slate-500">% cancelación</div>
    <div className="text-xl font-bold">
      {kpiPedidosTotal === 0
        ? '—'
        : `${Math.round((kpiPedidosCancelados / kpiPedidosTotal) * 100)}%`}
    </div>
  </div>

  {/* KPIs operativos (los tuyos) */}
  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Prom. mozo confirma (min)</div>
    <div className="text-xl font-bold">{promMozo ?? '—'}</div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Prom. espera cocina (min)</div>
    <div className="text-xl font-bold">{promCola ?? '—'}</div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Prom. preparación (min)</div>
    <div className="text-xl font-bold">{promPrep ?? '—'}</div>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="text-xs text-slate-500">Prom. total hasta listo (min)</div>
    <div className="text-xl font-bold">{promTotal ?? '—'}</div>
  </div>
</section>


            {/* Pedidos por hora */}
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold text-slate-900 mb-2">
                Pedidos por hora
              </h2>
              {pedidosHora.length === 0 ? (
                <p className="text-sm text-slate-600">Sin datos en el rango.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Hora</th>
                        <th className="py-2">Pedidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosHora.map((r) => (
                        <tr key={r.hora} className="border-t">
                          <td className="py-2 pr-4">
                            {new Date(r.hora).toLocaleString()}
                          </td>
                          <td className="py-2 font-semibold">{r.pedidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Top productos */}
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold text-slate-900 mb-2">
                Ranking de productos más vendidos en el período seleccionado
              </h2>

              {topProductos.length === 0 ? (
                <p className="text-sm text-slate-600">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Producto</th>
                        <th className="py-2 pr-4">Unidades</th>
                        <th className="py-2">Ingresos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductos.map((r) => (
                        <tr key={r.producto_id} className="border-t">
                          <td className="py-2 pr-4 font-medium">
                            {r.producto_nombre}
                          </td>
                          <td className="py-2 pr-4 font-semibold">
                            {r.unidades}
                          </td>
                          <td className="py-2 font-semibold">
                            ${Number(r.ingresos ?? 0).toFixed(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Outliers */}
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold text-slate-900 mb-2">
                Pedidos lentos (outliers ≥ 30 min)
              </h2>
              {outliers.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No hay outliers en el rango.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Pedido</th>
                        <th className="py-2 pr-4">Mesa</th>
                        <th className="py-2 pr-4">Creado</th>
                        <th className="py-2 pr-4">Total (min)</th>
                        <th className="py-2">Etapas (mozo / cola / prep)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outliers.map((t) => (
                        <tr key={t.pedido_id} className="border-t">
                          <td className="py-2 pr-4 font-semibold">
                            #{t.pedido_id}
                          </td>
                          <td className="py-2 pr-4">{t.mesa_id}</td>
                          <td className="py-2 pr-4">
                            {new Date(t.creado_en).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 font-bold">
                            {t.min_total_hasta_listo}
                          </td>
                          <td className="py-2">
                            {(t.min_mozo_confirma ?? '—') +
                              ' / ' +
                              (t.min_espera_cocina ?? '—') +
                              ' / ' +
                              (t.min_preparacion ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
