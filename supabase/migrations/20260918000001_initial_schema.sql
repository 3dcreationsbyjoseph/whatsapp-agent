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
