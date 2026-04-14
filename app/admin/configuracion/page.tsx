'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import TakeAwayQrCard from '@/components/TakeAwayQrCard';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

type PublicOrderingMeta = {
  business_mode_label: string;
  customer_entry_kind: 'restaurant' | 'takeaway';
  customer_entry_strategy:
    | 'table_qr_route'
    | 'separate_public_route_required';
  current_customer_entry_path: string | null;
  planned_customer_entry_path: string | null;
  takeaway_ready_screen_path?: string | null;
  table_qr_enabled: boolean;
  takeaway_enabled: boolean;
};

type AdminSessionPayload = {
  adminId: string;
  email: string;
  iat: number;
  exp: number;
  tenantId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  public_ordering?: PublicOrderingMeta;
  addons?: {
    whatsapp_delivery?: boolean;
  };
  capabilities?: {
    analytics?: boolean;
    delivery?: boolean;
    waiter_mode?: boolean;
  };
  restaurant?: {
    id: string;
    slug: string;
    plan: PlanCode;
    business_mode?: BusinessMode;
  } | null;
};

type LocalConfig = {
  nombre_local: string;
  direccion: string;
  telefono: string;
  celular: string;
  email: string;
  horario_atencion: string;
  google_analytics_id: string;
  google_analytics_property_id: string;
  business_mode: BusinessMode;
};

type LocalConfigResponse = LocalConfig & {
  public_ordering?: PublicOrderingMeta;
};

type LocalConfigSaveResponse = {
  ok: boolean;
  config: LocalConfigResponse;
};

type ApiErrorResponse = {
  error?: string;
};

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

const DEFAULT_LOCAL: LocalConfig = {
  nombre_local: '',
  direccion: '',
  telefono: '',
  celular: '',
  email: '',
  horario_atencion: '',
  google_analytics_id: '',
  google_analytics_property_id: '',
  business_mode: 'restaurant',
};

const DEFAULT_DELIVERY: DeliveryConfig = {
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

const PLAN_CARDS: Array<{
  code: PlanCode;
  shortLabel: string;
  title: string;
  description: string;
}> = [
  {
    code: 'esencial',
    shortLabel: 'Esencial',
    title: 'Venta y operación base',
    description:
      'Menú digital, QR, cocina, operaciones básicas y configuración general para empezar a vender y ordenar el local.',
  },
  {
    code: 'pro',
    shortLabel: 'Pro',
    title: 'Control operativo del local',
    description:
      'Suma gestión operativa ampliada, más control del flujo diario y modo mozo para negocios con salón.',
  },
  {
    code: 'intelligence',
    shortLabel: 'Intelligence',
    title: 'Optimización con datos',
    description:
      'Incluye todo Pro y desbloquea analytics avanzados, KPIs e insights ejecutivos para tomar mejores decisiones.',
  },
];

function getApiErrorMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
  ) {
    return value.error;
  }

  return fallback;
}

function isLocalConfigResponse(value: unknown): value is LocalConfigResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    'business_mode' in value &&
    'nombre_local' in value &&
    'direccion' in value &&
    'telefono' in value &&
    'celular' in value &&
    'email' in value &&
    'horario_atencion' in value &&
    'google_analytics_id' in value &&
    'google_analytics_property_id' in value
  );
}

function isLocalConfigSaveResponse(
  value: unknown
): value is LocalConfigSaveResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    'config' in value &&
    isLocalConfigResponse(value.config)
  );
}

function getPublicOrderingMeta(businessMode: BusinessMode): PublicOrderingMeta {
  if (businessMode === 'takeaway') {
    return {
      business_mode_label: formatBusinessModeLabel(businessMode),
      customer_entry_kind: 'takeaway',
      customer_entry_strategy: 'separate_public_route_required',
      current_customer_entry_path: '/pedir',
      planned_customer_entry_path: null,
      takeaway_ready_screen_path: '/retiro',
      table_qr_enabled: false,
      takeaway_enabled: true,
    };
  }

  return {
    business_mode_label: formatBusinessModeLabel(businessMode),
    customer_entry_kind: 'restaurant',
    customer_entry_strategy: 'table_qr_route',
    current_customer_entry_path: '/mesa/[id]',
    planned_customer_entry_path: '/pedir',
    takeaway_ready_screen_path: '/retiro',
    table_qr_enabled: true,
    takeaway_enabled: true,
  };
}

export default function AdminConfiguracionPage() {
  const [sessionData, setSessionData] = useState<AdminSessionPayload | null>(null);
  const [localForm, setLocalForm] = useState<LocalConfig>(DEFAULT_LOCAL);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryConfig>(DEFAULT_DELIVERY);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>('esencial');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const plan = sessionData?.plan ?? 'esencial';
  const planLabel = formatPlanLabel(plan);
  const addons = sessionData?.addons ?? {};
  const capabilities = sessionData?.capabilities ?? {};
  const deliveryAddonEnabled = !!addons.whatsapp_delivery;
  const analyticsEnabled = !!capabilities.analytics;
  const tenantLabel =
    sessionData?.restaurant?.slug || sessionData?.tenantId || 'default';
  const businessModeLabel = formatBusinessModeLabel(localForm.business_mode);
  const planChanged = selectedPlan !== plan;

  const waiterModeStatus =
    localForm.business_mode === 'takeaway'
      ? 'No aplica'
      : capabilities.waiter_mode
      ? 'Activo'
      : 'Bloqueado';

  const publicOrdering = useMemo(
    () => getPublicOrderingMeta(localForm.business_mode),
    [localForm.business_mode]
  );

  const analyticsHint = useMemo(() => {
    if (analyticsEnabled) {
      return 'Tu plan actual ya incluye analytics avanzados.';
    }

    return 'Podés dejar cargados estos datos ahora, pero los analytics avanzados se aprovechan en Intelligence.';
  }, [analyticsEnabled]);

  const takeawayQrTitle =
    localForm.business_mode === 'takeaway'
      ? 'QR principal de take away'
      : 'QR opcional de take away';

  const takeawayQrDescription =
    localForm.business_mode === 'takeaway'
      ? 'Este es el QR principal del local para que el cliente entre directamente a /pedir y haga su orden de retiro.'
      : 'Aunque el local esté configurado como restaurante, este QR también puede usarse para pedidos de retiro por mostrador desde /pedir.';

  const takeawayQrBadge =
    localForm.business_mode === 'takeaway' ? 'QR PRINCIPAL' : 'QR OPCIONAL';

  async function reloadSession() {
    const sessionRes = await fetch(`/api/admin/session?tenant=${encodeURIComponent(tenantLabel)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const sessionJson = await sessionRes.json().catch(() => null);

    if (!sessionRes.ok) {
      throw new Error(
        getApiErrorMessage(sessionJson, 'No se pudo refrescar la sesión.')
      );
    }

    const session = (sessionJson?.session as AdminSessionPayload | null) ?? null;
    setSessionData(session);
    setSelectedPlan((session?.plan ?? 'esencial') as PlanCode);
  }

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        setCargando(true);
        setError('');
        setMensaje('');

        const sessionRes = await fetch(`/api/admin/session?tenant=${encodeURIComponent(tenantLabel)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const sessionJson = await sessionRes.json().catch(() => null);

        if (!activo) return;

        if (!sessionRes.ok) {
          throw new Error(
            getApiErrorMessage(
              sessionJson,
              'No se pudo cargar la sesión del admin.'
            )
          );
        }

        const session = (sessionJson?.session as AdminSessionPayload | null) ?? null;
        setSessionData(session);
        setSelectedPlan((session?.plan ?? 'esencial') as PlanCode);

        const localRes = await fetch('/api/admin/local-config', {
          method: 'GET',
          cache: 'no-store',
        });

        const localRaw = (await localRes.json().catch(() => null)) as
          | LocalConfigResponse
          | ApiErrorResponse
          | null;

        if (!activo) return;

        if (!localRes.ok) {
          throw new Error(
            getApiErrorMessage(
              localRaw,
              'No se pudo cargar la configuración del local.'
            )
          );
        }

        const localData = isLocalConfigResponse(localRaw) ? localRaw : null;

        const resolvedBusinessMode = normalizeBusinessMode(
          localData?.business_mode ??
            session?.business_mode ??
            session?.restaurant?.business_mode
        );

        setLocalForm({
          nombre_local: localData?.nombre_local ?? '',
          direccion: localData?.direccion ?? '',
          telefono: localData?.telefono ?? '',
          celular: localData?.celular ?? '',
          email: localData?.email ?? '',
          horario_atencion: localData?.horario_atencion ?? '',
          google_analytics_id: localData?.google_analytics_id ?? '',
          google_analytics_property_id:
            localData?.google_analytics_property_id ?? '',
          business_mode: resolvedBusinessMode,
        });

        if (session?.addons?.whatsapp_delivery) {
          const deliveryRes = await fetch('/api/admin/delivery-config', {
            method: 'GET',
            cache: 'no-store',
          });

          const deliveryData = await deliveryRes.json().catch(() => null);

          if (!activo) return;

          if (!deliveryRes.ok) {
            throw new Error(
              getApiErrorMessage(
                deliveryData,
                'No se pudo cargar la configuración de delivery.'
              )
            );
          }

          setDeliveryForm({
            activo: !!deliveryData?.activo,
            whatsapp_numero: deliveryData?.whatsapp_numero ?? '',
            whatsapp_nombre_mostrado:
              deliveryData?.whatsapp_nombre_mostrado ?? '',
            acepta_efectivo:
              deliveryData?.acepta_efectivo === undefined
                ? true
                : !!deliveryData.acepta_efectivo,
            efectivo_requiere_aprobacion:
              deliveryData?.efectivo_requiere_aprobacion === undefined
                ? true
                : !!deliveryData.efectivo_requiere_aprobacion,
            acepta_mercadopago: !!deliveryData?.acepta_mercadopago,
            mensaje_bienvenida:
              deliveryData?.mensaje_bienvenida ??
              DEFAULT_DELIVERY.mensaje_bienvenida,
            tiempo_estimado_min: Number(
              deliveryData?.tiempo_estimado_min ??
                DEFAULT_DELIVERY.tiempo_estimado_min
            ),
            costo_envio: Number(deliveryData?.costo_envio ?? 0),
          });
        } else {
          setDeliveryForm(DEFAULT_DELIVERY);
        }
      } catch (err) {
        console.error(err);
        if (!activo) return;
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la configuración.'
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

  function updateLocal<K extends keyof LocalConfig>(
    key: K,
    value: LocalConfig[K]
  ) {
    setLocalForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateDelivery<K extends keyof DeliveryConfig>(
    key: K,
    value: DeliveryConfig[K]
  ) {
    setDeliveryForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function guardarPlan() {
    if (!planChanged) {
      setMensaje('El plan seleccionado ya es el plan actual.');
      setError('');
      return;
    }

    try {
      setGuardandoPlan(true);
      setMensaje('');
      setError('');

      const res = await fetch(
        `/api/admin/plan?tenant=${encodeURIComponent(tenantLabel)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: selectedPlan,
            tenantSlug: tenantLabel,
            restaurantId: sessionData?.restaurant?.id ?? null,
          }),
        }
      );

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(raw, 'No se pudo actualizar el plan.')
        );
      }

      await reloadSession();

      setMensaje(`Plan actualizado a ${formatPlanLabel(selectedPlan)}.`);
      setError('');
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el plan.'
      );
    } finally {
      setGuardandoPlan(false);
    }
  }

  async function guardarTodo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setGuardando(true);
      setMensaje('');
      setError('');

      const localRes = await fetch('/api/admin/local-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localForm),
      });

      const localRaw = (await localRes.json().catch(() => null)) as
        | LocalConfigSaveResponse
        | ApiErrorResponse
        | null;

      if (!localRes.ok) {
        throw new Error(
          getApiErrorMessage(
            localRaw,
            'No se pudo guardar la configuración del local.'
          )
        );
      }

      const savedLocalConfig = isLocalConfigSaveResponse(localRaw)
        ? localRaw.config
        : null;

      if (savedLocalConfig) {
        setLocalForm({
          nombre_local: savedLocalConfig.nombre_local,
          direccion: savedLocalConfig.direccion,
          telefono: savedLocalConfig.telefono,
          celular: savedLocalConfig.celular,
          email: savedLocalConfig.email,
          horario_atencion: savedLocalConfig.horario_atencion,
          google_analytics_id: savedLocalConfig.google_analytics_id,
          google_analytics_property_id:
            savedLocalConfig.google_analytics_property_id,
          business_mode: normalizeBusinessMode(savedLocalConfig.business_mode),
        });
      }

      if (deliveryAddonEnabled) {
        const deliveryRes = await fetch('/api/admin/delivery-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deliveryForm),
        });

        const deliveryData = await deliveryRes.json().catch(() => null);

        if (!deliveryRes.ok) {
          throw new Error(
            getApiErrorMessage(
              deliveryData,
              'No se pudo guardar la configuración de delivery.'
            )
          );
        }
      }

      const nextBusinessMode = normalizeBusinessMode(
        savedLocalConfig?.business_mode ?? localForm.business_mode
      );

      setMensaje(
        deliveryAddonEnabled
          ? 'Configuración general guardada correctamente.'
          : 'Configuración del local e integraciones guardadas correctamente.'
      );

      setSessionData((prev) =>
        prev
          ? {
              ...prev,
              business_mode: nextBusinessMode,
              restaurant: prev.restaurant
                ? {
                    ...prev.restaurant,
                    business_mode: nextBusinessMode,
                  }
                : prev.restaurant,
              capabilities: {
                ...prev.capabilities,
                waiter_mode:
                  nextBusinessMode === 'restaurant' &&
                  !!prev.capabilities?.waiter_mode,
              },
              public_ordering: getPublicOrderingMeta(nextBusinessMode),
            }
          : prev
      );
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

  if (cargando) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-2xl font-semibold">Configuración</h1>
        <p>Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración del local</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Acá definís la ficha del negocio, su modo de operación, las integraciones
          y, si está activo, el add-on de WhatsApp Delivery.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Plan</p>
          <p className="mt-1 text-xl font-bold">{planLabel}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Tenant</p>
          <p className="mt-1 text-xl font-bold">{tenantLabel}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Modo de negocio
          </p>
          <p className="mt-1 text-xl font-bold">{businessModeLabel}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Modo mozo
          </p>
          <p className="mt-1 text-xl font-bold">{waiterModeStatus}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            WhatsApp Delivery
          </p>
          <p className="mt-1 text-xl font-bold">
            {deliveryAddonEnabled ? 'Activo' : 'No activo'}
          </p>
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

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Plan y funcionalidades</h2>
            <p className="mt-1 text-sm text-neutral-600">
              El cambio se aplica sobre este tenant y actualiza automáticamente
              lo que queda habilitado en el sistema.
            </p>
          </div>

          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Plan actual: {planLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PLAN_CARDS.map((planCard) => {
            const selected = selectedPlan === planCard.code;
            const isCurrent = plan === planCard.code;

            return (
              <button
                key={planCard.code}
                type="button"
                onClick={() => setSelectedPlan(planCard.code)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selected
                    ? 'border-black bg-neutral-50'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{planCard.shortLabel}</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">
                      {planCard.title}
                    </p>
                  </div>

                  {isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      Actual
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                  {planCard.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          El add-on de WhatsApp Delivery sigue siendo independiente del plan y
          se gestiona por separado por restaurante.
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void guardarPlan();
            }}
            disabled={guardandoPlan || !planChanged}
            className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
          >
            {guardandoPlan ? 'Actualizando plan...' : 'Guardar cambio de plan'}
          </button>

          {planChanged ? (
            <span className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Vas a pasar de {planLabel} a {formatPlanLabel(selectedPlan)}.
            </span>
          ) : (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No hay cambios pendientes en el plan.
            </span>
          )}
        </div>
      </section>

      <form onSubmit={guardarTodo} className="grid gap-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Datos del local</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Nombre del local</span>
              <input
                type="text"
                value={localForm.nombre_local}
                onChange={(e) => updateLocal('nombre_local', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="RestoSmart"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Dirección</span>
              <input
                type="text"
                value={localForm.direccion}
                onChange={(e) => updateLocal('direccion', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="Av. Siempre Viva 123"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Teléfono</span>
              <input
                type="text"
                value={localForm.telefono}
                onChange={(e) => updateLocal('telefono', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="011-xxxx-xxxx"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Celular</span>
              <input
                type="text"
                value={localForm.celular}
                onChange={(e) => updateLocal('celular', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="54911xxxxxxxx"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                value={localForm.email}
                onChange={(e) => updateLocal('email', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="contacto@resto.com"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Horario de atención</span>
              <input
                type="text"
                value={localForm.horario_atencion}
                onChange={(e) =>
                  updateLocal('horario_atencion', e.target.value)
                }
                className="rounded-xl border px-3 py-2"
                placeholder="Lun a Dom 12:00 a 23:30"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Modo de operación</h2>
              <p className="mt-1 text-sm text-neutral-600">
                El plan sigue siendo el mismo. Acá solo definís si el negocio
                trabaja con mesas o en modalidad take away.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                localForm.business_mode === 'restaurant'
                  ? 'border-black bg-neutral-50'
                  : 'border-neutral-200 bg-white hover:border-neutral-300'
              }`}
            >
              <input
                type="radio"
                name="business_mode"
                className="sr-only"
                checked={localForm.business_mode === 'restaurant'}
                onChange={() => updateLocal('business_mode', 'restaurant')}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">🍽️ Restaurante</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Flujo orientado a salón, mesas, QR por mesa y operación con mozo
                    cuando el plan lo permita.
                  </p>
                </div>
              </div>
            </label>

            <label
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                localForm.business_mode === 'takeaway'
                  ? 'border-black bg-neutral-50'
                  : 'border-neutral-200 bg-white hover:border-neutral-300'
              }`}
            >
              <input
                type="radio"
                name="business_mode"
                className="sr-only"
                checked={localForm.business_mode === 'takeaway'}
                onChange={() => updateLocal('business_mode', 'takeaway')}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">🛍️ Take Away</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Sin mesas. El pedido se identifica por cliente o número de orden
                    y el retiro se resuelve en mostrador.
                  </p>
                </div>
              </div>
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {localForm.business_mode === 'restaurant' ? (
              <>
                Este negocio quedará configurado para operar con lógica de salón.
                Las pantallas de mesas, mozo y QR se mostrarán según este modo y
                según el plan contratado.
              </>
            ) : (
              <>
                Este negocio quedará configurado en modo take away. La lógica de
                mesas no aplica y la experiencia del cliente entra por una ruta
                pública de pedido, mientras que la pantalla de retiro avisa cuándo
                pasar a buscar la orden.
              </>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Acceso público al cliente</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Vista previa de cómo entra el cliente y qué pantallas públicas
                quedan disponibles según el modo del negocio.
              </p>
            </div>

            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {publicOrdering.business_mode_label}
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estrategia
              </p>
              <p className="mt-2 text-sm text-slate-800">
                {publicOrdering.customer_entry_strategy === 'table_qr_route'
                  ? 'Entrada por QR y ruta de mesa'
                  : 'Ruta pública separada para take away'}
              </p>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-medium">Ingreso principal del cliente:</span>{' '}
                  {publicOrdering.current_customer_entry_path ?? 'Todavía no creada'}
                </p>

                {publicOrdering.planned_customer_entry_path ? (
                  <p>
                    <span className="font-medium">Ruta adicional de take away:</span>{' '}
                    {publicOrdering.planned_customer_entry_path}
                  </p>
                ) : null}

                <p>
                  <span className="font-medium">Pantalla de retiro:</span>{' '}
                  {publicOrdering.takeaway_ready_screen_path ?? 'No aplica'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estado funcional
              </p>

              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                  <span>QR por mesa</span>
                  <span className="font-semibold">
                    {publicOrdering.table_qr_enabled ? 'Sí' : 'No'}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                  <span>Take away</span>
                  <span className="font-semibold">
                    {publicOrdering.takeaway_enabled ? 'Sí' : 'No'}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                  <span>Pantalla pública de retiro</span>
                  <span className="font-semibold">
                    {publicOrdering.takeaway_ready_screen_path ? 'Sí' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {localForm.business_mode === 'restaurant' ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">
                El acceso público actual del cliente funciona por mesa
              </p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-900">
                Hoy el ingreso principal del cliente funciona por <code>/mesa/[id]</code>.
                Además, el flujo opcional de retiro sigue disponible por <code>/pedir</code>{' '}
                y la pantalla pública de retiro por <code>/retiro</code>.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/mesa/1"
                  className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Abrir ejemplo de mesa
                </Link>

                <Link
                  href="/admin/mesas"
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Gestionar mesas y QR
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                El flujo público de take away ya está disponible
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900">
                El cliente puede pedir desde <code>/pedir</code> y la pantalla
                pública para avisar que el pedido está listo queda disponible en{' '}
                <code>/retiro</code>. Esto sirve para un monitor, televisor o tablet
                cerca del mostrador.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/pedir"
                  className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Abrir take away
                </Link>

                <Link
                  href="/retiro"
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  Abrir pantalla de retiro
                </Link>

                <Link
                  href="/inicio"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Ver entorno de prueba
                </Link>
              </div>
            </div>
          )}
        </section>

        {publicOrdering.takeaway_enabled ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">QR público de take away</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Este QR apunta a <code>/pedir</code>. En modo take away es el QR
                  principal del local; en modo restaurante puede usarse como canal
                  opcional de retiro por mostrador.
                </p>
              </div>

              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                {localForm.business_mode === 'takeaway'
                  ? 'Take away principal'
                  : 'Take away opcional'}
              </span>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <TakeAwayQrCard
                localName={localForm.nombre_local || 'RestoSmart'}
                routePath="/pedir"
                title={takeawayQrTitle}
                description={takeawayQrDescription}
                badgeLabel={takeawayQrBadge}
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Uso recomendado
                </p>

                <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
                  <p>
                    <span className="font-medium">Ubicación:</span> pegado en el
                    mostrador, vidriera, caja o mesa de retiro.
                  </p>

                  <p>
                    <span className="font-medium">Ruta del QR:</span> <code>/pedir</code>
                  </p>

                  <p>
                    <span className="font-medium">Pantalla pública complementaria:</span>{' '}
                    <code>/retiro</code>
                  </p>

                  <p>
                    <span className="font-medium">Lógica del pedido:</span> la orden
                    se identifica por nombre de la persona y luego se anuncia en la
                    pantalla de retiro cuando queda lista.
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/pedir"
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Abrir /pedir
                  </Link>

                  <Link
                    href="/retiro"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                  >
                    Abrir /retiro
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Delivery y WhatsApp</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Configuración operativa del canal de delivery.
              </p>
            </div>

            {deliveryAddonEnabled ? (
              <Link
                href="/admin/delivery"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Ir a módulo delivery
              </Link>
            ) : null}
          </div>

          {deliveryAddonEnabled ? (
            <>
              <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                WhatsApp Delivery está activo para este restaurante y se administra
                como add-on separado.
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={deliveryForm.activo}
                    onChange={(e) => updateDelivery('activo', e.target.checked)}
                  />
                  <span>Activar canal de delivery</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={deliveryForm.acepta_mercadopago}
                    onChange={(e) =>
                      updateDelivery('acepta_mercadopago', e.target.checked)
                    }
                  />
                  <span>Aceptar Mercado Pago</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={deliveryForm.acepta_efectivo}
                    onChange={(e) =>
                      updateDelivery('acepta_efectivo', e.target.checked)
                    }
                  />
                  <span>Aceptar efectivo</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={deliveryForm.efectivo_requiere_aprobacion}
                    onChange={(e) =>
                      updateDelivery(
                        'efectivo_requiere_aprobacion',
                        e.target.checked
                      )
                    }
                  />
                  <span>El efectivo requiere aprobación manual</span>
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Número de WhatsApp</span>
                  <input
                    type="text"
                    value={deliveryForm.whatsapp_numero}
                    onChange={(e) =>
                      updateDelivery('whatsapp_numero', e.target.value)
                    }
                    className="rounded-xl border px-3 py-2"
                    placeholder="54911xxxxxxxx"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Nombre visible</span>
                  <input
                    type="text"
                    value={deliveryForm.whatsapp_nombre_mostrado}
                    onChange={(e) =>
                      updateDelivery('whatsapp_nombre_mostrado', e.target.value)
                    }
                    className="rounded-xl border px-3 py-2"
                    placeholder="RestoSmart Delivery"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Tiempo estimado (min)</span>
                  <input
                    type="number"
                    min={0}
                    value={deliveryForm.tiempo_estimado_min}
                    onChange={(e) =>
                      updateDelivery(
                        'tiempo_estimado_min',
                        Number(e.target.value)
                      )
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
                    value={deliveryForm.costo_envio}
                    onChange={(e) =>
                      updateDelivery('costo_envio', Number(e.target.value))
                    }
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
              </div>

              <label className="mt-4 grid gap-2">
                <span className="text-sm font-medium">Mensaje de bienvenida</span>
                <textarea
                  value={deliveryForm.mensaje_bienvenida}
                  onChange={(e) =>
                    updateDelivery('mensaje_bienvenida', e.target.value)
                  }
                  rows={4}
                  className="rounded-xl border px-3 py-2"
                />
              </label>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <p className="font-medium text-blue-900">
                WhatsApp Delivery no está activo
              </p>
              <p className="mt-2 text-sm leading-relaxed text-blue-900">
                Este módulo se contrata aparte por restaurante. No forma parte de
                las funcionalidades comunes de Esencial, Pro ni Intelligence.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="mailto:contacto@restosmart.com?subject=Activar%20WhatsApp%20Delivery"
                  className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Solicitar activación
                </a>

                <Link
                  href="/#precios"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Ver planes
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Integraciones</h2>
              <p className="mt-1 text-sm text-neutral-600">{analyticsHint}</p>
            </div>

            {!analyticsEnabled ? (
              <Link
                href="/#precios"
                className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                Desbloquear analytics
              </Link>
            ) : null}
          </div>

          {!analyticsEnabled ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Tu plan actual no incluye analytics avanzados. Igual podés dejar
              preparada la configuración.
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Google Analytics ID</span>
              <input
                type="text"
                value={localForm.google_analytics_id}
                onChange={(e) =>
                  updateLocal('google_analytics_id', e.target.value)
                }
                className="rounded-xl border px-3 py-2"
                placeholder="G-XXXXXXXXXX"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">
                Google Analytics Property ID
              </span>
              <input
                type="text"
                value={localForm.google_analytics_property_id}
                onChange={(e) =>
                  updateLocal('google_analytics_property_id', e.target.value)
                }
                className="rounded-xl border px-3 py-2"
                placeholder="123456789"
              />
            </label>
          </div>

          <p className="mt-3 text-sm text-neutral-600">
            Más adelante acá podemos sumar Mercado Pago, WhatsApp Business,
            PedidosYa y Rappi.
          </p>
        </section>

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
    </div>
  );
}