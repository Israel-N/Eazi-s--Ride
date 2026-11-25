CREATE OR REPLACE FUNCTION public.admin_get_ride_pricing_audit()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
    v_history jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required.'
            USING errcode = '42501';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'admin_id', a.admin_id,
                'admin_name', COALESCE(
                    NULLIF(p.full_name, ''),
                    'Administrator'
                ),
                'created_at', a.created_at,
                'before_settings', a.before_settings,
                'after_settings', a.after_settings
            )
            ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_history
    FROM (
        SELECT *
        FROM public.ride_pricing_audit
        ORDER BY created_at DESC
        LIMIT 20
    ) a
    LEFT JOIN public.profiles p ON p.id = a.admin_id;

    RETURN v_history;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_ride_pricing_audit()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_ride_pricing_audit()
TO authenticated;
