-- BORRADOR B5.2. NO APLICAR A PRODUCCION.
-- BORRADOR B5.1: NO EJECUTAR EN PRODUCCION.
-- RestoSmart B5: borrador de migracion. NO aplicar sin revision y autorizacion.
-- Solo la clave service_role puede invocar esta RPC.
CREATE OR REPLACE FUNCTION public.restosmart_create_order_atomic_v1(
  p_pedido jsonb,
  p_items jsonb,
  p_control_stock boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_restaurant bigint;
  v_pedido public.pedidos%ROWTYPE;
  v_item jsonb;
  v_line record;
  v_producto record;
  v_stock record;
  v_count integer := 0;
  v_updates integer := 0;
  v_subtotal numeric := 0;
  v_precio numeric;
BEGIN
  IF p_pedido IS NULL OR jsonb_typeof(p_pedido) <> 'object'
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR p_control_stock IS NULL THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: payload invalido';
  END IF;

  -- B5.1: validar cada linea antes de descontar stock.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR jsonb_typeof(v_item->'producto_id') <> 'number'
       OR jsonb_typeof(v_item->'cantidad') <> 'number'
       OR (v_item->>'producto_id') !~ '^[0-9]+$'
       OR (v_item->>'cantidad') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'ORDER_VALIDATION: formato de item invalido';
    END IF;

    IF (v_item->>'producto_id')::numeric NOT BETWEEN 1 AND 9223372036854775807
       OR (v_item->>'cantidad')::numeric NOT BETWEEN 1 AND 2147483647
    THEN
      RAISE EXCEPTION 'ORDER_VALIDATION: cantidad o producto fuera de rango';
    END IF;
  END LOOP;

  IF jsonb_typeof(p_pedido->'total') <> 'number'
     OR (p_pedido->>'total')::numeric < 0
  THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: total invalido';
  END IF;
  -- B5.2: una solicitud no confirma por si misma un pago virtual.
  -- B7.9: ninguna alta publica puede acreditar pagos.
  IF coalesce(p_pedido->>'forma_pago', '') NOT IN ('efectivo', 'virtual') THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: forma de pago invalida';
  END IF;

  IF coalesce(p_pedido->>'estado_pago', 'pendiente') <> 'pendiente'
     OR coalesce((p_pedido->>'efectivo_aprobado')::boolean, false)
  THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: pago no confirmado';
  END IF;
  v_restaurant := (p_pedido->>'restaurant_id')::bigint;
  IF v_restaurant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants WHERE id = v_restaurant
      AND lower(coalesce(estado, '')) NOT IN ('cerrado', 'pausado')
  ) THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: restaurante no disponible';
  END IF;

  -- B5.1: impedir asociaciones de mesas entre restaurantes.
  -- Los pedidos de mostrador/delivery utilizan la mesa virtual existente.
  -- B7.19D: cualquier mesa, fisica o virtual, pertenece a la sucursal.
  IF NOT EXISTS (
    SELECT 1
    FROM public.mesas
    WHERE id = (p_pedido->>'mesa_id')::bigint
      AND restaurant_id = v_restaurant
  ) THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: mesa fuera del restaurante';
  END IF;
  -- Evitar escribir cualquier registro antes de validar todos los productos.
  -- Orden consistente para reducir posibilidad de deadlocks.
  FOR v_line IN
    SELECT (x.value->>'producto_id')::bigint AS producto_id,
           sum((x.value->>'cantidad')::bigint) AS cantidad
    FROM jsonb_array_elements(p_items) x(value)
    GROUP BY (x.value->>'producto_id')::bigint
    ORDER BY (x.value->>'producto_id')::bigint
  LOOP
    IF v_line.producto_id IS NULL OR v_line.producto_id <= 0
       OR v_line.cantidad IS NULL OR v_line.cantidad <= 0
       OR v_line.cantidad > 2147483647 THEN
      RAISE EXCEPTION 'ORDER_VALIDATION: cantidad o producto invalido';
    END IF;

    SELECT id, disponible, precio INTO v_producto
      FROM public.productos
      WHERE id = v_line.producto_id
      FOR SHARE;
    IF NOT FOUND OR v_producto.disponible IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'ORDER_VALIDATION: producto no disponible';
    END IF;

    -- B5.2: el precio oficial proviene de PostgreSQL.
    v_precio := v_producto.precio;

    IF v_precio IS NULL OR v_precio < 0 THEN
      RAISE EXCEPTION 'ORDER_VALIDATION: precio de producto invalido';
    END IF;

    v_subtotal := v_subtotal + v_precio * v_line.cantidad;
    SELECT visible_en_menu, control_stock, stock_actual, permitir_sin_stock
      INTO v_stock
      FROM public.producto_restaurantes
      WHERE producto_id = v_line.producto_id
        AND restaurant_id = v_restaurant
      FOR UPDATE;
    IF NOT FOUND OR v_stock.visible_en_menu IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'ORDER_VALIDATION: producto fuera del menu';
    END IF;

    -- B7.17: respetar el control solicitado por el servidor,
    -- las capacidades del plan y la configuracion del producto.
    IF p_control_stock
       AND (SELECT lower(coalesce(plan::text, 'esencial'))
              IN ('pro', 'intelligence')
            FROM public.restaurants
            WHERE id = v_restaurant)
       AND v_stock.control_stock IS TRUE
    THEN
      IF NOT v_stock.permitir_sin_stock AND v_stock.stock_actual < v_line.cantidad THEN
        RAISE EXCEPTION 'STOCK_CONFLICT: existencias insuficientes';
      END IF;
      UPDATE public.producto_restaurantes
         SET stock_actual = greatest(0, stock_actual - v_line.cantidad::integer),
             actualizado_en = now()
       WHERE producto_id = v_line.producto_id AND restaurant_id = v_restaurant;
      v_updates := v_updates + 1;
    END IF;
  END LOOP;

  -- B5.2: el total no puede ser alterado por el navegador.
  IF (p_pedido->>'total')::numeric <> v_subtotal THEN
    RAISE EXCEPTION 'ORDER_VALIDATION: total no coincide con precios vigentes';
  END IF;
  -- Las escrituras anteriores siguen dentro de la MISMA transaccion.
  -- Cualquier error posterior revierte todos los descuentos.
  INSERT INTO public.pedidos (
    restaurant_id, mesa_id, estado, total, paga_efectivo, forma_pago,
    origen, tipo_servicio, medio_pago, estado_pago, efectivo_aprobado,
    cliente_nombre, cliente_telefono, notificar_whatsapp, direccion_entrega
  ) VALUES (
    v_restaurant,
    (p_pedido->>'mesa_id')::bigint,
    p_pedido->>'estado',
    (p_pedido->>'total')::numeric,
    (p_pedido->>'forma_pago' = 'efectivo'),
    p_pedido->>'forma_pago',
    p_pedido->>'origen',
    p_pedido->>'tipo_servicio',
    p_pedido->>'forma_pago',
    'pendiente',
    false,
    p_pedido->>'cliente_nombre',
    p_pedido->>'cliente_telefono',
    coalesce((p_pedido->>'notificar_whatsapp')::boolean, false),
    p_pedido->>'direccion_entrega'
  ) RETURNING * INTO v_pedido;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.items_pedido (
      pedido_id, producto_id, cantidad, comentarios, marca_id,
      marca_nombre_snapshot, marca_color_hex_snapshot, marca_logo_url_snapshot
    ) VALUES (
      v_pedido.id,
      (v_item->>'producto_id')::bigint,
      (v_item->>'cantidad')::integer,
      v_item->>'comentarios',
      (v_item->>'marca_id')::uuid,
      v_item->>'marca_nombre_snapshot',
      v_item->>'marca_color_hex_snapshot',
      v_item->>'marca_logo_url_snapshot'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('pedido', to_jsonb(v_pedido),
                            'stock_updates', v_updates,
                            'items_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.restosmart_create_order_atomic_v1(jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restosmart_create_order_atomic_v1(jsonb, jsonb, boolean)
  TO service_role;
