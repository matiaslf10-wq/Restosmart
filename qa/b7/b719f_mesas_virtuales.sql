-- RESTOSMART B7.19F
-- Creacion idempotente de mesas virtuales por restaurante.
--
-- IMPORTANTE:
-- Este archivo se prepara localmente.
-- NO ejecutar en Supabase sin autorizacion y revision.
--
-- No modifica pedidos historicos ni elimina mesas.
-- El nombre reservado es __RESTOSMART_VIRTUAL__.

BEGIN;

-- Serializa ejecuciones concurrentes de esta migracion.
SELECT pg_advisory_xact_lock(719019, 20261024);

-- Abortar si existen nombres reservados duplicados.
DO $$
BEGIN
  IF EXISTS (
    SELECT restaurant_id
    FROM public.mesas
    WHERE nombre = '__RESTOSMART_VIRTUAL__'
    GROUP BY restaurant_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'B719F: existen mesas virtuales duplicadas';
  END IF;
END;
$$;

-- Impide duplicados futuros del nombre reservado por restaurante.
CREATE UNIQUE INDEX IF NOT EXISTS
  restosmart_mesas_virtuales_por_restaurante_uidx
ON public.mesas (restaurant_id)
WHERE nombre = '__RESTOSMART_VIRTUAL__';

-- Crea las mesas virtuales faltantes.
INSERT INTO public.mesas (restaurant_id, nombre, numero)
SELECT
  r.id,
  '__RESTOSMART_VIRTUAL__',
  NULL
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mesas m
  WHERE m.restaurant_id = r.id
    AND m.nombre = '__RESTOSMART_VIRTUAL__'
);

-- Validacion dentro de la misma transaccion.
-- Cualquier incumplimiento provoca rollback completo.
DO $$
DECLARE
  v_restaurantes bigint;
  v_virtuales bigint;
  v_incompletos bigint;
BEGIN
  SELECT COUNT(*) INTO v_restaurantes
  FROM public.restaurants;

  SELECT COUNT(*) INTO v_virtuales
  FROM public.mesas
  WHERE nombre = '__RESTOSMART_VIRTUAL__';

  SELECT COUNT(*) INTO v_incompletos
  FROM public.restaurants r
  WHERE (
    SELECT COUNT(*)
    FROM public.mesas m
    WHERE m.restaurant_id = r.id
      AND m.nombre = '__RESTOSMART_VIRTUAL__'
  ) <> 1;

  IF v_incompletos <> 0 OR v_virtuales <> v_restaurantes THEN
    RAISE EXCEPTION
      'B719F: integridad fallida. restaurantes=%, virtuales=%, incompletos=%',
      v_restaurantes, v_virtuales, v_incompletos;
  END IF;
END;
$$;

COMMIT;

-- Verificacion posterior, exclusivamente lectura.
SELECT
  r.id AS restaurante_id,
  r.slug,
  COUNT(m.id) FILTER (
    WHERE m.nombre = '__RESTOSMART_VIRTUAL__'
  ) AS mesas_virtuales
FROM public.restaurants r
LEFT JOIN public.mesas m ON m.restaurant_id = r.id
GROUP BY r.id, r.slug
ORDER BY r.id;