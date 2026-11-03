ALTER TABLE public.configuracion_local ADD COLUMN ready_notice_mode text CHECK (ready_notice_mode IN ('table_service','counter'));
NOTIFY pgrst,'reload schema';

