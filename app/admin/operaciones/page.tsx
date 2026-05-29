import { redirect } from 'next/navigation';

type OperacionesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined
) {
  if (typeof value === 'string' && value.trim()) {
    params.set(key, value);
  }
}

export default async function OperacionesPage({
  searchParams,
}: OperacionesPageProps) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();

  appendParam(params, 'restaurantId', resolvedSearchParams?.restaurantId);
  appendParam(params, 'restaurant_id', resolvedSearchParams?.restaurant_id);
  appendParam(params, 'tenant', resolvedSearchParams?.tenant);
  appendParam(params, 'tenantSlug', resolvedSearchParams?.tenantSlug);
  appendParam(params, 'slug', resolvedSearchParams?.slug);
  appendParam(params, 'restaurant', resolvedSearchParams?.restaurant);
  appendParam(params, 'restaurantSlug', resolvedSearchParams?.restaurantSlug);

  const query = params.toString();

  redirect(`/admin/analytics${query ? `?${query}` : ''}`);
}