-- Postgres grants EXECUTE to PUBLIC by default, so anon could call these even
-- though each one rejects a null auth.uid(). Remove the grant as well, rather
-- than relying only on the check inside.

revoke execute on function public.remove_rider(uuid) from anon, public;
revoke execute on function public.cancel_ride_seat(uuid) from anon, public;
revoke execute on function public.cancel_ride(uuid) from anon, public;
revoke execute on function public.request_seat(uuid) from anon, public;
revoke execute on function public.respond_to_seat_request(uuid, boolean) from anon, public;
revoke execute on function public.update_my_profile(text, text, text, text) from anon, public;
revoke execute on function public.my_profile_id() from anon, public;

grant execute on function public.remove_rider(uuid) to authenticated;
grant execute on function public.cancel_ride_seat(uuid) to authenticated;
grant execute on function public.cancel_ride(uuid) to authenticated;
grant execute on function public.request_seat(uuid) to authenticated;
grant execute on function public.respond_to_seat_request(uuid, boolean) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
grant execute on function public.my_profile_id() to authenticated;
