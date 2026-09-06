alter table public.ride_requests add column if not exists matched_ride_id uuid references public.rides(id) on delete set null;

create or replace function public.offer_ride_for_request(target_request_id bigint, offered_seats integer, offered_price numeric)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid; request_row record; new_ride_id uuid;
begin
  select id into me from public.campus_profiles where user_id=auth.uid();
  if me is null then raise exception 'Not signed in'; end if;
  if offered_seats<1 or offered_seats>8 then raise exception 'Seats must be between 1 and 8'; end if;
  if offered_price<0 or offered_price>1000 then raise exception 'Price must be between 0 and 1000'; end if;
  select * into request_row from public.ride_requests where id=target_request_id and not is_closed and departure_at>now() for update;
  if request_row is null then raise exception 'That request is no longer available'; end if;
  if request_row.requester_profile_id=me then raise exception 'You cannot offer a ride to yourself'; end if;
  insert into public.rides(driver_id,driver_profile_id,origin,destination,departure_at,seats_available,price_per_seat)
  values(auth.uid(),me,request_row.origin,request_row.destination,request_row.departure_at,offered_seats,offered_price) returning id into new_ride_id;
  insert into public.ride_reservations(ride_id,rider_profile_id,rider_name,status) values(new_ride_id,request_row.requester_profile_id,request_row.rider_name,'pending');
  update public.ride_requests set is_closed=true,matched_ride_id=new_ride_id where id=target_request_id;
  return new_ride_id;
end; $$;
revoke execute on function public.offer_ride_for_request(bigint,integer,numeric) from anon,public;
grant execute on function public.offer_ride_for_request(bigint,integer,numeric) to authenticated;

create or replace function public.get_ride_contacts(target_ride_id uuid)
returns table(profile_id uuid,display_name text,contact_method text,contact_value text)
language plpgsql security definer set search_path to '' as $$
declare me uuid;
begin
  select id into me from public.campus_profiles where user_id=auth.uid();
  if me is null or not exists(select 1 from public.rides r where r.id=target_ride_id and (r.driver_profile_id=me or exists(select 1 from public.ride_reservations rr where rr.ride_id=r.id and rr.rider_profile_id=me and rr.status in ('pending','accepted')))) then return; end if;
  return query select p.id,p.display_name,ar.contact_method,ar.contact_value from public.campus_profiles p join public.access_requests ar on ar.user_id=p.user_id where p.id=(select r.driver_profile_id from public.rides r where r.id=target_ride_id) or p.id in(select rr.rider_profile_id from public.ride_reservations rr where rr.ride_id=target_ride_id and rr.status in ('pending','accepted'));
end; $$;
revoke execute on function public.get_ride_contacts(uuid) from anon,public;
grant execute on function public.get_ride_contacts(uuid) to authenticated;
