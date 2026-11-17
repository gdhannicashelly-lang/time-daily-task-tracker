-- Time & Task Tracker Pro — Supabase SQL setup
-- Run the complete script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('admin','manager','employee'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_status as enum ('active','archived','trash'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', mobile_number text not null default '', avatar_path text,
 role public.app_role not null default 'employee', is_active boolean not null default true,
 hourly_rate numeric(10,2) not null default 350, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 work_date date not null default current_date, time_in time, time_out time, location_set text not null default '',
 description text not null, task_link text, hours_completed numeric(8,2) not null default 0 check(hours_completed >= 0),
 notes text not null default '', ops_notes text not null default '', status public.task_status not null default 'active',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 clock_in timestamptz not null default now(), clock_out timestamptz, total_break_seconds integer not null default 0 check(total_break_seconds >= 0),
 status text not null default 'working' check(status in ('working','on_break','completed')), created_at timestamptz not null default now()
);
create unique index if not exists attendance_one_open_shift_per_user on public.attendance(user_id) where clock_out is null;
create table if not exists public.breaks (
 id uuid primary key default gen_random_uuid(), attendance_id uuid not null references public.attendance(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade, break_start timestamptz not null default now(), break_end timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists breaks_one_open_break_per_attendance on public.breaks(attendance_id) where break_end is null;
create table if not exists public.activity_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null,
 action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''), 'employee') on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.get_active_shift_count() returns bigint language sql stable security definer set search_path='' as $$
 select count(*)::bigint from public.attendance a join public.profiles p on p.id=a.user_id where a.clock_out is null and p.is_active=true;
$$;
revoke all on function public.get_active_shift_count() from public;
grant execute on function public.get_active_shift_count() to authenticated, anon;

create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and is_active=true limit 1;
$$;
revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.attendance enable row level security;
alter table public.breaks enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists profiles_read_self_or_manager on public.profiles;
create policy profiles_read_self_or_manager on public.profiles for select to authenticated using (id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (id=auth.uid() or public.current_app_role()='admin') with check (id=auth.uid() or public.current_app_role()='admin');
-- Prevent privilege escalation through profile updates.
create or replace function public.protect_profile_role() returns trigger language plpgsql set search_path='' as $$
begin if auth.uid() is not null and old.role is distinct from new.role and public.current_app_role() <> 'admin' then raise exception 'Only an administrator can change roles'; end if; return new; end; $$;
drop trigger if exists protect_profile_role_trigger on public.profiles;
create trigger protect_profile_role_trigger before update on public.profiles for each row execute function public.protect_profile_role();

drop policy if exists tasks_read_own_or_manager on public.tasks;
create policy tasks_read_own_or_manager on public.tasks for select to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks for insert to authenticated with check (user_id=auth.uid());
drop policy if exists tasks_update_own_or_manager on public.tasks;
create policy tasks_update_own_or_manager on public.tasks for update to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager')) with check (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists tasks_delete_own_or_manager on public.tasks;
create policy tasks_delete_own_or_manager on public.tasks for delete to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
create or replace function public.protect_task_ops_notes() returns trigger language plpgsql set search_path='' as $$
begin if old.ops_notes is distinct from new.ops_notes and public.current_app_role() not in ('admin','manager') then raise exception 'Ops Notes are restricted to managers and administrators'; end if; return new; end; $$;
drop trigger if exists protect_task_ops_notes_trigger on public.tasks;
create trigger protect_task_ops_notes_trigger before update on public.tasks for each row execute function public.protect_task_ops_notes();

drop policy if exists attendance_read_own_or_manager on public.attendance;
create policy attendance_read_own_or_manager on public.attendance for select to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists attendance_insert_own on public.attendance;
create policy attendance_insert_own on public.attendance for insert to authenticated with check (user_id=auth.uid());
drop policy if exists attendance_update_own_or_manager on public.attendance;
create policy attendance_update_own_or_manager on public.attendance for update to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager')) with check (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists breaks_read_own_or_manager on public.breaks;
create policy breaks_read_own_or_manager on public.breaks for select to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists breaks_insert_own on public.breaks;
create policy breaks_insert_own on public.breaks for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.attendance a where a.id=attendance_id and a.user_id=auth.uid() and a.clock_out is null));
drop policy if exists breaks_update_own on public.breaks;
create policy breaks_update_own on public.breaks for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists activity_logs_read_own_or_manager on public.activity_logs;
create policy activity_logs_read_own_or_manager on public.activity_logs for select to authenticated using (user_id=auth.uid() or public.current_app_role() in ('admin','manager'));
drop policy if exists activity_logs_insert_own on public.activity_logs;
create policy activity_logs_insert_own on public.activity_logs for insert to authenticated with check (user_id=auth.uid());

-- Profile image bucket: public URLs are used for displaying profile pictures.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',true,1572864,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=1572864,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists profile_photos_read on storage.objects;
create policy profile_photos_read on storage.objects for select to authenticated, anon using (bucket_id='profile-photos');
drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own on storage.objects for insert to authenticated with check (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own on storage.objects for update to authenticated using (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own on storage.objects for delete to authenticated using (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);

-- Enable realtime for attendance, tasks, and activity feed.
do $$ begin alter publication supabase_realtime add table public.attendance; exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.activity_logs; exception when duplicate_object then null; when undefined_object then null; end $$;
notify pgrst, 'reload schema';
select public.get_active_shift_count() as active_shift_count;
