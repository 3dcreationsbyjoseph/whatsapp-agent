-- =====================================================================
-- Facturación: suscripción Stripe por organización + prueba de 14 días
-- =====================================================================
-- Solo el service role escribe en esta tabla (webhook de Stripe y trigger
-- de signup). Los usuarios solo pueden LEER la fila de su organización,
-- así nadie puede alargarse la prueba desde el cliente.

create table if not exists public.org_subscriptions (
  organization_id        uuid primary key references public.organizations(id) on delete cascade,
  status                 text not null default 'trialing'
                         check (status in ('trialing','active','past_due','canceled','unpaid',
                                           'incomplete','incomplete_expired','paused')),
  trial_ends_at          timestamptz not null default (now() + interval '14 days'),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.org_subscriptions enable row level security;

-- drop + create: la migración se puede ejecutar más de una vez sin error.
drop policy if exists "org_subscriptions_select_own" on public.org_subscriptions;
create policy "org_subscriptions_select_own" on public.org_subscriptions
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- Sin políticas de insert/update/delete: con RLS activo quedan denegadas
-- para anon/authenticated. Además retiramos los privilegios explícitamente.
revoke insert, update, delete on public.org_subscriptions from anon, authenticated;

-- Backfill: toda organización existente empieza con 14 días de prueba.
insert into public.org_subscriptions (organization_id, status, trial_ends_at)
select id, 'trialing', now() + interval '14 days'
from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------
-- Trigger de signup: igual que en 20260919000001_realestate_pivot.sql
-- + alta de la fila de suscripción en prueba.
-- ---------------------------------------------------------------------
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
  if v_base_slug = '' then v_base_slug := 'agencia'; end if;
  v_slug := v_base_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.organizations (name, slug, timezone)
  values (v_org_name, v_slug, 'Europe/Madrid')
  returning id into v_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, v_org_id, new.raw_user_meta_data->>'full_name', 'owner');

  insert into public.agent_configs (organization_id, system_prompt, tone, services, business_hours, handoff_message)
  values (
    v_org_id,
    'Eres Estate, asistente virtual de una agencia inmobiliaria de lujo en la Costa Blanca. Atiendes a clientes internacionales interesados en villas y chalets de alto standing en Jávea, Moraira, Denia, Calpe y Altea. Actúas con elegancia, discreción y máxima profesionalidad.',
    'formal, cálido y discreto',
    '[
      {"name":"visita presencial","duration_minutes":60,"description":"Visita presencial a la propiedad con un agente"},
      {"name":"video llamada","duration_minutes":30,"description":"Recorrido virtual guiado por videollamada"},
      {"name":"llamada informativa","duration_minutes":20,"description":"Llamada telefónica para resolver dudas y asesorar"}
    ]'::jsonb,
    '{
      "mon":[{"start":"09:30","end":"19:00"}],
      "tue":[{"start":"09:30","end":"19:00"}],
      "wed":[{"start":"09:30","end":"19:00"}],
      "thu":[{"start":"09:30","end":"19:00"}],
      "fri":[{"start":"09:30","end":"19:00"}],
      "sat":[{"start":"10:00","end":"14:00"}],
      "sun":[]
    }'::jsonb,
    ''
  );

  insert into public.org_subscriptions (organization_id, status, trial_ends_at)
  values (v_org_id, 'trialing', now() + interval '14 days');

  return new;
end;
$$;
