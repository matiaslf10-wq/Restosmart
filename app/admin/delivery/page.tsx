'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPlanLabel, type PlanCode } from '@/lib/plans';

const DELIVERY_MESA_ID = 0;

type DeliveryConfig = {
  activo: boolean;
  whatsapp_numero: string;
  whatsapp_nombre_mostrado: string;
  acepta_efectivo: boolean;
  efectivo_requiere_aprobacion: boolean;
  acepta_mercadopago: boolean;
  mensaje_bienvenida: string;
  tiempo_estimado_min: number;
  costo_envio: number;
};

type PendingDeliveryOrder = {
  id: number;
  creado_en: string;
  estado: string;
  total: number | string | null;
  origen: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  direccion_entrega: string | null;
  medio_pago: string | null;
  estado_pago: string | null;
  efectivo_aprobado: boolean | null;
  codigo_publico?: string | null;
};

type WhatsAppConnectionStatus =
  | 'pending'
  | 'connected'
  | 'expired'
  | 'error'
  | 'disconnected';

type WhatsAppConnectionForm = {
  tenant_id: string;
  local_id: string;
  add_on_enabled: boolean;
  status: WhatsAppConnectionStatus;
  provider: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string;
  business_account_id: string;
  access_token: string;
  token_expires_at: string;
  webhook_subscribed_at: string;
  app_scope_granted: boolean;
  last_error: string;
};

const DEFAULT_CONFIG: DeliveryConfig = {
  activo: false,
  whatsapp_numero: '',
  whatsapp_nombre_mostrado: '',
  acepta_efectivo: true,
  efectivo_requiere_aprobacion: true,
  acepta_mercadopago: false,
  mensaje_bienvenida:
    'Hola 👋 Gracias por comunicarte con nosotros. Decime qué querés pedir y te ayudamos con tu compra.',
  tiempo_estimado_min: 45,
  costo_envio: 0,
};

const DEFAULT_CONNECTION: WhatsAppConnectionForm = {
  tenant_id: 'default',
  local_id: '',
  add_on_enabled: false,
  status: 'pending',
  provider: 'meta_cloud',
  waba_id: '',
  phone_number_id: '',
  display_phone_number: '',
  business_account_id: '',
  access_token: '',
  token_expires_at: '',
  webhook_subscribed_at: '',
  app_scope_granted: false,
  last_error: '',
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');

  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function getStatusLabel(status: WhatsAppConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'Conectado';
    case 'expired':
      return 'Vencido';
    case 'error':
      return 'Con error';
    case 'disconnected':
      return 'Desconectado';
    case 'pending':
    default:
      return 'Pendiente';
  }
}

function getStatusClasses(status: WhatsAppConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'expired':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'error':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'disconnected':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'pending':
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200';
  }
}

function getTokenHealth(tokenExpiresAt: string) {
  if (!tokenExpiresAt) {
    return {
      tone: 'neutral' as const,
      text: 'Sin vencimiento cargado',
    };
  }

  const now = Date.now();
  const expiresAt = new Date(tokenExpiresAt).getTime();

  if (Number.isNaN(expiresAt)) {
    return {
      tone: 'danger' as const,
      text: 'Fecha de vencimiento inválida',
    };
  }

  const diffDays = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

  if (expiresAt <= now) {
    return {
      tone: 'danger' as const,
      text: 'Token vencido',
    };
  }

  if (diffDays <= 7) {
    return {
      tone: 'warn' as const,
      text: `Token por vencer (${diffDays} día/s)`,
    };
  }

  return {
    tone: 'ok' as const,
    text: `Token vigente (${diffDays} día/s restantes)`,
  };
}

export default function AdminDeliveryPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanCode>('esencial');

  const [form, setForm] = useState<DeliveryConfig>(DEFAULT_CONFIG);
  const [connectionForm, setConnectionForm] =
    useState<WhatsAppConnectionForm>(DEFAULT_CONNECTION);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const [loadingConnection, setLoadingConnection] = useState(true);
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');

  const [pendingOrders, setPendingOrders] = useState<PendingDeliveryOrder[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [pendingError, setPendingError] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<number | null>(null);

  const tokenHealth = useMemo(
    () => getTokenHealth(connectionForm.token_expires_at),
    [connectionForm.token_expires_at]
  );

  async function cargarConfiguracion() {
    try {
      setCargando(true);
      setError('');
      setMensaje('');

      const res = await fetch('/api/admin/delivery-config', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || 'No se pudo cargar la configuración de delivery.'
        );
      }

      setForm({
        activo: !!data.activo,
        whatsapp_numero: data.whatsapp_numero ?? '',
        whatsapp_nombre_mostrado: data.whatsapp_nombre_mostrado ?? '',
        acepta_efectivo:
          data.acepta_efectivo === undefined ? true : !!data.acepta_efectivo,
        efectivo_requiere_aprobacion:
          data.efectivo_requiere_aprobacion === undefined
            ? true
            : !!data.efectivo_requiere_aprobacion,
        acepta_mercadopago: !!data.acepta_mercadopago,
        mensaje_bienvenida:
          data.mensaje_bienvenida ?? DEFAULT_CONFIG.mensaje_bienvenida,
        tiempo_estimado_min: Number(
          data.tiempo_estimado_min ?? DEFAULT_CONFIG.tiempo_estimado_min
        ),
        costo_envio: Number(data.costo_envio ?? 0),
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la configuración de delivery.'
      );
    } finally {
      setCargando(false);
    }
  }

  async function cargarConexionWhatsapp() {
    try {
      setLoadingConnection(true);
      setConnectionError('');
      setConnectionMessage('');

      const res = await fetch('/api/admin/whatsapp-connection', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || 'No se pudo cargar la conexión de WhatsApp.'
        );
      }

      const connection = data?.connection;

      if (!connection) {
        setConnectionForm((prev) => ({
          ...DEFAULT_CONNECTION,
          add_on_enabled: true,
        }));
        return;
      }

      setConnectionForm({
        tenant_id: connection.tenant_id ?? 'default',
        local_id: connection.local_id ?? '',
        add_on_enabled: !!connection.add_on_enabled,
        status: (connection.status ?? 'pending') as WhatsAppConnectionStatus,
        provider: connection.provider ?? 'meta_cloud',
        waba_id: connection.waba_id ?? '',
        phone_number_id: connection.phone_number_id ?? '',
        display_phone_number: connection.display_phone_number ?? '',
        business_account_id: connection.business_account_id ?? '',
        access_token: connection.access_token ?? '',
        token_expires_at: formatDateTimeLocalInput(connection.token_expires_at),
        webhook_subscribed_at: formatDateTimeLocalInput(
          connection.webhook_subscribed_at
        ),
        app_scope_granted: !!connection.app_scope_granted,
        last_error: connection.last_error ?? '',
      });
    } catch (err) {
      console.error(err);
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la conexión de WhatsApp.'
      );
    } finally {
      setLoadingConnection(false);
    }
  }

  async function reloadPendingOrders() {
    try {
      setLoadingPending(true);
      setPendingError('');

      const res = await fetch('/api/admin/delivery-pedidos-pendientes', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || 'No se pudieron actualizar los pedidos pendientes.'
        );
      }

      setPendingOrders(Array.isArray(data?.pedidos) ? data.pedidos : []);
    } catch (err) {
      console.error(err);
      setPendingError(
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar los pedidos pendientes.'
      );
    } finally {
      setLoadingPending(false);
    }
  }

  useEffect(() => {
    let activo = true;

    async function bootstrap() {
      try {
        const sessionRes = await fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!sessionRes.ok) {
          router.replace('/admin/login');
          return;
        }

        const sessionData = await sessionRes.json().catch(() => null);
        const session = sessionData?.session;

        if (!activo) return;

        const plan = (session?.plan ?? 'esencial') as PlanCode;
        const enabled = !!session?.capabilities?.delivery;

        setCurrentPlan(plan);
        setDeliveryEnabled(enabled);

        if (!enabled) {
          return;
        }

        setConnectionForm((prev) => ({
          ...prev,
          add_on_enabled: true,
        }));

        await Promise.all([
          cargarConfiguracion(),
          cargarConexionWhatsapp(),
          reloadPendingOrders(),
        ]);
      } catch (err) {
        console.error(err);
        if (!activo) return;
        setDeliveryEnabled(false);
      } finally {
        if (activo) {
          setCheckingAccess(false);
        }
      }
    }

    bootstrap();

    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function updateField<K extends keyof DeliveryConfig>(
    key: K,
    value: DeliveryConfig[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateConnectionField<K extends keyof WhatsAppConnectionForm>(
    key: K,
    value: WhatsAppConnectionForm[K]
  ) {
    setConnectionForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setGuardando(true);
      setMensaje('');
      setError('');

      const res = await fetch('/api/admin/delivery-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo guardar la configuración.');
      }

      setMensaje('Configuración de delivery guardada correctamente.');
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al guardar la configuración.'
      );
    } finally {
      setGuardando(false);
    }
  }

  async function guardarConexionWhatsapp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSavingConnection(true);
      setConnectionMessage('');
      setConnectionError('');

      const res = await fetch('/api/admin/whatsapp-connection', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...connectionForm,
          add_on_enabled: true,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || 'No se pudo guardar la conexión de WhatsApp.'
        );
      }

      const connection = data?.connection;

      if (connection) {
        setConnectionForm((prev) => ({
          ...prev,
          tenant_id: connection.tenant_id ?? prev.tenant_id,
          local_id: connection.local_id ?? '',
          add_on_enabled: true,
          status: (connection.status ?? prev.status) as WhatsAppConnectionStatus,
          provider: connection.provider ?? prev.provider,
          waba_id: connection.waba_id ?? '',
          phone_number_id: connection.phone_number_id ?? '',
          display_phone_number: connection.display_phone_number ?? '',
          business_account_id: connection.business_account_id ?? '',
          access_token: connection.access_token ?? '',
          token_expires_at: formatDateTimeLocalInput(connection.token_expires_at),
          webhook_subscribed_at: formatDateTimeLocalInput(
            connection.webhook_subscribed_at
          ),
          app_scope_granted: !!connection.app_scope_granted,
          last_error: connection.last_error ?? '',
        }));
      }

      setConnectionMessage('Conexión técnica de WhatsApp guardada correctamente.');
    } catch (err) {
      console.error(err);
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la conexión de WhatsApp.'
      );
    } finally {
      setSavingConnection(false);
    }
  }

  async function cambiarEstadoEfectivo(
    pedidoId: number,
    accion: 'aprobar' | 'rechazar'
  ) {
    try {
      setProcessingOrderId(pedidoId);
      setPendingError('');

      const res = await fetch(
        `/api/delivery/pedidos/${pedidoId}/estado-efectivo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ accion }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || 'No se pudo actualizar el estado del pedido.'
        );
      }

      await reloadPendingOrders();
    } catch (err) {
      console.error(err);
      setPendingError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el estado del pedido.'
      );
    } finally {
      setProcessingOrderId(null);
    }
  }

  if (checkingAccess) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-semibold">Delivery</h1>
        <p>Verificando acceso al add-on…</p>
      </main>
    );
  }

  if (!deliveryEnabled) {
    return (
      <main className="p-6">
        <div className="max-w-4xl">
          <div className="rounded-3xl border border-violet-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 border border-violet-200">
              Add-on opcional
            </span>

            <h1 className="mt-4 text-3xl font-bold text-slate-900">
              WhatsApp Delivery
            </h1>

            <p className="mt-3 text-slate-600 leading-relaxed">
              Este módulo no forma parte de las funcionalidades comunes de
              Esencial, Pro o Intelligence. Se activa aparte por restaurante.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">
                  Estado actual del restaurante
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  Plan: <strong>{formatPlanLabel(currentPlan)}</strong>
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  WhatsApp Delivery: <strong>No activo</strong>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">Qué incluye</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li>• Chatbot de pedidos por WhatsApp</li>
                  <li>• Configuración de cobro y operación</li>
                  <li>• Envío del pedido a la operación</li>
                  <li>• Conexión técnica con Meta</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="mailto:contacto@restosmart.com?subject=Activar%20WhatsApp%20Delivery"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Solicitar activación
              </a>
              <button
                onClick={() => router.push('/admin')}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Volver al dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (cargando) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-semibold">Delivery</h1>
        <p>Cargando configuración...</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Configuración de delivery</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Desde acá podés definir el comportamiento operativo del canal de delivery.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p className="font-medium">WhatsApp Delivery es un add-on separado</p>
        <p className="mt-1">
          Este canal no forma parte de las funcionalidades comunes de los planes
          Esencial, Pro o Intelligence. Se activa de forma opcional por restaurante.
        </p>
      </div>

      <section className="mb-8 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">
              Conexión técnica de WhatsApp Delivery
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Por ahora esta sección permite cargar manualmente la conexión técnica
              del restaurante. Después la reemplazamos por el onboarding con Meta.
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
              connectionForm.status
            )}`}
          >
            {getStatusLabel(connectionForm.status)}
          </span>
        </div>

        {loadingConnection ? (
          <p className="text-sm text-neutral-600">Cargando conexión técnica...</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  Tenant actual
                </p>
                <p className="mt-1 font-medium">{connectionForm.tenant_id}</p>
              </div>

              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  Add-on
                </p>
                <p className="mt-1 font-medium">Activo</p>
              </div>

              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  Salud del token
                </p>
                <p className="mt-1 font-medium">{tokenHealth.text}</p>
              </div>
            </div>

            {connectionForm.last_error ? (
              <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                <span className="font-medium">Último error:</span>{' '}
                {connectionForm.last_error}
              </div>
            ) : null}

            {connectionError ? (
              <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                {connectionError}
              </div>
            ) : null}

            {connectionMessage ? (
              <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                {connectionMessage}
              </div>
            ) : null}

            <form onSubmit={guardarConexionWhatsapp} className="grid gap-6">
              <div className="grid gap-3 md:grid-cols-1">
                <label className="flex items-center gap-3 rounded-xl border p-3">
                  <input
                    type="checkbox"
                    checked={connectionForm.app_scope_granted}
                    onChange={(e) =>
                      updateConnectionField('app_scope_granted', e.target.checked)
                    }
                  />
                  <span>Permisos de app otorgados</span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Estado de conexión</span>
                  <select
                    value={connectionForm.status}
                    onChange={(e) =>
                      updateConnectionField(
                        'status',
                        e.target.value as WhatsAppConnectionStatus
                      )
                    }
                    className="rounded-xl border px-3 py-2"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="connected">Conectado</option>
                    <option value="expired">Vencido</option>
                    <option value="error">Con error</option>
                    <option value="disconnected">Desconectado</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Provider</span>
                  <input
                    type="text"
                    value={connectionForm.provider}
                    onChange={(e) =>
                      updateConnectionField('provider', e.target.value)
                    }
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Local ID</span>
                  <input
                    type="text"
                    value={connectionForm.local_id}
                    onChange={(e) =>
                      updateConnectionField('local_id', e.target.value)
                    }
                    placeholder="Opcional"
                    className="rounded-xl border px-3 py-2"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Display phone number</span>
                  <input
                    type="text"
                    value={connectionForm.display_phone_number}
                    onChange={(e) =>
                      updateConnectionField('display_phone_number', e.target.value)
                    }
                    placeholder="Ej. 54 11 1234 5678"
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Phone Number ID</span>
                  <input
                    type="text"
                    value={connectionForm.phone_number_id}
                    onChange={(e) =>
                      updateConnectionField('phone_number_id', e.target.value)
                    }
                    placeholder="ID técnico de Meta"
                    className="rounded-xl border px-3 py-2"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">WABA ID</span>
                  <input
                    type="text"
                    value={connectionForm.waba_id}
                    onChange={(e) =>
                      updateConnectionField('waba_id', e.target.value)
                    }
                    placeholder="WhatsApp Business Account ID"
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Business Account ID</span>
                  <input
                    type="text"
                    value={connectionForm.business_account_id}
                    onChange={(e) =>
                      updateConnectionField(
                        'business_account_id',
                        e.target.value
                      )
                    }
                    placeholder="Business Portfolio / Account ID"
                    className="rounded-xl border px-3 py-2"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Webhook subscribed at</span>
                  <input
                    type="datetime-local"
                    value={connectionForm.webhook_subscribed_at}
                    onChange={(e) =>
                      updateConnectionField(
                        'webhook_subscribed_at',
                        e.target.value
                      )
                    }
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Token expires at</span>
                  <input
                    type="datetime-local"
                    value={connectionForm.token_expires_at}
                    onChange={(e) =>
                      updateConnectionField('token_expires_at', e.target.value)
                    }
                    className="rounded-xl border px-3 py-2"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Último error</span>
                  <input
                    type="text"
                    value={connectionForm.last_error}
                    onChange={(e) =>
                      updateConnectionField('last_error', e.target.value)
                    }
                    placeholder="Opcional"
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium">Access token</span>
                <input
                  type="password"
                  value={connectionForm.access_token}
                  onChange={(e) =>
                    updateConnectionField('access_token', e.target.value)
                  }
                  placeholder="Pegá el token técnico de Meta"
                  className="rounded-xl border px-3 py-2"
                />
              </label>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingConnection}
                  className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
                >
                  {savingConnection
                    ? 'Guardando conexión...'
                    : 'Guardar conexión técnica'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-medium">Mesa técnica reservada para delivery</p>
        <p className="mt-1">
          Los pedidos de delivery deben usar la mesa #{DELIVERY_MESA_ID}. Esa
          mesa queda reservada para este canal y no ocupa mesas físicas del
          salón ni aparece en los QR de mesas.
        </p>
      </div>

      <form onSubmit={guardar} className="grid gap-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Estado general</h2>

          <label className="mb-4 flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => updateField('activo', e.target.checked)}
            />
            <span>Activar canal de delivery</span>
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">WhatsApp</h2>

          <p className="mb-4 text-sm text-neutral-600">
            Esta sección sigue manejando la operación del canal: mensaje de
            bienvenida, número visible, medios de pago y tiempos.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Número de WhatsApp</span>
              <input
                type="text"
                value={form.whatsapp_numero}
                onChange={(e) =>
                  updateField('whatsapp_numero', e.target.value)
                }
                placeholder="54911XXXXXXXX"
                className="rounded-xl border px-3 py-2"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Nombre visible</span>
              <input
                type="text"
                value={form.whatsapp_nombre_mostrado}
                onChange={(e) =>
                  updateField('whatsapp_nombre_mostrado', e.target.value)
                }
                placeholder="RestoSmart Delivery"
                className="rounded-xl border px-3 py-2"
              />
            </label>
          </div>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-medium">Mensaje de bienvenida</span>
            <textarea
              value={form.mensaje_bienvenida}
              onChange={(e) =>
                updateField('mensaje_bienvenida', e.target.value)
              }
              rows={4}
              className="rounded-xl border px-3 py-2"
            />
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Pago</h2>

          <div className="grid gap-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.acepta_efectivo}
                onChange={(e) =>
                  updateField('acepta_efectivo', e.target.checked)
                }
              />
              <span>Aceptar efectivo</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.efectivo_requiere_aprobacion}
                onChange={(e) =>
                  updateField(
                    'efectivo_requiere_aprobacion',
                    e.target.checked
                  )
                }
              />
              <span>El efectivo requiere aprobación manual de admin o mozo</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.acepta_mercadopago}
                onChange={(e) =>
                  updateField('acepta_mercadopago', e.target.checked)
                }
              />
              <span>Aceptar Mercado Pago</span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Operación</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">
                Tiempo estimado de entrega (min)
              </span>
              <input
                type="number"
                min={0}
                value={form.tiempo_estimado_min}
                onChange={(e) =>
                  updateField('tiempo_estimado_min', Number(e.target.value))
                }
                className="rounded-xl border px-3 py-2"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Costo de envío</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.costo_envio}
                onChange={(e) =>
                  updateField('costo_envio', Number(e.target.value))
                }
                className="rounded-xl border px-3 py-2"
              />
            </label>
          </div>
        </section>

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

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
          >
            {guardando ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">
              Pedidos en efectivo pendientes de aprobación
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Cuando apruebes un pedido, ya puede entrar a cocina como pedido
              pendiente.
            </p>
          </div>

          <button
            type="button"
            onClick={reloadPendingOrders}
            disabled={loadingPending}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loadingPending ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {pendingError ? (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {pendingError}
          </div>
        ) : null}

        {loadingPending ? (
          <p className="text-sm text-neutral-600">Cargando pedidos pendientes...</p>
        ) : pendingOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-neutral-600">
            No hay pedidos delivery en efectivo pendientes de aprobación.
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingOrders.map((pedido) => {
              const isProcessing = processingOrderId === pedido.id;

              return (
                <article
                  key={pedido.id}
                  className="rounded-2xl border p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800">
                          Pendiente efectivo
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {pedido.codigo_publico || `Pedido #${pedido.id}`}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold">
                        {pedido.cliente_nombre || 'Cliente sin nombre'}
                      </h3>

                      <p className="text-sm text-neutral-600">
                        {formatDate(pedido.creado_en)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-neutral-500">Total</p>
                      <p className="text-lg font-semibold">
                        {formatMoney(pedido.total)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm">
                    <p>
                      <span className="font-medium">Teléfono:</span>{' '}
                      {pedido.cliente_telefono || 'Sin dato'}
                    </p>
                    <p>
                      <span className="font-medium">Dirección:</span>{' '}
                      {pedido.direccion_entrega || 'Sin dirección'}
                    </p>
                    <p>
                      <span className="font-medium">Origen:</span>{' '}
                      {pedido.origen || 'Sin origen'}
                    </p>
                    <p>
                      <span className="font-medium">Estado:</span> {pedido.estado}
                    </p>
                    <p>
                      <span className="font-medium">Estado de pago:</span>{' '}
                      {pedido.estado_pago || 'Sin dato'}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => cambiarEstadoEfectivo(pedido.id, 'aprobar')}
                      disabled={isProcessing}
                      className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {isProcessing ? 'Procesando...' : 'Aprobar efectivo'}
                    </button>

                    <button
                      type="button"
                      onClick={() => cambiarEstadoEfectivo(pedido.id, 'rechazar')}
                      disabled={isProcessing}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {isProcessing ? 'Procesando...' : 'Rechazar pedido'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}