-- =====================================================================
-- organizations: los usuarios pueden leer y actualizar la suya, pero no
-- borrarla ni crear otras. La política "org_own" era FOR ALL, así que
-- cualquier miembro podía borrar la organización (y por cascada todos sus
-- datos) con la anon key. Las altas las hace el trigger handle_new_user
-- (security definer) y no se ven afectadas.
-- =====================================================================

drop policy if exists "org_own" on public.organizations;
drop policy if exists "org_select_own" on public.organizations;
drop policy if exists "org_update_own" on public.organizations;

create policy "org_select_own" on public.organizations
  for select to authenticated
  using (id = (select public.current_org_id()));

create policy "org_update_own" on public.organizations
  for update to authenticated
  using (id = (select public.current_org_id()))
  with check (id = (select public.current_org_id()));

revoke insert, delete on public.organizations from anon, authenticated;
