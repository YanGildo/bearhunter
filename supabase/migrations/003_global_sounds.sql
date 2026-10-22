-- BearHunter — sons globais (o admin publica um som para todos os usuários).
-- Já aplicado no projeto pelo Claude; fica aqui como registro. Pode rodar de novo.
create table if not exists public.global_sounds (
  id text primary key,
  name text not null,
  path text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);
alter table public.global_sounds enable row level security;
-- políticas (criar uma vez): leitura para usuários ativos; escrita só admin
-- create policy "global_sounds_read" on public.global_sounds for select to authenticated using (public.is_active());
-- create policy "global_sounds_admin_insert" on public.global_sounds for insert to authenticated with check (public.is_admin());
-- create policy "global_sounds_admin_update" on public.global_sounds for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sounds', 'sounds', true, 5242880, array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/mp4','audio/x-m4a','audio/aac'])
on conflict (id) do nothing;
-- create policy "sounds_admin_upload" on storage.objects for insert to authenticated with check (bucket_id = 'sounds' and public.is_admin());
-- create policy "sounds_admin_change" on storage.objects for update to authenticated using (bucket_id = 'sounds' and public.is_admin()) with check (bucket_id = 'sounds' and public.is_admin());
