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
