-- @allow-write
-- Hay DOS versiones coexistentes de change_appointment_status y reschedule_appointment
-- (una vieja de 3 args sin p_actor_id + una nueva de 4 args con p_actor_id).
-- Eso genera ambigüedad y puede hacer que Supabase invoque la vieja que usa
-- auth.uid() (NULL cuando se llama con service_role).
--
-- Drop las versiones VIEJAS (3 args) y dejar solo las nuevas (4 args con p_actor_id).

DROP FUNCTION IF EXISTS public.change_appointment_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.reschedule_appointment(uuid, timestamptz, text);

-- Verificación: solo debe quedar UNA signature por función
SELECT 'final_rpcs' AS section, proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('change_appointment_status','reschedule_appointment')
ORDER BY proname;
