'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import TakeAwayQrCard from '@/components/TakeAwayQrCard';
import {
  formatBusinessModeLabel,
  type BusinessMode,
} from '@/lib/plans';

type RestaurantItem = {
  id: string;
  slug: string;
  nombre_local: string;
  direccion: string;
  telefono: string;
  celular: string;
  email: string;
  horario_atencion: string;
  business_mode: BusinessMode;
  multi_brand: boolean;
};

type RestaurantForm = {
  nombre_local: string;
  slug: string;
  direccion: string;
  telefono: string;
  celular: string;
  email: string;
  horario_atencion: string;
  business_mode: BusinessMode;
  multi_brand: boolean;
};

const EMPTY_FORM: RestaurantForm = {
  nombre_local: '',
  slug: '',
  direccion: '',
  telefono: '',
  celular: '',
  email: '',
  horario_atencion: '',
  business_mode: 'takeaway',
  multi_brand: true,
};

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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildTenantHref(path: string, slug: string) {
  return `${path}?tenant=${encodeURIComponent(slug)}`;
}

function buildPublicOrderHref(slug: string) {
  return `/pedir?restaurant=${encodeURIComponent(slug)}`;
}

export default function AdminRestaurantesPage() {
  const [items, setItems] = useState<RestaurantItem[]>([]);
  const [form, setForm] = useState<RestaurantForm>(EMPTY_FORM);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const demoCount = useMemo(
    () => items.filter((item) => item.slug.startsWith('demo-')).length,
    [items]
  );

  async function cargarRestaurantes() {
    try {
      setCargando(true);
      setError('');

      const res = await fetch('/api/admin/restaurants', {
        method: 'GET',
        cache: 'no-store',
      });

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(raw, 'No se pudieron cargar los restaurantes.')
        );
      }

      setItems((raw?.items as RestaurantItem[]) ?? []);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los restaurantes.'
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarRestaurantes();
  }, []);

  function updateForm<K extends keyof RestaurantForm>(
    key: K,
    value: RestaurantForm[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateName(value: string) {
    setForm((prev) => ({
      ...prev,
      nombre_local: value,
      slug: prev.slug ? prev.slug : slugify(value),
    }));
  }

  async function crearRestaurante(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setGuardando(true);
      setMensaje('');
      setError('');

      const res = await fetch('/api/admin/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(raw, 'No se pudo crear el restaurante.')
        );
      }

      setMensaje(`Restaurante "${form.nombre_local}" creado correctamente.`);
      setForm(EMPTY_FORM);
      await cargarRestaurantes();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'No se pudo crear el restaurante.'
      );
    } finally {
      setGuardando(false);
    }
  }

  function cargarPresetDemo(
  nombre_local: string,
  slug: string,
  direccion: string,
  horario_atencion: string
) {
  setForm({
    nombre_local,
    slug,
    direccion,
    telefono: '',
    celular: '',
    email: '',
    horario_atencion,
    business_mode: 'takeaway',
    multi_brand: true,
  });
}

  return (
    <div className="space-y-6 p-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Restaurantes / sucursales</h1>
          <p className="mt-1 text-sm text-slate-600">
            Creá y prepará locales reales para operar con configuración,
            marcas, productos y QR público propio.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver al panel
          </Link>

          <button
            type="button"
            onClick={() => void cargarRestaurantes()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Actualizar
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Restaurantes cargados</p>
          <p className="mt-1 text-3xl font-bold">{items.length}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Locales demo</p>
          <p className="mt-1 text-3xl font-bold">{demoCount}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Objetivo demo</p>
          <p className="mt-1 text-3xl font-bold">3</p>
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
            <h2 className="text-lg font-semibold">Crear restaurante</h2>
            <p className="mt-1 text-sm text-slate-600">
              Para la demo, creá tres sucursales take away dentro del tenant actual,
con Multimarca activo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                cargarPresetDemo(
                  'RestoSmart Centro',
                  'demo-centro',
                  'Av. Corrientes 1234, CABA',
                  'Lunes a domingo de 11:00 a 23:30'
                )
              }
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Demo Centro
            </button>

            <button
              type="button"
              onClick={() =>
                cargarPresetDemo(
                  'RestoSmart Palermo',
                  'demo-palermo',
                  'Gorriti 4567, Palermo',
                  'Lunes a domingo de 10:00 a 00:00'
                )
              }
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Demo Palermo
            </button>

            <button
              type="button"
              onClick={() =>
                cargarPresetDemo(
                  'RestoSmart Belgrano',
                  'demo-belgrano',
                  'Cabildo 2345, Belgrano',
                  'Lunes a domingo de 11:30 a 23:00'
                )
              }
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Demo Belgrano
            </button>
          </div>
        </div>

        <form onSubmit={crearRestaurante} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Nombre del local</span>
              <input
                type="text"
                value={form.nombre_local}
                onChange={(e) => updateName(e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="RestoSmart Centro"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Slug público</span>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => updateForm('slug', slugify(e.target.value))}
                className="rounded-xl border px-3 py-2"
                placeholder="demo-centro"
              />
              <span className="text-xs text-slate-500">
                El QR público usará /pedir?restaurant={form.slug || 'slug'}
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Dirección</span>
              <input
                type="text"
                value={form.direccion}
                onChange={(e) => updateForm('direccion', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="Av. Corrientes 1234, CABA"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Horario</span>
              <input
                type="text"
                value={form.horario_atencion}
                onChange={(e) =>
                  updateForm('horario_atencion', e.target.value)
                }
                className="rounded-xl border px-3 py-2"
                placeholder="Lun a Dom 11:00 a 23:30"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Teléfono</span>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => updateForm('telefono', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="011-xxxx-xxxx"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Celular</span>
              <input
                type="text"
                value={form.celular}
                onChange={(e) => updateForm('celular', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="54911xxxxxxxx"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
                className="rounded-xl border px-3 py-2"
                placeholder="contacto@restosmart.com"
              />
            </label>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
  El plan se define a nivel tenant/grupo. Los restaurantes heredan las
  funcionalidades y límites del tenant actual.
</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label
              className={`cursor-pointer rounded-2xl border p-4 ${
                form.business_mode === 'restaurant'
                  ? 'border-black bg-slate-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="business_mode"
                className="sr-only"
                checked={form.business_mode === 'restaurant'}
                onChange={() => updateForm('business_mode', 'restaurant')}
              />
              <p className="font-semibold">🍽️ Restaurante</p>
              <p className="mt-1 text-sm text-slate-600">
                Salón, mesas y QR por mesa.
              </p>
            </label>

            <label
              className={`cursor-pointer rounded-2xl border p-4 ${
                form.business_mode === 'takeaway'
                  ? 'border-black bg-slate-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="business_mode"
                className="sr-only"
                checked={form.business_mode === 'takeaway'}
                onChange={() => updateForm('business_mode', 'takeaway')}
              />
              <p className="font-semibold">🛍️ Take Away</p>
              <p className="mt-1 text-sm text-slate-600">
                Pedido por persona, retiro y mostrador.
              </p>
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.multi_brand}
              onChange={(e) => updateForm('multi_brand', e.target.checked)}
            />
            <span className="text-sm font-medium text-fuchsia-900">
  Activar Multimarca para este tenant/grupo
</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {guardando ? 'Creando...' : 'Crear restaurante'}
            </button>

            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Limpiar
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Restaurantes cargados</h2>

        {cargando ? (
          <p className="mt-3 text-sm text-slate-600">Cargando...</p>
        ) : null}

        {!cargando && items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Todavía no hay restaurantes cargados.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {item.nombre_local || item.slug}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">{item.slug}</p>
                </div>

                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
  Sucursal
</span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Modo:</span>{' '}
                  {formatBusinessModeLabel(item.business_mode)}
                </p>

                <p>
                  <span className="font-semibold">Multimarca:</span>{' '}
                  {item.multi_brand ? 'Activo' : 'No activo'}
                </p>

                {item.direccion ? (
                  <p>
                    <span className="font-semibold">Dirección:</span>{' '}
                    {item.direccion}
                  </p>
                ) : null}

                {item.horario_atencion ? (
                  <p>
                    <span className="font-semibold">Horario:</span>{' '}
                    {item.horario_atencion}
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
  <TakeAwayQrCard
    localName={item.nombre_local || item.slug}
    routePath={buildPublicOrderHref(item.slug)}
    title="QR público del restaurante"
    description="Escaneando este QR, el cliente entra al menú público de esta sucursal para hacer un pedido de retiro."
    badgeLabel="QR TAKE AWAY"
  />
</div>

              <div className="mt-4 grid gap-2">
                <Link
                  href={buildTenantHref('/admin/configuracion', item.slug)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Configurar local
                </Link>

                <Link
  href="/admin/marcas"
  className="rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-4 py-2 text-center text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-100"
>
  Gestionar marcas del tenant
</Link>

                <Link
                  href={buildTenantHref('/admin/productos', item.slug)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cargar productos
                </Link>

                <Link
                  href={buildPublicOrderHref(item.slug)}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-amber-600"
                >
                  Probar QR público
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}