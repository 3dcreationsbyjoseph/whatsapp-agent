-- =====================================================================
-- Pivote a inmobiliaria de lujo (Costa Blanca).
-- Añade properties + leads y amplía appointments con property_id + visit_type.
-- =====================================================================

-- ---------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------
create table if not exists public.properties (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  reference         text,
  title             text not null,
  location          text not null,
  property_type     text not null default 'villa',
  price_eur         bigint not null,
  bedrooms          integer not null default 0,
  bathrooms         integer not null default 0,
  built_area_m2     integer,
  plot_area_m2      integer,
  features          jsonb not null default '[]'::jsonb,
  description       text,
  photo_urls        jsonb not null default '[]'::jsonb,
  video_url         text,
  virtual_tour_url  text,
  status            text not null check (status in ('available','reserved','sold','off_market')) default 'available',
  agent_name        text,
  agent_phone       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists properties_org_status_idx on public.properties(organization_id, status);
create index if not exists properties_org_price_idx on public.properties(organization_id, price_eur);
create index if not exists properties_org_location_idx on public.properties(organization_id, location);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  contact_id          uuid not null references public.contacts(id) on delete cascade,
  budget_min_eur      bigint,
  budget_max_eur      bigint,
  preferred_locations jsonb not null default '[]'::jsonb,
  preferred_types     jsonb not null default '[]'::jsonb,
  min_bedrooms        integer,
  min_bathrooms       integer,
  needs_pool          boolean,
  needs_sea_view      boolean,
  timeline            text,
  financing           text,
  language            text default 'es',
  qualified           boolean default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, contact_id)
);
create index if not exists leads_org_qualified_idx on public.leads(organization_id, qualified);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- appointments → ampliar para visitas a chalets
-- ---------------------------------------------------------------------
alter table public.appointments add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.appointments add column if not exists visit_type text check (visit_type in ('presencial','video_call','llamada')) default 'presencial';
create index if not exists appointments_property_idx on public.appointments(property_id) where property_id is not null;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.leads      enable row level security;

create policy "properties_org" on public.properties
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "leads_org" on public.leads
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.properties;
alter publication supabase_realtime add table public.leads;

-- ---------------------------------------------------------------------
-- Nuevo trigger de signup para orgs de inmobiliaria
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
