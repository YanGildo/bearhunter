-- BearHunter — login com aprovação, Admin e dados por usuário.
-- Cole tudo no Supabase → SQL Editor → New query → Run. Pode rodar mais de uma vez sem problema.

-- 1) Perfis (um por usuário do login)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  is_admin boolean not null default false,
  operators_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Admin = perfil ativo marcado como admin. SECURITY DEFINER evita recursão nas políticas.
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin and status = 'active');
$$;

create or replace function public.is_active() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- Só o admin altera perfis (status, acesso a Operadores). Usuário comum não consegue se aprovar.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- 2) Cadastro novo → perfil "pending". O e-mail do dono entra como admin ativo.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner_email constant text := 'yangildomourafranca@gmail.com';
  is_owner boolean := lower(coalesce(new.email, '')) = owner_email;
begin
  insert into public.profiles (id, email, name, status, is_admin, operators_enabled)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when is_owner then 'active' else 'pending' end,
    is_owner,
    is_owner
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários que já existiam antes deste script
insert into public.profiles (id, email, name, status, is_admin, operators_enabled)
select u.id, u.email, split_part(u.email, '@', 1),
  case when lower(u.email) = 'yangildomourafranca@gmail.com' then 'active' else 'pending' end,
  lower(u.email) = 'yangildomourafranca@gmail.com',
  lower(u.email) = 'yangildomourafranca@gmail.com'
from auth.users u
on conflict (id) do nothing;

-- 3) Configurações de cada usuário (presets, Watchlist, pastas, carteiras de operador…)
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;

drop policy if exists "user_state_own" on public.user_state;
create policy "user_state_own" on public.user_state for all
  using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid() and public.is_active());
