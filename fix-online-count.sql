-- Run this in Supabase Dashboard > SQL Editor if the app still says
-- get_active_shift_count() is missing from the schema cache.

create or replace function public.get_active_shift_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.attendance as a
  join public.profiles as p on p.id = a.user_id
  where a.clock_out is null
    and p.is_active = true;
$$;

-- The function returns only an aggregate count, not employee details.
revoke all on function public.get_active_shift_count() from public;
grant execute on function public.get_active_shift_count() to authenticated, anon;

-- Ask PostgREST to refresh its function/schema cache.
notify pgrst, 'reload schema';

-- Verify the function exists and runs.
select public.get_active_shift_count() as active_shift_count;
