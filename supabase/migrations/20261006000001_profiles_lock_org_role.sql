-- =====================================================================
-- profiles: un usuario no puede cambiarse de organización ni de rol.
-- La política "profile_self_update" solo comprobaba id = auth.uid(), así que
-- con la anon key se podía hacer update de organization_id/role y acceder a
-- otra organización. Con privilegios por columna, desde el cliente solo se
-- puede editar full_name. El trigger handle_new_user (security definer) y el
-- service role no se ven afectados.
-- =====================================================================

revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
