-- =====================================================================
-- Esquema inicial: multi-tenant WhatsApp Agent
-- =====================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  timezone    text not null default 'America/Mexico_City',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- profiles (extiende auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  full_name        text,
  role             text not null check (role in ('owner','staff')) default 'owner',
  created_at       timestamptz not null default now()
);
create index if not exists profiles_organization_id_idx on public.profiles(organization_id);

-- ---------------------------------------------------------------------
-- whatsapp_configs
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_configs (
  organization_id       uuid primary key references public.organizations(id) on delete cascade,
  phone_number_id       text not null,
  waba_id               text not null,
  access_token_encrypted text not null,
  verify_token          text not null,
  app_secret_encrypted  text not null,
  updated_at            timestamptz not null default now()
);
create unique index if not exists whatsapp_configs_phone_number_id_idx
  on public.whatsapp_configs(phone_number_id);

-- ---------------------------------------------------------------------
-- google_calendar_configs
-- ---------------------------------------------------------------------
create table if not exists public.google_calendar_configs (
  organization_id         uuid primary key references public.organizations(id) on delete cascade,
  calendar_id             text not null,
  refresh_token_encrypted text not null,
  access_token_encrypted  text,
  token_expires_at        timestamptz,
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- agent_configs
-- ---------------------------------------------------------------------
create table if not exists public.agent_configs (
  organization_id  uuid primary key references public.organizations(id) on delete cascade,
  system_prompt    text not null,
  tone             text not null default 'profesional y cálido',
  business_info    jsonb not null default '{}'::jsonb,
  services         jsonb not null default '[]'::jsonb,
  business_hours   jsonb not null default '{}'::jsonb,
  handoff_message  text default 'Te paso con un humano en un momento.',
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  wa_phone         text not null,
  full_name        text,
  is_new_patient   boolean,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (organization_id, wa_phone)
);

-- ---------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  bot_active       boolean not null default true,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (organization_id, contact_id)
);
create index if not exists conversations_org_last_message_idx
  on public.conversations(organization_id, last_message_at desc);

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  wa_message_id    text unique,
  direction        text not null check (direction in ('inbound','outbound')),
  sender           text not null check (sender in ('contact','bot','human')),
  content          text,
  raw              jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists messages_conv_created_at_idx
  on public.messages(conversation_id, created_at desc);

-- ---------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------
create table if not exists public.appointments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  service           text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  google_event_id   text,
  status            text not null check (status in ('confirmed','cancelled','completed')) default 'confirmed',
  is_new_patient    boolean,
  full_name         text not null,
  phone             text not null,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists appointments_org_starts_at_idx
  on public.appointments(organization_id, starts_at);

-- ---------------------------------------------------------------------
-- Trigger genérico set_updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger whatsapp_configs_set_updated_at
  before update on public.whatsapp_configs
  for each row execute function public.set_updated_at();

create trigger google_calendar_configs_set_updated_at
  before update on public.google_calendar_configs
  for each row execute function public.set_updated_at();

create trigger agent_configs_set_updated_at
  before update on public.agent_configs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Realtime: habilitar publicación para conversations y messages
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
-- =====================================================================
-- Row Level Security: aislar por organization_id
-- Todas las políticas usan (select ...) para evitar re-evaluación por fila.
-- =====================================================================

-- Helper: obtener el organization_id del usuario autenticado
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Habilitar RLS
-- ---------------------------------------------------------------------
alter table public.organizations           enable row level security;
alter table public.profiles                enable row level security;
alter table public.whatsapp_configs        enable row level security;
alter table public.google_calendar_configs enable row level security;
alter table public.agent_configs           enable row level security;
alter table public.contacts                enable row level security;
alter table public.conversations           enable row level security;
alter table public.messages                enable row level security;
alter table public.appointments            enable row level security;

-- ---------------------------------------------------------------------
-- organizations: solo puedes ver/modificar la tuya
-- ---------------------------------------------------------------------
create policy "org_own" on public.organizations
  for all
  using  (id = (select public.current_org_id()))
  with check (id = (select public.current_org_id()));

-- ---------------------------------------------------------------------
-- profiles: cada usuario ve/modifica su propio perfil;
-- además puede leer los perfiles de su organización
-- ---------------------------------------------------------------------
create policy "profile_self_read" on public.profiles
  for select
  using (id = (select auth.uid()) or organization_id = (select public.current_org_id()));

create policy "profile_self_update" on public.profiles
  for update
  using  (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Resto de tablas: aisladas por organization_id
-- ---------------------------------------------------------------------
create policy "wa_configs_org" on public.whatsapp_configs
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "gcal_configs_org" on public.google_calendar_configs
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "agent_configs_org" on public.agent_configs
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "contacts_org" on public.contacts
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "conversations_org" on public.conversations
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "messages_org" on public.messages
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "appointments_org" on public.appointments
  for all
  using  (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

-- ---------------------------------------------------------------------
-- Nota: el webhook /api/webhooks/whatsapp usa service_role_key,
-- que bypasea RLS. El código en /lib debe filtrar manualmente por
-- organization_id resuelto desde phone_number_id.
-- ---------------------------------------------------------------------
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
