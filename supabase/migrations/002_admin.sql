-- BearHunter — Admin: último acesso e excluir usuário.
-- Cole no Supabase → SQL Editor → New query → Run. Pode rodar mais de uma vez.

-- 1) Último acesso (o app marca ao abrir, no máximo a cada 5 min)
alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- 2) Admin exclui um usuário (login + perfil + configurações, em cascata)
create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'apenas o administrador pode excluir usuários';
  end if;
  if target = auth.uid() then
    raise exception 'você não pode excluir a sua própria conta';
  end if;
  delete from auth.users where id = target;
end;
$$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
