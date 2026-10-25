BEGIN;
-- Ejecutar con psql -X -v ON_ERROR_STOP=1; exclusivamente en QA local inactiva.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '90s';

DO $pre$
DECLARE s text; t text; c text; spec text[];
BEGIN
 IF current_database() <> 'restosmart_qa' THEN RAISE EXCEPTION 'B746A: base incorrecta'; END IF;
 IF inet_server_addr() IS NOT NULL AND NOT (inet_server_addr() <<= inet '127.0.0.0/8' OR inet_server_addr() = inet '::1') THEN
  RAISE EXCEPTION 'B746A: servidor no loopback';
 END IF;
 IF current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999 THEN
  RAISE EXCEPTION 'B746A: requiere PostgreSQL 16';
 END IF;
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'B746A: ejecutar como superusuario local de laboratorio (sin alterar roles)';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtenabled <> 'D') THEN
  RAISE EXCEPTION 'B746A: event triggers habilitados requieren revision';
 END IF;
 IF to_regnamespace('b746a_lab') IS NOT NULL THEN RAISE EXCEPTION 'B746A: schema auxiliar ocupado'; END IF;
 FOREACH s IN ARRAY ARRAY[
 'public.restosmart_create_order_atomic_v1(jsonb,jsonb,boolean)',
 'public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text)',
 'public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text)',
 'public.restosmart_collection_config_v1(text,bigint,text,jsonb,text)',
 'public.b724_order_guard()','public.b724_order_snapshot()','public.b724_item_guard()'] LOOP
  IF to_regprocedure(s) IS NULL THEN RAISE EXCEPTION 'B746A: falta %',s; END IF;
 END LOOP;
 -- Columnas deducidas de B5.2/B724/B744D; no se agregan columnas al producto.
 FOREACH s IN ARRAY ARRAY[
 'restaurants:id,slug,plan,estado,owner_tenant_id',
 'mesas:id,nombre,numero,restaurant_id',
 'productos:id,nombre,precio,disponible',
 'producto_restaurantes:id,producto_id,restaurant_id,visible_en_menu,control_stock,stock_actual,permitir_sin_stock,actualizado_en',
 'pedidos:id,restaurant_id,mesa_id,estado,total,paga_efectivo,forma_pago,origen,tipo_servicio,medio_pago,estado_pago,efectivo_aprobado,cliente_nombre,cliente_telefono,notificar_whatsapp,direccion_entrega,moneda_cobro',
 'items_pedido:id,pedido_id,producto_id,cantidad,comentarios,marca_id,marca_nombre_snapshot,marca_color_hex_snapshot,marca_logo_url_snapshot',
 'order_collection_configs:tenant_id,scope,config,operator,updated_at',
 'order_collections:order_id,tenant_id,restaurant_id,token,method,require_payment,amount,currency,state,created_at,updated_at',
 'order_collection_events:id,tenant_id,restaurant_id,order_id,action,operator,note,created_at'] LOOP
  spec := string_to_array(s,':'); t := spec[1];
  IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'B746A: falta tabla %',t; END IF;
  FOREACH c IN ARRAY string_to_array(spec[2],',') LOOP
   IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid=to_regclass('public.'||t) AND attname=c AND attnum>0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'B746A: columna QA ausente %.%; adaptar fixture, no producto',t,c;
   END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND
   ((tgrelid='public.pedidos'::regclass AND tgname IN ('b724_order_guard','b724_order_snapshot')) OR
    (tgrelid='public.items_pedido'::regclass AND tgname='b724_item_guard'))) <> 3 THEN
  RAISE EXCEPTION 'B746A: triggers B724 ausentes/deshabilitados';
 END IF;
 IF EXISTS (SELECT FROM pg_trigger WHERE NOT tgisinternal AND
  ((tgrelid='public.pedidos'::regclass AND tgname='b724_order_guard' AND tgfoid<>'public.b724_order_guard()'::regprocedure)
   OR (tgrelid='public.pedidos'::regclass AND tgname='b724_order_snapshot' AND tgfoid<>'public.b724_order_snapshot()'::regprocedure)
   OR (tgrelid='public.items_pedido'::regclass AND tgname='b724_item_guard' AND tgfoid<>'public.b724_item_guard()'::regprocedure))) THEN
  RAISE EXCEPTION 'B746A: trigger B724 ligado a funcion inesperada';
 END IF;
 IF position('restosmart_create_order_atomic_v1' IN pg_get_functiondef(
  'public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'B746A: wrapper instalado no referencia B5.2';
 END IF;
 -- Los defaults secuenciales deben usar la secuencia propia que se protege abajo.
 IF EXISTS (SELECT FROM pg_attrdef ad JOIN pg_attribute at ON at.attrelid=ad.adrelid AND at.attnum=ad.adnum
  WHERE ad.adrelid IN ('public.restaurants'::regclass,'public.mesas'::regclass,'public.productos'::regclass,
    'public.producto_restaurantes'::regclass,'public.pedidos'::regclass,'public.items_pedido'::regclass,
    'public.order_collection_events'::regclass)
   AND pg_get_expr(ad.adbin,ad.adrelid) LIKE '%nextval%'
   AND (pg_get_serial_sequence(ad.adrelid::regclass::text,at.attname) IS NULL OR EXISTS (
    SELECT FROM pg_depend dd JOIN pg_class sq ON sq.oid=dd.refobjid AND sq.relkind='S'
    WHERE dd.classid='pg_attrdef'::regclass AND dd.objid=ad.oid
     AND sq.oid IS DISTINCT FROM to_regclass(pg_get_serial_sequence(ad.adrelid::regclass::text,at.attname))))) THEN
  RAISE EXCEPTION 'B746A: default usa secuencia no propia; revisar reversibilidad';
 END IF;
 -- No invocar triggers desconocidos que pudieran escribir fuera de las tablas protegidas.
 IF EXISTS (SELECT FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'
   AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace
     AND relname IN ('restaurants','mesas','productos','producto_restaurantes','pedidos','items_pedido',
       'order_collection_configs','order_collections','order_collection_events'))
   AND tgname NOT IN ('b724_order_guard','b724_order_snapshot','b724_item_guard')) THEN
  RAISE EXCEPTION 'B746A: trigger adicional; revisar compatibilidad antes de ejecutar';
 END IF;
 RAISE NOTICE 'PASS preflight: base/version/contratos/columnas/triggers';
END $pre$;

-- Exclusividad de laboratorio: snapshots estables y secuencias sin escritores concurrentes.
LOCK TABLE public.restaurants,public.mesas,public.productos,public.producto_restaurantes,
 public.pedidos,public.items_pedido,public.order_collection_configs,
 public.order_collections,public.order_collection_events IN ACCESS EXCLUSIVE MODE;

DO $fixtures$
BEGIN
 IF EXISTS (SELECT FROM public.restaurants WHERE id BETWEEN 9223372036854746001 AND 9223372036854746099
     OR owner_tenant_id IN ('b746a-a','b746a-b') OR slug LIKE 'b746a-%')
 OR EXISTS (SELECT FROM public.mesas WHERE id BETWEEN 9223372036854746001 AND 9223372036854746099)
 OR EXISTS (SELECT FROM public.productos WHERE id BETWEEN 9223372036854746001 AND 9223372036854746099)
 OR EXISTS (SELECT FROM public.producto_restaurantes WHERE id BETWEEN 9223372036854746001 AND 9223372036854746099)
 OR EXISTS (SELECT FROM public.order_collection_configs WHERE tenant_id IN ('b746a-a','b746a-b'))
 OR EXISTS (SELECT FROM public.order_collections WHERE tenant_id IN ('b746a-a','b746a-b'))
 OR EXISTS (SELECT FROM public.order_collection_events WHERE tenant_id IN ('b746a-a','b746a-b')) THEN
  RAISE EXCEPTION 'B746A: colision fixtures';
 END IF;
 RAISE NOTICE 'PASS preflight: fixtures libres';
END $fixtures$;

-- nextval NO es reversible por si solo. RESTART crea almacenamiento transaccional:
-- sus nextval posteriores se descartan junto con el RESTART al hacer ROLLBACK.
-- No setval, no cambio global de roles. Abarca secuencias OWNED BY/IDENTITY.
DO $sequences$
DECLARE s record; v bigint; called boolean;
BEGIN
 FOR s IN SELECT DISTINCT q.oid, q.oid::regclass AS name, ps.seqincrement
  FROM pg_class q JOIN pg_sequence ps ON ps.seqrelid=q.oid
  JOIN pg_depend d ON d.objid=q.oid AND d.classid='pg_class'::regclass AND d.deptype IN ('a','i')
  WHERE d.refobjid IN ('public.restaurants'::regclass,'public.mesas'::regclass,'public.productos'::regclass,
   'public.producto_restaurantes'::regclass,'public.pedidos'::regclass,'public.items_pedido'::regclass,
   'public.order_collection_events'::regclass)
  ORDER BY q.oid
 LOOP
  EXECUTE format('SELECT last_value,is_called FROM %s',s.name) INTO v,called;
  EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s',s.name,v + CASE WHEN called THEN s.seqincrement ELSE 0 END);
 END LOOP;
 RAISE NOTICE 'PASS preparacion reversible de secuencias propias';
END $sequences$;

CREATE SCHEMA b746a_lab;
REVOKE ALL ON SCHEMA b746a_lab FROM PUBLIC;
CREATE FUNCTION b746a_lab.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL B746A: %',label; END IF; END $$;

-- Historial B744D reproducido en namespace aislado, sin tocar objetos historicos.
CREATE TABLE b746a_lab.historial (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 pedido_id bigint NOT NULL REFERENCES public.pedidos(id), mesa_id bigint,
 estado_anterior text, estado_nuevo text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION b746a_lab.log_estado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO b746a_lab.historial(pedido_id,mesa_id,estado_anterior,estado_nuevo,changed_at)
  VALUES(NEW.id,NEW.mesa_id,NULL,NEW.estado,coalesce((to_jsonb(NEW)->>'creado_en')::timestamptz,now()));
 ELSIF OLD.estado IS DISTINCT FROM NEW.estado THEN
  INSERT INTO b746a_lab.historial(pedido_id,mesa_id,estado_anterior,estado_nuevo)
  VALUES(NEW.id,NEW.mesa_id,OLD.estado,NEW.estado);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b746a_historial AFTER INSERT OR UPDATE ON public.pedidos
 FOR EACH ROW EXECUTE FUNCTION b746a_lab.log_estado();

CREATE FUNCTION b746a_lab.snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t text; rows jsonb; result jsonb := '{}';
BEGIN
 FOREACH t IN ARRAY ARRAY['public.restaurants','public.mesas','public.productos','public.producto_restaurantes',
  'public.pedidos','public.items_pedido','public.order_collection_configs','public.order_collections',
  'public.order_collection_events','b746a_lab.historial'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(j ORDER BY j::text),''[]''::jsonb) FROM (SELECT to_jsonb(x) j FROM %s x) z',t) INTO rows;
  result := result || jsonb_build_object(t,rows);
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION b746a_lab.reject(sql_text text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_data jsonb; rejected boolean := false;
BEGIN
 before_data := b746a_lab.snapshot();
 BEGIN
  EXECUTE sql_text;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM IS DISTINCT FROM expected THEN RAISE; END IF;
  rejected := true;
 END;
 PERFORM b746a_lab.assert_true(rejected,label||': rechazo ausente');
 PERFORM b746a_lab.assert_true(before_data = b746a_lab.snapshot(),label||': escrituras indebidas');
 RAISE NOTICE 'PASS rechazo y ausencia de escrituras: %',label;
END $$;

-- Misma forma de fixtures B744D, tres sucursales / dos tenants.
INSERT INTO public.restaurants(id,slug,plan,estado,owner_tenant_id) VALUES
 (9223372036854746001,'b746a-a1','pro','activo','b746a-a'),
 (9223372036854746002,'b746a-a2','pro','activo','b746a-a'),
 (9223372036854746003,'b746a-b1','pro','activo','b746a-b');
INSERT INTO public.mesas(id,nombre,numero,restaurant_id) VALUES
 (9223372036854746011,'Mesa ficticia A1',1,9223372036854746001),
 (9223372036854746012,'Mesa ficticia A2',1,9223372036854746002),
 (9223372036854746013,'Mesa ficticia B1',1,9223372036854746003);
INSERT INTO public.productos(id,nombre,precio,disponible) VALUES
 (9223372036854746021,'Producto ficticio A',1500,true),
 (9223372036854746022,'Producto ficticio B',700,true);
INSERT INTO public.producto_restaurantes(id,producto_id,restaurant_id,visible_en_menu,control_stock,permitir_sin_stock) VALUES
 (9223372036854746031,9223372036854746021,9223372036854746001,true,false,true),
 (9223372036854746032,9223372036854746021,9223372036854746002,true,false,true),
 (9223372036854746033,9223372036854746022,9223372036854746003,true,false,true);

CREATE FUNCTION b746a_lab.create_order(r bigint, m bigint, p bigint, price numeric, method text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE result jsonb; oid bigint;
BEGIN
 result := public.restosmart_create_order_collection_v1(jsonb_build_object(
  'restaurant_id',r,'mesa_id',m,'estado','solicitado','total',price*2,
  'forma_pago',CASE WHEN method='efectivo' THEN 'efectivo' ELSE 'virtual' END,
  'estado_pago','pendiente','efectivo_aprobado',false,'origen','salon','tipo_servicio','mesa'),
  jsonb_build_array(jsonb_build_object('producto_id',p,'cantidad',2,'comentarios','B746A inicial')),false,method);
 oid := (result->'pedido'->>'id')::bigint;
 PERFORM b746a_lab.assert_true(oid IS NOT NULL AND (result->>'items_count')::int=1,'respuesta RPC real');
 PERFORM b746a_lab.assert_true((SELECT count(*)=1 FROM public.items_pedido WHERE pedido_id=oid AND producto_id=p AND cantidad=2),'items reales');
 PERFORM b746a_lab.assert_true((SELECT total=price*2 FROM public.pedidos WHERE id=oid),'importe real');
 RETURN oid;
END $$;

DO $tests$
DECLARE
 a bigint := 9223372036854746001; a2 bigint := 9223372036854746002; b bigint := 9223372036854746003;
 ma bigint := 9223372036854746011; ma2 bigint := 9223372036854746012; mb bigint := 9223372036854746013;
 pa bigint := 9223372036854746021; pb bigint := 9223372036854746022;
 v bigint; cash bigint; incident bigint; other_order bigint; tok uuid; original_items jsonb;
 cfg jsonb := '{"methods":[{"kind":"transferencia","alias":"b746a.ficticio","holder":"QA FICTICIO"},{"kind":"efectivo"}],"require_payment":true}';
 cfgb jsonb := '{"methods":[{"kind":"efectivo"}],"require_payment":true}';
BEGIN
 PERFORM public.restosmart_collection_config_v1('b746a-a',a,'tenant',cfg,'qa-admin-a');
 PERFORM public.restosmart_collection_config_v1('b746a-b',b,'tenant',cfgb,'qa-admin-b');
 v := b746a_lab.create_order(a,ma,pa,1500,'transferencia');
 SELECT token INTO STRICT tok FROM public.order_collections WHERE order_id=v;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO original_items FROM public.items_pedido i WHERE pedido_id=v;
 PERFORM b746a_lab.assert_true((SELECT method=cfg->'methods'->0 AND state='pending' AND require_payment
  AND amount=3000 AND currency='ARS' AND tenant_id='b746a-a' AND restaurant_id=a FROM public.order_collections WHERE order_id=v),'snapshot virtual');
 PERFORM b746a_lab.assert_true((SELECT estado_pago='pendiente' AND NOT efectivo_aprobado AND moneda_cobro='ARS' FROM public.pedidos WHERE id=v),'pago pendiente');
 RAISE NOTICE 'PASS alta real B724/B5.2, items, importes y snapshot virtual pendiente';

 PERFORM b746a_lab.reject(format('UPDATE public.pedidos SET estado=''en_preparacion'' WHERE id=%s',v),'B724_PAYMENT_REQUIRED','cocina pendiente');
 PERFORM b746a_lab.reject(format('UPDATE public.items_pedido SET comentarios=''preparando'' WHERE pedido_id=%s',v),'B724_PAYMENT_REQUIRED','item pendiente');
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_action_v1(%L,%s,%s,%L::uuid,''declare'',''customer'',NULL)',
  'b746a-a',a,v,CASE WHEN tok='00000000-0000-0000-0000-000000000001'::uuid THEN '00000000-0000-0000-0000-000000000002' ELSE '00000000-0000-0000-0000-000000000001' END),'B724_TRANSITION','token invalido');
 PERFORM public.restosmart_collection_action_v1('b746a-a',a,v,tok,'declare','customer',NULL);
 PERFORM b746a_lab.assert_true((SELECT state='declared' FROM public.order_collections WHERE order_id=v)
  AND (SELECT estado_pago='pendiente' AND NOT efectivo_aprobado FROM public.pedidos WHERE id=v),'declarar no acredita');
 RAISE NOTICE 'PASS cliente declara sin acreditar';
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_action_v1(%L,%s,%s,NULL,''confirm'',''customer'',NULL)','b746a-a',a,v),'B724_OPERATOR','cliente no confirma');
 PERFORM b746a_lab.reject(format('UPDATE public.pedidos SET estado=''en_preparacion'' WHERE id=%s',v),'B724_PAYMENT_REQUIRED','cocina declarada');
 PERFORM public.restosmart_collection_action_v1('b746a-a',a,v,NULL,'confirm','qa-admin-a',NULL);
 PERFORM b746a_lab.assert_true((SELECT state='confirmed' FROM public.order_collections WHERE order_id=v)
  AND (SELECT estado_pago='aprobado' AND NOT efectivo_aprobado FROM public.pedidos WHERE id=v),'confirmacion virtual');
 UPDATE public.pedidos SET estado='en_preparacion' WHERE id=v;
 UPDATE public.items_pedido SET comentarios='B746A cocina habilitada' WHERE pedido_id=v;
 PERFORM b746a_lab.assert_true((SELECT estado='en_preparacion' FROM public.pedidos WHERE id=v)
  AND (SELECT count(*)=1 FROM public.items_pedido WHERE pedido_id=v AND comentarios='B746A cocina habilitada'),'cocina habilitada');
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_action_v1(%L,%s,%s,NULL,''confirm'',''qa-admin-a'',NULL)','b746a-a',a,v),'B724_TRANSITION','confirmacion duplicada');
 PERFORM b746a_lab.assert_true((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('comentarios','B746A inicial') ORDER BY id) FROM public.items_pedido i WHERE pedido_id=v)=original_items,'items conservados salvo comentario cocina');
 RAISE NOTICE 'PASS confirmacion administrativa virtual y cocina habilitada';

 cash := b746a_lab.create_order(a,ma,pa,1500,'efectivo');
 PERFORM b746a_lab.assert_true((SELECT state='pending' FROM public.order_collections WHERE order_id=cash)
  AND (SELECT estado_pago='pendiente' AND NOT efectivo_aprobado FROM public.pedidos WHERE id=cash),'efectivo inicialmente pendiente');
 PERFORM public.restosmart_collection_action_v1('b746a-a',a,cash,NULL,'confirm','qa-admin-a',NULL);
 PERFORM b746a_lab.assert_true((SELECT state='confirmed' AND method->>'kind'='efectivo' FROM public.order_collections WHERE order_id=cash)
  AND (SELECT efectivo_aprobado AND estado_pago='aprobado' FROM public.pedidos WHERE id=cash),'efectivo confirmado');
 RAISE NOTICE 'PASS efectivo pendiente confirmado administrativamente';
 incident := b746a_lab.create_order(a,ma,pa,1500,'transferencia');
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_action_v1(%L,%s,%s,NULL,''incident'',''qa-admin-a'','' '')','b746a-a',a,incident),'B724_TRANSITION','incidencia sin motivo');
 PERFORM public.restosmart_collection_action_v1('b746a-a',a,incident,NULL,'incident','qa-admin-a','Comprobante ficticio inconsistente');
 PERFORM b746a_lab.assert_true((SELECT state='incident' FROM public.order_collections WHERE order_id=incident)
  AND (SELECT estado_pago='pendiente' FROM public.pedidos WHERE id=incident),'incidencia final');
 PERFORM b746a_lab.reject(format('UPDATE public.pedidos SET estado=''en_preparacion'' WHERE id=%s',incident),'B724_PAYMENT_REQUIRED','cocina incidencia');
 RAISE NOTICE 'PASS incidencia con motivo y estado final';

 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_action_v1(%L,%s,%s,NULL,''confirm'',''qa-admin-b'',NULL)','b746a-b',a,v),'B724_NOT_FOUND','tenant ajeno');
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_action_v1(%L,%s,%s,NULL,''confirm'',''qa-admin-a'',NULL)','b746a-a',a2,v),'B724_ORDER_UNAVAILABLE','sucursal ajena mismo tenant');
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_config_v1(%L,%s,''tenant'',%L::jsonb,''qa-admin-a'')','b746a-a',b,cfg::text),'B724_SCOPE','config tenant ajeno');
 PERFORM b746a_lab.reject(format('SELECT public.restosmart_collection_config_v1(%L,%s,%L,%L::jsonb,''qa-admin-a'')','b746a-a',a,'restaurant:'||a2,cfg::text),'B724_SCOPE','scope sucursal ajena');
 PERFORM b746a_lab.reject(format('SELECT b746a_lab.create_order(%s,%s,%s,1500,''transferencia'')',a,mb,pa),'ORDER_VALIDATION: mesa fuera del restaurante','mesa tenant ajeno');
 PERFORM b746a_lab.reject(format('SELECT b746a_lab.create_order(%s,%s,%s,1500,''transferencia'')',a,ma2,pa),'ORDER_VALIDATION: mesa fuera del restaurante','mesa otra sucursal');
 PERFORM b746a_lab.reject(format('SELECT b746a_lab.create_order(%s,%s,%s,700,''transferencia'')',a,ma,pb),'ORDER_VALIDATION: producto fuera del menu','producto tenant ajeno');

 PERFORM public.restosmart_collection_config_v1('b746a-a',a2,'restaurant:'||a2,'{"methods":[],"require_payment":false}','qa-admin-a');
 PERFORM b746a_lab.reject(format('SELECT b746a_lab.create_order(%s,%s,%s,1500,''transferencia'')',a2,ma2,pa),'B724_METHOD_REQUIRED','override vacio no hereda');
 other_order := b746a_lab.create_order(b,mb,pb,700,'efectivo');
 PERFORM b746a_lab.assert_true((SELECT method=cfgb->'methods'->0 AND amount=1400 AND tenant_id='b746a-b' FROM public.order_collections WHERE order_id=other_order)
  AND (SELECT config=cfgb FROM public.order_collection_configs WHERE tenant_id='b746a-b' AND scope='tenant'),'tenant B aislado');
 PERFORM public.restosmart_collection_config_v1('b746a-a',a,'tenant','{"methods":[{"kind":"efectivo"}],"require_payment":false}','qa-admin-a');
 PERFORM b746a_lab.assert_true((SELECT method=cfg->'methods'->0 AND require_payment AND amount=3000 FROM public.order_collections WHERE order_id=v)
  AND (SELECT config=cfgb FROM public.order_collection_configs WHERE tenant_id='b746a-b' AND scope='tenant'),'snapshot inmutable y config aislada');
 RAISE NOTICE 'PASS aislamiento de configuracion, snapshot y override vacio mediante RPC real';

 PERFORM b746a_lab.assert_true((SELECT count(*)=3 FROM public.order_collection_events WHERE order_id=v)
  AND (SELECT array_agg(action ORDER BY id)=ARRAY['created','declare','confirm'] FROM public.order_collection_events WHERE order_id=v)
  AND (SELECT count(*)=1 FROM public.order_collection_events WHERE order_id=v AND action='created' AND operator='customer')
  AND (SELECT count(*)=1 FROM public.order_collection_events WHERE order_id=v AND action='declare' AND operator='customer')
  AND (SELECT count(*)=1 FROM public.order_collection_events WHERE order_id=v AND action='confirm' AND operator='qa-admin-a'),'auditoria virtual');
 PERFORM b746a_lab.assert_true((SELECT count(*)=2 FROM public.order_collection_events WHERE order_id=cash)
  AND (SELECT count(*)=1 FROM public.order_collection_events WHERE order_id=cash AND action='confirm' AND operator='qa-admin-a')
  AND (SELECT count(*)=2 FROM public.order_collection_events WHERE order_id=incident)
  AND (SELECT count(*)=1 FROM public.order_collection_events WHERE order_id=incident AND action='incident' AND operator='qa-admin-a' AND note='Comprobante ficticio inconsistente'),'auditoria efectivo/incidencia');
 PERFORM b746a_lab.assert_true((SELECT count(*)=4 FROM public.order_collection_events WHERE tenant_id IN ('b746a-a','b746a-b') AND action='config')
  AND NOT EXISTS (SELECT FROM public.order_collection_events e JOIN public.order_collections c ON c.order_id=e.order_id
    WHERE e.order_id IN(v,cash,incident,other_order) AND (e.tenant_id<>c.tenant_id OR e.restaurant_id<>c.restaurant_id)),'auditoria scope');
 RAISE NOTICE 'PASS auditoria de alta, declaracion, confirmacion, incidencia y configuracion';

 PERFORM b746a_lab.assert_true((SELECT count(*)=2 FROM b746a_lab.historial WHERE pedido_id=v)
  AND (SELECT count(*)=1 FROM b746a_lab.historial WHERE pedido_id=v AND estado_anterior IS NULL AND estado_nuevo='solicitado')
  AND (SELECT count(*)=1 FROM b746a_lab.historial WHERE pedido_id=v AND estado_anterior='solicitado' AND estado_nuevo='en_preparacion')
  AND (SELECT count(*)=5 FROM b746a_lab.historial),'historial alta/cambio sin eventos por rechazos');
 PERFORM b746a_lab.assert_true((SELECT count(*)=4 AND sum(total)=10400 FROM public.pedidos WHERE id IN(v,cash,incident,other_order))
  AND (SELECT count(*)=4 AND sum(cantidad)=8 FROM public.items_pedido WHERE pedido_id IN(v,cash,incident,other_order))
  AND (SELECT count(*)=4 AND sum(amount)=10400 FROM public.order_collections WHERE order_id IN(v,cash,incident,other_order)),'conservacion final');
 PERFORM b746a_lab.assert_true(NOT EXISTS (
  SELECT FROM public.pedidos p JOIN public.order_collections c ON c.order_id=p.id
  JOIN public.items_pedido i ON i.pedido_id=p.id
  WHERE p.id IN(v,cash,incident,other_order) AND
   (p.total IS DISTINCT FROM CASE WHEN p.id=other_order THEN 1400 ELSE 3000 END::numeric
    OR c.amount IS DISTINCT FROM p.total OR i.cantidad IS DISTINCT FROM 2
    OR i.producto_id IS DISTINCT FROM CASE WHEN p.id=other_order THEN pb ELSE pa END)),
  'importe y producto conservados individualmente');
 RAISE NOTICE 'PASS historial temporal B744D y conservacion final de importes/items';
 RAISE NOTICE 'NO VERIFICADA: autenticacion HTTP/administrador real, RLS efectiva como anon/authenticated/service_role, concurrencia y stock';
 RAISE NOTICE 'INFO: PASS son internos a esta transaccion; ejecutor debe comprobar ROLLBACK y ausencia posterior de schema/fixtures';
END $tests$;

ROLLBACK;
