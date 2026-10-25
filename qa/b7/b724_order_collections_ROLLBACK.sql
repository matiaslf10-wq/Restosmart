-- Prepared only. NOT EXECUTED. Revert application B7.24 changes first.
-- Preserve audit/payment evidence. No updates to orders or historical payment states.
BEGIN;
DROP TRIGGER b724_item_guard ON public.items_pedido;
DROP TRIGGER b724_order_snapshot ON public.pedidos;
DROP TRIGGER b724_order_guard ON public.pedidos;
DROP FUNCTION public.b724_item_guard();
DROP FUNCTION public.b724_order_snapshot();
DROP FUNCTION public.b724_order_guard();
DROP FUNCTION public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text);
DROP FUNCTION public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text);
DROP FUNCTION public.restosmart_collection_config_v1(text,bigint,text,jsonb,text);
CREATE SCHEMA b724_archive;
REVOKE ALL ON SCHEMA b724_archive FROM PUBLIC, anon, authenticated;
ALTER TABLE public.order_collection_configs SET SCHEMA b724_archive;
ALTER TABLE public.order_collections SET SCHEMA b724_archive;
ALTER TABLE public.order_collection_events SET SCHEMA b724_archive;
REVOKE ALL ON ALL TABLES IN SCHEMA b724_archive FROM PUBLIC, anon, authenticated, service_role;
-- pedidos.moneda_cobro intentionally preserved; no historical rewrite or data loss.
COMMIT;
