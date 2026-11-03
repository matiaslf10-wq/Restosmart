SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.restosmart_provision_virtual_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.mesas (restaurant_id, nombre, numero)
  VALUES (NEW.id, '__RESTOSMART_VIRTUAL__', NULL)
  ON CONFLICT (restaurant_id) WHERE nombre = '__RESTOSMART_VIRTUAL__'
  DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.restosmart_provision_virtual_table() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restosmart_provision_virtual_table() TO service_role;

CREATE TRIGGER restosmart_restaurant_virtual_table
AFTER INSERT ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.restosmart_provision_virtual_table();

INSERT INTO public.mesas (restaurant_id, nombre, numero)
SELECT r.id, '__RESTOSMART_VIRTUAL__', NULL
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM public.mesas m
  WHERE m.restaurant_id = r.id AND m.nombre = '__RESTOSMART_VIRTUAL__'
)
ON CONFLICT (restaurant_id) WHERE nombre = '__RESTOSMART_VIRTUAL__'
DO NOTHING;
