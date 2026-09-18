-- =====================================================================
-- Trigger: al crear un usuario en auth.users, crear su organization,
-- profile y agent_config por defecto.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id       uuid;
  v_org_name     text;
  v_base_slug    text;
  v_slug         text;
begin
  v_org_name := coalesce(new.raw_user_meta_data->>'organization_name', split_part(new.email, '@', 1));
  v_base_slug := lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'org';
  end if;
  v_slug := v_base_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.organizations (name, slug)
  values (v_org_name, v_slug)
  returning id into v_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, v_org_id, new.raw_user_meta_data->>'full_name', 'owner');

  insert into public.agent_configs (organization_id, system_prompt, tone, services, business_hours)
  values (
    v_org_id,
    'Eres un asistente amable, profesional y cálido de atención al cliente para una clínica dental. Tu objetivo es ayudar a los pacientes a agendar citas por WhatsApp. Sé breve, claro y directo. Confirma la información antes de agendar. Si no entiendes algo, pide aclaración. Si el paciente pide hablar con un humano, activa el handoff.',
    'profesional y cálido',
    '[
      {"name":"limpieza","duration_minutes":30,"description":"Limpieza dental profesional"},
      {"name":"empaste","duration_minutes":45,"description":"Reparación de caries con empaste"},
      {"name":"blanqueamiento","duration_minutes":60,"description":"Blanqueamiento dental"}
    ]'::jsonb,
    '{
      "mon":[{"start":"09:00","end":"18:00"}],
      "tue":[{"start":"09:00","end":"18:00"}],
      "wed":[{"start":"09:00","end":"18:00"}],
      "thu":[{"start":"09:00","end":"18:00"}],
      "fri":[{"start":"09:00","end":"18:00"}],
      "sat":[{"start":"09:00","end":"14:00"}],
      "sun":[]
    }'::jsonb
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
