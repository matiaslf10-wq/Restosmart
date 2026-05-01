'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type KitchenPrepState = 'pendiente' | 'en_preparacion' | 'listo';
type PrepTarget = 'mostrador' | 'cocina';

type ItemPedido = {
  id: number;
  cantidad: number;
  comentarios: string | null;
  comentarioVisible: string | null;
  prepTarget: PrepTarget;
  kitchenState: KitchenPrepState | null;
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
  forma_pago?: 'efectivo' | 'virtual' | null;
  origen?: string | null;
  tipo_servicio?: string | null;
  medio_pago?: string | null;
  estado_pago?: string | null;
  efectivo_aprobado?: boolean | null;
  pasado_a_caja?: boolean | null;
  items: ItemPedido[];
};

type MesaConCuenta = {
  id: number;
  numero: number | null;
  nombre: string;
  pedidos: Pedido[];
  totalMesa: number;
};

type EstadoMesa = 'libre' | 'en_curso' | 'lista_para_caja';
type FiltroMesas = 'todas' | EstadoMesa;
type FormaPagoMesa = 'ninguna' | 'efectivo' | 'virtual';

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function parseKitchenMeta(comment: string | null | undefined) {
  const raw = String(comment ?? '').trim();

  if (!raw) {
    return {
      prepTarget: 'mostrador' as PrepTarget,
      kitchenState: null as KitchenPrepState | null,
      comentarioVisible: null as string | null,
    };
  }

  const match = raw.match(
    /^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*(.*)$/i
  );

  if (!match) {
    return {
      prepTarget: 'mostrador' as PrepTarget,
      kitchenState: null,
      comentarioVisible: raw,
    };
  }

  const visible = String(match[2] ?? '').trim();

  return {
    prepTarget: 'cocina' as PrepTarget,
    kitchenState: match[1].toLowerCase() as KitchenPrepState,
    comentarioVisible: visible || null,
  };
}

function buildKitchenComment(
  comment: string | null | undefined,
  kitchenState: KitchenPrepState
) {
  const visible = String(comment ?? '').trim();
  return `[[COCINA:${kitchenState}]]${visible ? ` ${visible}` : ''}`;
}

function esPedidoDelivery(
  pedido: Pick<Pedido, 'mesa_id' | 'origen' | 'tipo_servicio'>
) {
  const origen = normalizeText(pedido.origen);
  const tipoServicio = normalizeText(pedido.tipo_servicio);

  return (
    pedido.mesa_id === DELIVERY_MESA_ID ||
    origen === 'delivery' ||
    origen === 'delivery_whatsapp' ||
    origen === 'delivery_manual' ||
    tipoServicio === 'delivery' ||
    tipoServicio === 'envio'
  );
}

function esPedidoTakeaway(
  pedido: Pick<Pedido, 'origen' | 'tipo_servicio'>
) {
  const origen = normalizeText(pedido.origen);
  const tipoServicio = normalizeText(pedido.tipo_servicio);

  return (
    tipoServicio === 'takeaway' ||
    tipoServicio === 'take_away' ||
    tipoServicio === 'pickup' ||
    tipoServicio === 'pick_up' ||
    tipoServicio === 'retiro' ||
    origen === 'takeaway' ||
    origen === 'takeaway_web' ||
    origen === 'takeaway_manual' ||
    origen === 'takeaway_manual_mostrador' ||
    origen === 'pickup' ||
    origen === 'retiro'
  );
}

function shouldShowPedidoInMozo(pedido: Pedido) {
  return !esPedidoDelivery(pedido) && !esPedidoTakeaway(pedido);
}

function esMesaTecnica(mesa: { id: number; numero: number | null }) {
  return mesa.id === DELIVERY_MESA_ID || mesa.numero == null || mesa.numero <= 0;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getMesaDisplayName(
  mesa: MesaConCuenta | { numero: number | null; nombre: string }
) {
  return mesa.numero != null ? `Mesa ${mesa.numero}` : mesa.nombre;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo convertir el archivo.'));
      }
    };

    reader.onerror = () =>
      reject(reader.error ?? new Error('Error leyendo archivo.'));
    reader.readAsDataURL(blob);
  });
}

function buildMesaPosterSvg(params: {
  mesaTitulo: string;
  mesaUrl: string;
  qrDataUrl: string;
}) {
  const { mesaTitulo, mesaUrl, qrDataUrl } = params;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
      <rect width="1200" height="1800" fill="#ffffff"/>
      <rect x="70" y="70" width="1060" height="1660" rx="48" ry="48" fill="#ffffff" stroke="#0f172a" stroke-width="8"/>

      <text x="600" y="190" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#64748b" letter-spacing="6">
        RESTOSMART
      </text>

      <text x="600" y="320" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="110" font-weight="800" fill="#0f172a">
        ${escapeHtml(mesaTitulo)}
      </text>

      <text x="600" y="415" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#334155">
        Escaneá para ver el menú,
      </text>

      <text x="600" y="465" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#334155">
        pedir y pagar desde tu celular
      </text>

      <rect x="220" y="560" width="760" height="760" rx="28" ry="28" fill="#ffffff" stroke="#cbd5e1" stroke-width="6"/>
      <image href="${qrDataUrl}" x="290" y="630" width="620" height="620" preserveAspectRatio="xMidYMid meet"/>

      <text x="600" y="1395" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#111827">
        Apuntá la cámara de tu celular al QR
      </text>

      <text x="600" y="1495" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#64748b" letter-spacing="3">
        LINK DIRECTO
      </text>

      <foreignObject x="180" y="1525" width="840" height="120">
        <div xmlns="http://www.w3.org/1999/xhtml" style="
          font-family: Arial, Helvetica, sans-serif;
          font-size: 26px;
          line-height: 1.35;
          color: #334155;
          text-align: center;
          word-break: break-all;
          padding: 0 10px;
        ">
          ${escapeHtml(mesaUrl)}
        </div>
      </foreignObject>

      <text x="600" y="1690" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#64748b">
        Si el QR no funciona, ingresá al link manualmente
      </text>
    </svg>
  `;
}

export default function MesasMozoPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [canUseWaiterMode, setCanUseWaiterMode] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');
  const [businessMode, setBusinessMode] = useState<BusinessMode>('restaurant');

  const [mesas, setMesas] = useState<MesaConCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pasandoACajaMesaId, setPasandoACajaMesaId] = useState<number | null>(null);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState<number | null>(
    null
  );
  const [actualizandoItemId, setActualizandoItemId] = useState<number | null>(
  null
);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [filtroMesas, setFiltroMesas] = useState<FiltroMesas>('todas');
  const [mesaQrActiva, setMesaQrActiva] = useState<MesaConCuenta | null>(null);

  const [ahora, setAhora] = useState<number>(Date.now());

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      try {
        const res = await fetch('/api/admin/session', {
  method: 'GET',
  cache: 'no-store',
  credentials: 'include',
});

        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }

        const data = await res.json().catch(() => null);
        const session = data?.session;

        if (!active) return;

        if (!session?.adminId) {
          router.replace('/admin/login');
          return;
        }

        const plan = (session?.plan ?? 'esencial') as PlanCode;
        const enabled = !!session?.capabilities?.waiter_mode;
        const resolvedMode = normalizeBusinessMode(
          session?.business_mode ?? session?.restaurant?.business_mode
        );

        setCurrentPlan(plan);
        setCanUseWaiterMode(enabled);
        setBusinessMode(resolvedMode);
      } catch (error) {
        console.error('No se pudo verificar acceso a mozo', error);
        if (!active) return;
        router.replace('/admin/login');
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAhora(Date.now());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const getMesaPublicPath = (mesaId: number | null | undefined) => {
    if (mesaId == null || mesaId <= DELIVERY_MESA_ID) return '';
    return `/mesa/${mesaId}`;
  };

  const getMesaPublicUrl = (mesaId: number | null | undefined) => {
    const path = getMesaPublicPath(mesaId);
    if (!path) return '';
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  };

  const getMesaQrUrl = (mesaId: number | null | undefined) => {
    const mesaUrl = getMesaPublicUrl(mesaId);
    if (!mesaUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
      mesaUrl
    )}`;
  };

  const copiarLinkMesa = async (mesa: MesaConCuenta) => {
    const url = getMesaPublicUrl(mesa.id);
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setMensaje(`Link de ${getMesaDisplayName(mesa)} copiado: ${url}`);
    } catch (error) {
      console.error(error);
      setMensaje(`No se pudo copiar el link de ${getMesaDisplayName(mesa)}.`);
    }
  };

  const abrirMesa = (mesa: MesaConCuenta) => {
    const url = getMesaPublicUrl(mesa.id);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const abrirQrMesa = (mesa: MesaConCuenta) => {
    setMesaQrActiva(mesa);
  };

  const imprimirQrMesa = (mesa: MesaConCuenta) => {
    const mesaUrl = getMesaPublicUrl(mesa.id);
    const qrUrl = getMesaQrUrl(mesa.id);
    const mesaTitulo = getMesaDisplayName(mesa);

    if (!mesaUrl || !qrUrl) return;

    const printWindow = window.open('', '_blank', 'width=900,height=1000');

    if (!printWindow) {
      setMensaje(
        'No se pudo abrir la ventana de impresión. Revisá si el navegador la bloqueó.'
      );
      return;
    }

    const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(mesaTitulo)} - QR</title>
        <style>
          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
          }

          .page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }

          .card {
            width: 100%;
            max-width: 440px;
            border: 3px solid #0f172a;
            border-radius: 24px;
            padding: 28px 24px;
            text-align: center;
          }

          .mesa-kicker {
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.14em;
            color: #475569;
            margin-bottom: 10px;
          }

          .mesa-title {
            font-size: 42px;
            line-height: 1;
            font-weight: 800;
            margin: 0 0 14px;
          }

          .mesa-subtitle {
            font-size: 16px;
            line-height: 1.4;
            color: #334155;
            margin: 0 0 24px;
          }

          .qr-wrap {
            border: 2px solid #cbd5e1;
            border-radius: 18px;
            padding: 18px;
            margin-bottom: 20px;
          }

          .qr {
            width: 320px;
            height: 320px;
            max-width: 100%;
            display: block;
            margin: 0 auto;
          }

          .instruction {
            font-size: 15px;
            font-weight: 700;
            margin-top: 18px;
            color: #111827;
          }

          .url-label {
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
            margin-top: 20px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .url {
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.4;
            word-break: break-all;
            color: #334155;
          }

          .footer {
            margin-top: 18px;
            font-size: 13px;
            color: #64748b;
          }

          @media print {
            @page {
              size: auto;
              margin: 12mm;
            }

            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .page {
              min-height: auto;
              padding: 0;
            }

            .card {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="card">
            <div class="mesa-kicker">RESTOSMART</div>
            <h1 class="mesa-title">${escapeHtml(mesaTitulo)}</h1>
            <p class="mesa-subtitle">
              Escaneá este código para ver el menú,<br />
              pedir y pagar desde tu celular
            </p>

            <div class="qr-wrap">
              <img class="qr" src="${escapeHtml(qrUrl)}" alt="${escapeHtml(
      mesaTitulo
    )} QR" />
            </div>

            <div class="instruction">Apuntá la cámara de tu celular al QR</div>

            <div class="url-label">Link directo</div>
            <div class="url">${escapeHtml(mesaUrl)}</div>

            <div class="footer">
              Si el QR no funciona, ingresá al link manualmente.
            </div>
          </div>
        </div>

        <script>
          window.onload = function () {
            setTimeout(function () {
              window.print();
            }, 350);
          };
        </script>
      </body>
    </html>
  `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  const descargarCartelMesaPng = async (mesa: MesaConCuenta) => {
    try {
      const mesaTitulo = getMesaDisplayName(mesa);
      const mesaUrl = getMesaPublicUrl(mesa.id);
      const qrUrl = getMesaQrUrl(mesa.id);

      if (!mesaUrl || !qrUrl) return;

      const qrResponse = await fetch(qrUrl);

      if (!qrResponse.ok) {
        throw new Error('No se pudo generar el QR para el cartel.');
      }

      const qrBlob = await qrResponse.blob();
      const qrDataUrl = await blobToDataUrl(qrBlob);

      const svgMarkup = buildMesaPosterSvg({
        mesaTitulo,
        mesaUrl,
        qrDataUrl,
      });

      const svgBlob = new Blob([svgMarkup], {
        type: 'image/svg+xml;charset=utf-8',
      });

      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 1800;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('No se pudo inicializar el canvas.');
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            if (!blob) {
              setMensaje(`No se pudo exportar el cartel PNG de ${mesaTitulo}.`);
              URL.revokeObjectURL(svgUrl);
              return;
            }

            const pngUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `${mesaTitulo
              .toLowerCase()
              .replace(/\s+/g, '-')}-cartel.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            URL.revokeObjectURL(pngUrl);
            URL.revokeObjectURL(svgUrl);

            setMensaje(`Se descargó el cartel PNG de ${mesaTitulo}.`);
          }, 'image/png');
        } catch (error) {
          console.error(error);
          URL.revokeObjectURL(svgUrl);
          setMensaje(`No se pudo generar el cartel PNG de ${mesaTitulo}.`);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        setMensaje(`No se pudo renderizar el cartel PNG de ${mesaTitulo}.`);
      };

      img.src = svgUrl;
    } catch (error) {
      console.error(error);
      setMensaje(`No se pudo descargar el cartel PNG de ${getMesaDisplayName(mesa)}.`);
    }
  };

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setMensaje(null);

    try {
      const { data: mesasData, error: errorMesas } = await supabase
        .from('mesas')
        .select('*')
        .order('id', { ascending: true });

      if (errorMesas) {
        console.error('Error al cargar mesas:', errorMesas);
        setMensaje('Error al cargar las mesas.');
        setCargando(false);
        return;
      }

      if (!mesasData) {
        setMesas([]);
        setCargando(false);
        return;
      }

      const { data: pedidosData, error: errorPedidos } = await supabase
        .from('pedidos')
        .select(`
          id,
          mesa_id,
          creado_en,
          estado,
          paga_efectivo,
          forma_pago,
          origen,
          tipo_servicio,
          medio_pago,
          estado_pago,
          efectivo_aprobado,
          pasado_a_caja,
          items_pedido (
            id,
            cantidad,
            comentarios,
            producto:productos ( nombre, precio )
          )
        `)
        .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo']);

      if (errorPedidos) {
        console.error('Error al cargar pedidos:', errorPedidos);
        setMensaje('Error al cargar los pedidos.');
        setCargando(false);
        return;
      }

      const pedidosBase: any[] = pedidosData ?? [];

      const pedidosPorMesa: Record<number, Pedido[]> = {};
      pedidosBase.forEach((p) => {
        const pedido: Pedido = {
          id: p.id,
          mesa_id: p.mesa_id,
          creado_en: p.creado_en,
          estado: p.estado,
          paga_efectivo: p.paga_efectivo,
          forma_pago: p.forma_pago,
          origen: p.origen ?? null,
          tipo_servicio: p.tipo_servicio ?? null,
          medio_pago: p.medio_pago ?? null,
          estado_pago: p.estado_pago ?? null,
          efectivo_aprobado: p.efectivo_aprobado ?? null,
          pasado_a_caja: p.pasado_a_caja ?? false,
          items: ((p.items_pedido ?? []) as any[]).map((item) => {
  const parsed = parseKitchenMeta(item.comentarios);

  return {
    id: item.id,
    cantidad: item.cantidad,
    comentarios: item.comentarios ?? null,
    comentarioVisible: parsed.comentarioVisible,
    prepTarget: parsed.prepTarget,
    kitchenState: parsed.kitchenState,
    producto: item.producto ?? null,
  };
}),
        };

        if (!shouldShowPedidoInMozo(pedido)) {
          return;
        }

        if (!pedidosPorMesa[pedido.mesa_id]) {
          pedidosPorMesa[pedido.mesa_id] = [];
        }

        pedidosPorMesa[pedido.mesa_id].push(pedido);
      });

      const mesasConCuenta: MesaConCuenta[] = (mesasData as any[])
        .map((m) => {
          const pedidosMesa = pedidosPorMesa[m.id] ?? [];

          const totalMesa = pedidosMesa.reduce((acc, p) => {
            const subtotal = p.items.reduce((accItem, item) => {
              const precio = item.producto?.precio ?? 0;
              return accItem + precio * item.cantidad;
            }, 0);
            return acc + subtotal;
          }, 0);

          return {
            id: m.id,
            numero: m.numero ?? null,
            nombre: m.nombre as string,
            pedidos: pedidosMesa,
            totalMesa,
          };
        })
        .filter((mesa) => !esMesaTecnica(mesa))
        .sort((a, b) => (a.numero ?? 999999) - (b.numero ?? 999999));

      setMesas(mesasConCuenta);
    } catch (err) {
      console.error('Error inesperado en cargarDatos:', err);
      setMensaje('Ocurrió un error inesperado al cargar los datos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!canUseWaiterMode || businessMode !== 'restaurant') return;

    void cargarDatos();

    const canalPedidos = supabase
      .channel('mozo-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          const nuevo: any = payload.new ?? null;
          const viejo: any = payload.old ?? null;

          const nuevoPedido = {
            mesa_id: Number(nuevo?.mesa_id ?? DELIVERY_MESA_ID),
            origen: nuevo?.origen ?? null,
            tipo_servicio: nuevo?.tipo_servicio ?? null,
          };

          const esSalonNuevo =
            nuevo != null &&
            !esPedidoDelivery(nuevoPedido) &&
            !esPedidoTakeaway(nuevoPedido) &&
            nuevoPedido.mesa_id !== DELIVERY_MESA_ID;

          if (
            payload.eventType === 'INSERT' &&
            esSalonNuevo &&
            normalizeText(nuevo?.estado) === 'solicitado'
          ) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }

          if (
            payload.eventType === 'UPDATE' &&
            esSalonNuevo &&
            normalizeText(viejo?.estado) !== 'listo' &&
            normalizeText(nuevo?.estado) === 'listo'
          ) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }

          const pagoAntes =
            !!viejo?.paga_efectivo ||
            normalizeText(viejo?.forma_pago) === 'efectivo' ||
            normalizeText(viejo?.medio_pago) === 'efectivo';

          const pagoDespues =
            !!nuevo?.paga_efectivo ||
            normalizeText(nuevo?.forma_pago) === 'efectivo' ||
            normalizeText(nuevo?.medio_pago) === 'efectivo';

          if (esSalonNuevo && !pagoAntes && pagoDespues) {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }

          void cargarDatos();
        }
      )
      .subscribe();

    const canalItems = supabase
      .channel('mozo-items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items_pedido' },
        () => {
          void cargarDatos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalPedidos);
      supabase.removeChannel(canalItems);
    };
  }, [canUseWaiterMode, businessMode, cargarDatos]);

  const calcularEstadoMesa = (mesa: MesaConCuenta): EstadoMesa => {
    if (mesa.pedidos.length === 0) return 'libre';

    const hayEnCurso = mesa.pedidos.some(
      (p) =>
        p.estado === 'solicitado' ||
        p.estado === 'pendiente' ||
        p.estado === 'en_preparacion'
    );

    if (hayEnCurso) return 'en_curso';

    return 'lista_para_caja';
  };

  const formaPagoMesa = (mesa: MesaConCuenta): FormaPagoMesa => {
    if (
      mesa.pedidos.some(
        (p) =>
          p.forma_pago === 'efectivo' ||
          p.paga_efectivo ||
          p.medio_pago === 'efectivo'
      )
    ) {
      return 'efectivo';
    }

    if (
      mesa.pedidos.some(
        (p) => p.forma_pago === 'virtual' || p.medio_pago === 'virtual'
      )
    ) {
      return 'virtual';
    }

    return 'ninguna';
  };

  const mesaFuePasadaACaja = (mesa: MesaConCuenta) => {
    return mesa.pedidos.some((pedido) => !!pedido.pasado_a_caja);
  };

  const clasesMesaPorEstado = (estado: EstadoMesa) => {
    switch (estado) {
      case 'libre':
        return 'border-slate-200 bg-white';
      case 'en_curso':
        return 'border-amber-400 bg-amber-50';
      case 'lista_para_caja':
        return 'border-emerald-500 bg-emerald-50';
    }
  };

  const badgeMesaPorEstado = (estado: EstadoMesa) => {
    switch (estado) {
      case 'libre':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 text-slate-800 px-2 py-[2px] text-[11px] font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-500" />
            Libre
          </span>
        );
      case 'en_curso':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 text-amber-900 px-2 py-[2px] text-[11px] font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            En curso
          </span>
        );
      case 'lista_para_caja':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 text-emerald-900 px-2 py-[2px] text-[11px] font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Lista para pasar a caja
          </span>
        );
    }
  };

  const tiempoMesa = (mesa: MesaConCuenta): string | null => {
    if (mesa.pedidos.length === 0) return null;

    const tiempos = mesa.pedidos.map((p) => new Date(p.creado_en).getTime());
    const primero = Math.min(...tiempos);
    const diffMs = ahora - primero;

    if (diffMs <= 0) return null;

    const diffMin = Math.floor(diffMs / 60000);
    const horas = Math.floor(diffMin / 60);
    const mins = diffMin % 60;

    if (horas === 0) return `Hace ${diffMin} min`;
    return `Hace ${horas} h ${mins} min`;
  };

  const resumenCantidades = (mesa: MesaConCuenta): string => {
    const cantidadPedidos = mesa.pedidos.length;
    const cantidadItems = mesa.pedidos.reduce(
      (acc, p) => acc + p.items.length,
      0
    );

    return `${cantidadPedidos} pedido${
      cantidadPedidos !== 1 ? 's' : ''
    } · ${cantidadItems} ítem${cantidadItems !== 1 ? 's' : ''}`;
  };

  const pasarACaja = async (mesaId: number) => {
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) return;

    if (mesa.pedidos.length === 0) {
      setMensaje(`La ${getMesaDisplayName(mesa)} no tiene pedidos activos.`);
      return;
    }

    if (mesaFuePasadaACaja(mesa)) {
      setMensaje(`${getMesaDisplayName(mesa)} ya fue pasada a caja.`);
      return;
    }

    setPasandoACajaMesaId(mesaId);
    setMensaje(null);

    try {
      const idsPedidos = mesa.pedidos.map((pedido) => pedido.id);

      const { error } = await supabase
        .from('pedidos')
        .update({ pasado_a_caja: true })
        .in('id', idsPedidos);

      if (error) {
        console.error('No se pudo pasar la mesa a caja:', error);
        setMensaje('No se pudo pasar la mesa a caja.');
        return;
      }

      setMensaje(
        `${getMesaDisplayName(mesa)} pasada a caja correctamente. Ya podés resolverla desde mostrador.`
      );
      await cargarDatos();
    } catch (error) {
      console.error('Error inesperado al pasar a caja:', error);
      setMensaje('Ocurrió un error inesperado al pasar la mesa a caja.');
    } finally {
      setPasandoACajaMesaId(null);
    }
  };

  const cancelarPedido = async (pedidoId: number) => {
    const confirmar = window.confirm(
      '¿Cancelar este pedido? Se tomará como pedido arrepentido.'
    );
    if (!confirmar) return;

    setMensaje(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'cancelado' })
      .eq('id', pedidoId);

    if (error) {
      console.error(error);
      setMensaje('No se pudo cancelar el pedido.');
      return;
    }

    setMensaje('Pedido cancelado correctamente.');
    void cargarDatos();
  };

  const actualizarEstadoPedido = async (
    pedidoId: number,
    nuevoEstado: string
  ) => {
    setActualizandoPedidoId(pedidoId);
    setMensaje(null);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id', pedidoId);

    if (error) {
      console.error('Error al actualizar estado del pedido:', error);
      setMensaje('No se pudo actualizar el estado del pedido.');
      setActualizandoPedidoId(null);
      return;
    }

    setActualizandoPedidoId(null);
    void cargarDatos();
  };

  const enviarItemACocina = async (pedidoId: number, item: ItemPedido) => {
  setActualizandoItemId(item.id);
  setMensaje(null);

  const { error: itemError } = await supabase
    .from('items_pedido')
    .update({
      comentarios: buildKitchenComment(item.comentarioVisible, 'pendiente'),
    })
    .eq('id', item.id);

  if (itemError) {
    console.error('No se pudo pasar el ítem a cocina:', itemError);
    setMensaje('No se pudo pasar el ítem a cocina.');
    setActualizandoItemId(null);
    return;
  }

  const { error: pedidoError } = await supabase
    .from('pedidos')
    .update({ estado: 'en_preparacion' })
    .eq('id', pedidoId);

  if (pedidoError) {
    console.error(
      'No se pudo actualizar el pedido al pasar el ítem a cocina:',
      pedidoError
    );
    setMensaje('No se pudo actualizar el pedido al pasar el ítem a cocina.');
    setActualizandoItemId(null);
    return;
  }

  setActualizandoItemId(null);
  setMensaje(`Ítem enviado a cocina en el pedido #${pedidoId}.`);
  await cargarDatos();
};

  const mesasFiltradas = mesas.filter((mesa) => {
    if (filtroMesas === 'todas') return true;
    return calcularEstadoMesa(mesa) === filtroMesas;
  });

  const resumenEstados = mesas.reduce(
    (acc, mesa) => {
      const estado = calcularEstadoMesa(mesa);
      acc[estado]++;
      return acc;
    },
    { libre: 0, en_curso: 0, lista_para_caja: 0 }
  );

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-slate-600">Verificando acceso al modo mozo…</p>
        </div>
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
              Modo mozo
            </h1>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Este negocio está configurado en <strong>modo take away</strong>.
              Por eso la vista de mozo y la gestión de salón por mesas no se usan
              en esta operación.
            </p>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Si querés trabajar con salón, mesas y QR en mesa, podés cambiar el
              modo desde Configuración sin migraciones raras.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/admin/configuracion')}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ir a Configuración
              </button>
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

  if (!canUseWaiterMode) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border border-blue-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
              Disponible desde Pro
            </span>

            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              Modo mozo
            </h1>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Tu plan actual es <strong>{formatPlanLabel(currentPlan)}</strong>.
              La vista de mozo y la gestión de salón asistida están disponibles
              desde <strong>Pro</strong>.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/#precios"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ver planes
              </a>
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

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <audio
        ref={audioRef}
        src="/sounds/mozo.wav"
        preload="auto"
        className="hidden"
      />

      <div className="max-w-6xl mx-auto space-y-4">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                MOZO · SALÓN
              </span>

              <h1 className="mt-3 text-2xl font-bold text-slate-900">
                Mesas – Vista de mozo
              </h1>

              <p className="mt-2 text-sm text-slate-600">
                Vista liviana para atención del salón. Desde acá seguís mesas,
                tomás pedidos y los pasás a caja cuando corresponde.
              </p>

              <p className="mt-1 text-sm text-slate-500">
                El mozo atiende. <strong>Mostrador / caja</strong> cobra y hace el
                cierre real.
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Los links y QR de cliente usan <strong>/mesa/[id]</strong> con el
                ID interno. La identificación visible del salón sigue siendo el
                número de mesa.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void cargarDatos();
                }}
                className="px-3 py-1 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700"
              >
                Actualizar
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-3 text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <span>Libres: {resumenEstados.libre}</span>
          <span>En curso: {resumenEstados.en_curso}</span>
          <span>Listas para pasar a caja: {resumenEstados.lista_para_caja}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { value: 'todas', label: 'Todas' },
            { value: 'libre', label: 'Libres' },
            { value: 'en_curso', label: 'En curso' },
            { value: 'lista_para_caja', label: 'Listas para caja' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroMesas(f.value as FiltroMesas)}
              className={`px-3 py-1 rounded-full text-xs border ${
                filtroMesas === f.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {mensaje && (
          <p className="text-sm text-slate-700 bg-yellow-50 border border-yellow-300 px-3 py-2 rounded-lg">
            {mensaje}
          </p>
        )}

        {cargando && <p>Cargando datos de mesas...</p>}

        {!cargando && mesasFiltradas.length === 0 && (
          <p className="text-slate-600">
            No hay mesas que coincidan con el filtro seleccionado.
          </p>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mesasFiltradas.map((mesa) => {
            const estado = calcularEstadoMesa(mesa);
            const clasesEstado = clasesMesaPorEstado(estado);
            const tiempo = tiempoMesa(mesa);
            const resumen = resumenCantidades(mesa);
            const formaPago = formaPagoMesa(mesa);
            const mesaUrl = getMesaPublicUrl(mesa.id);
            const yaPasadaACaja = mesaFuePasadaACaja(mesa);

            return (
              <article
                key={mesa.id}
                className={`border rounded-xl px-4 py-3 shadow-sm flex flex-col h-full ${clasesEstado}`}
              >
                <header className="flex items-baseline justify-between gap-2 mb-1">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {getMesaDisplayName(mesa)}
                    </h2>
                    <span className="text-[11px] text-slate-500">
                      ID interno {mesa.id}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {badgeMesaPorEstado(estado)}

                    {yaPasadaACaja && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-200 text-violet-900 px-2 py-[2px] text-[11px] font-medium">
                        Caja
                      </span>
                    )}

                    {formaPago === 'efectivo' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 text-emerald-50 px-2 py-[2px] text-[11px] font-medium">
                        💵 Efectivo
                      </span>
                    )}

                    {formaPago === 'virtual' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-700 text-indigo-50 px-2 py-[2px] text-[11px] font-medium">
                        💳 Virtual
                      </span>
                    )}
                  </div>
                </header>

                <div className="text-xs text-slate-600 flex justify-between items-center mb-1">
                  <span>{resumen}</span>
                  {tiempo && <span>{tiempo}</span>}
                </div>

                <div className="mb-3 rounded-lg border border-slate-200 bg-white/80 p-2">
                  <p className="text-[11px] font-medium text-slate-500">
                    Link de la mesa
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-700">
                    {mesaUrl}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrirMesa(mesa)}
                      className="px-2 py-1 rounded-md bg-slate-800 text-white text-[11px] font-medium hover:bg-slate-700"
                    >
                      Abrir mesa
                    </button>

                    <button
                      type="button"
                      onClick={() => copiarLinkMesa(mesa)}
                      className="px-2 py-1 rounded-md bg-white border border-slate-300 text-slate-700 text-[11px] font-medium hover:bg-slate-50"
                    >
                      Copiar link
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirQrMesa(mesa)}
                      className="px-2 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700"
                    >
                      Ver QR
                    </button>

                    <button
                      type="button"
                      onClick={() => imprimirQrMesa(mesa)}
                      className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700"
                    >
                      Imprimir QR
                    </button>

                    <button
                      type="button"
                      onClick={() => descargarCartelMesaPng(mesa)}
                      className="px-2 py-1 rounded-md bg-amber-500 text-white text-[11px] font-medium hover:bg-amber-600"
                    >
                      Descargar cartel PNG
                    </button>
                  </div>
                </div>

                {mesa.pedidos.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Sin pedidos abiertos.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    {mesa.pedidos.map((p) => (
                      <div
                        key={p.id}
                        className="border border-slate-200 rounded-lg px-2 py-1 bg-white/70"
                      >
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="font-semibold">Pedido #{p.id}</span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(p.creado_en).toLocaleTimeString()} ·{' '}
                            {p.estado === 'solicitado'
                              ? 'Esperando confirmación del mozo'
                              : p.estado === 'pendiente'
                              ? 'Pendiente'
                              : p.estado === 'en_preparacion'
                              ? 'En preparación'
                              : 'Listo'}
                          </span>
                        </div>

                        {p.pasado_a_caja ? (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-800 px-2 py-[2px] text-[11px] font-medium">
                              Pasado a caja
                            </span>
                          </div>
                        ) : null}

                        <ul className="mt-1 space-y-[2px]">
                          {p.items.map((item) => (
                            <li key={item.id} className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
  <div className="flex flex-wrap items-start justify-between gap-2">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">
          {item.cantidad} × {item.producto?.nombre ?? '—'}
        </span>

        <span
          className={`rounded-full px-2 py-1 text-[10px] font-medium ${
            item.prepTarget === 'cocina'
              ? item.kitchenState === 'listo'
                ? 'bg-emerald-100 text-emerald-800'
                : item.kitchenState === 'en_preparacion'
                ? 'bg-sky-100 text-sky-800'
                : 'bg-amber-100 text-amber-800'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {item.prepTarget === 'cocina'
            ? item.kitchenState === 'listo'
              ? 'Listo cocina'
              : item.kitchenState === 'en_preparacion'
              ? 'Preparando'
              : 'Enviado a cocina'
            : 'Mostrador'}
        </span>
      </div>

      {item.comentarioVisible ? (
        <span className="mt-1 block text-[11px] text-slate-600">
          Nota: {item.comentarioVisible}
        </span>
      ) : null}
    </div>

    <div className="flex flex-col items-end gap-2">
      <span className="font-semibold text-slate-700">
        {formatMoney((item.producto?.precio ?? 0) * item.cantidad)}
      </span>

      {item.prepTarget === 'mostrador' ? (
        <button
          type="button"
          onClick={() => {
            void enviarItemACocina(p.id, item);
          }}
          disabled={actualizandoItemId === item.id}
          className="rounded-md bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {actualizandoItemId === item.id
            ? 'Pasando...'
            : 'Pasar a cocina'}
        </button>
      ) : null}
    </div>
  </div>
</li>
                          ))}
                        </ul>

                        <div className="mt-2 flex flex-wrap justify-between gap-2 items-center">
                          <div className="flex flex-wrap gap-2">
                            {p.estado === 'solicitado' && (
                              <button
                                onClick={() =>
                                  actualizarEstadoPedido(p.id, 'pendiente')
                                }
                                disabled={actualizandoPedidoId === p.id}
                                className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {actualizandoPedidoId === p.id
                                  ? 'Actualizando...'
                                  : 'Tomar pedido'}
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => cancelarPedido(p.id)}
                            className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-[11px] font-medium hover:bg-rose-200"
                          >
                            Cancelar pedido
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      Total: {formatMoney(mesa.totalMesa)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      El cierre real se hace en caja.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/mozo/mesas/${mesa.id}`)}
                      className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50"
                    >
                      Ver mesa
                    </button>

                    <button
                      onClick={() => {
                        void pasarACaja(mesa.id);
                      }}
                      disabled={
                        mesa.pedidos.length === 0 ||
                        pasandoACajaMesaId === mesa.id ||
                        yaPasadaACaja
                      }
                      className="px-3 py-1 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                    >
                      {pasandoACajaMesaId === mesa.id
                        ? 'Pasando...'
                        : yaPasadaACaja
                        ? 'Ya pasada'
                        : 'Pasar a caja'}
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </section>
      </div>

      {mesaQrActiva ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
                  RESTOSMART
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  {getMesaDisplayName(mesaQrActiva)}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Escaneá para ver el menú, pedir y pagar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMesaQrActiva(null)}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border p-4">
              <img
                src={getMesaQrUrl(mesaQrActiva.id)}
                alt={`QR ${getMesaDisplayName(mesaQrActiva)}`}
                className="mx-auto h-72 w-72 max-w-full"
              />
              <p className="mt-3 text-center text-base font-semibold text-slate-900">
                {getMesaDisplayName(mesaQrActiva)}
              </p>
              <p className="mt-2 break-all text-center text-xs text-slate-600">
                {getMesaPublicUrl(mesaQrActiva.id)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => abrirMesa(mesaQrActiva)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Abrir mesa
              </button>
              <button
                type="button"
                onClick={() => copiarLinkMesa(mesaQrActiva)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copiar link
              </button>
              <button
                type="button"
                onClick={() => imprimirQrMesa(mesaQrActiva)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Imprimir QR
              </button>
              <button
                type="button"
                onClick={() => descargarCartelMesaPng(mesaQrActiva)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Descargar cartel PNG
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}