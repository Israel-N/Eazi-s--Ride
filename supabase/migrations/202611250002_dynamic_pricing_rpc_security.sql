revoke execute on function public.get_ride_fare_quote(
    text, text, double precision, double precision,
    double precision, double precision, text, text
) from anon;

revoke execute on function public.request_ride_with_quote(
    uuid, timestamptz
) from anon;

revoke execute on function public.admin_get_ride_pricing()
from anon;

revoke execute on function public.admin_update_ride_pricing(jsonb)
from anon;
