'use client';

import { useEffect, useState } from 'react';

type LocalConfig = {
  nombre_local: string;
  direccion: string;
  telefono: string;
  celular: string;
  email: string;
  horario_atencion: string;
  google_analytics_id: string;
  google_analytics_property_id: string;
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

export default function AdminConfiguracionPage() {
  const [localForm, setLocalForm] = useState<LocalConfig>(DEFAULT_LOCAL);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryConfig>(DEFAULT_DELIVERY);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        setCargando(true);
        setError('');
        setMensaje('');

        const [localRes, deliveryRes] = await Promise.all([
          fetch('/api/admin/local-config', {
            method: 'GET',
            cache: 'no-store',
          }),
          fetch('/api/admin/delivery-config', {
            method: 'GET',
            cache: 'no-store',
          }),
        ]);

        const localData = await localRes.json().catch(() => null);
        const deliveryData = await deliveryRes.json().catch(() => null);

        if (!activo) return;

        if (!localRes.ok) {
          throw new Error(
            localData?.error || 'No se pudo cargar la configuración del local.'
          );
        }

        if (!deliveryRes.ok) {
          throw new Error(
            deliveryData?.error || 'No se pudo cargar la configuración de delivery.'
          );
        }

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
        });

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

  async function guardarTodo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setGuardando(true);
      setMensaje('');
      setError('');

      const [localRes, deliveryRes] = await Promise.all([
        fetch('/api/admin/local-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localForm),
        }),
        fetch('/api/admin/delivery-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deliveryForm),
        }),
      ]);

      const localData = await localRes.json().catch(() => null);
      const deliveryData = await deliveryRes.json().catch(() => null);

      if (!localRes.ok) {
        throw new Error(
          localData?.error || 'No se pudo guardar la configuración del local.'
        );
      }

      if (!deliveryRes.ok) {
        throw new Error(
          deliveryData?.error || 'No se pudo guardar la configuración de delivery.'
        );
      }

      setMensaje('Configuración general guardada correctamente.');
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
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-semibold">Configuración</h1>
        <p>Cargando configuración...</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Configuración del local</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Acá definís la ficha del negocio, el canal de delivery y las
          integraciones.
        </p>
      </div>

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
          <h2 className="mb-4 text-lg font-medium">Delivery y WhatsApp</h2>

          <div className="grid gap-4 md:grid-cols-2">
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
              <span className="text-sm font-medium">
                Tiempo estimado (min)
              </span>
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
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">Integraciones</h2>

          <div className="grid gap-4 md:grid-cols-2">
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
            Más adelante acá podemos sumar WhatsApp Business, Mercado Pago,
            PedidosYa y Rappi.
          </p>
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
    </main>
  );
}