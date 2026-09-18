# Tarea

Crea la plataforma de atenciÃ³n al cliente con WhatsApp.

---

## Stack tecnolÃ³gico (obligatorio)

- **Framework:** Next.js **16.2.6** con App Router y TypeScript en modo `strict`
- **Estilos:** TailwindCSS (v4)
- **Iconos:** Phosphor Icons (`@phosphor-icons/react`)
- **Base de datos + Auth:** Supabase (Postgres + Auth + Row Level Security)
- **IA / orquestaciÃ³n del agente:** Vercel AI SDK 6 (`ai` + `@ai-sdk/anthropic`)
- **Modelo LLM:** Anthropic Claude Sonnet 4.6, model string exacto: `claude-sonnet-4-6`
- **WhatsApp:** WhatsApp Cloud API oficial de Meta (Graph API)
- **Calendario:** Google Calendar API vÃ­a OAuth 2.0
- **Deploy:** Vercel (serverless / fluid compute, runtime Node.js para webhooks)

### Notas importantes sobre el stack (verificadas contra la documentaciÃ³n oficial vigente)

1. **Next.js 16.2.6** usa App Router por defecto. Server Components por defecto; aÃ±ade `"use client"` sÃ³lo cuando haga falta interactividad. Aprovecha Server Actions para mutaciones desde el dashboard. Cache Components es opt-in en Next 16: el cachÃ© ya **no** es implÃ­cito, asÃ­ que no asumas cachÃ© donde no se ha declarado.
2. **WhatsApp Cloud API** (no la versiÃ³n On-Premises, que Meta estÃ¡ deprecando). Endpoints contra `https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages` â€” **v25.0 es la versiÃ³n vigente** (lanzada por Meta el 18 de febrero de 2026). No uses v23.0 ni inferiores: estÃ¡n cerca del fin de soporte (Meta mantiene cada versiÃ³n ~2 aÃ±os). Centraliza la versiÃ³n en una constante `GRAPH_API_VERSION` para futuras migraciones. AutenticaciÃ³n con **System User Access Token** (no token personal) con permisos `whatsapp_business_messaging` y `whatsapp_business_management`. El webhook necesita endpoint pÃºblico HTTPS (no autofirmado) que maneje:
   - `GET /api/webhooks/whatsapp` para la verificaciÃ³n (`hub.mode=subscribe`, comprobando `hub.verify_token`, respondiendo con `hub.challenge`).
   - `POST /api/webhooks/whatsapp` para los eventos. Debe responder **200 lo antes posible** y procesar el mensaje en background; si tardas, Meta reintenta hasta 7 dÃ­as.
   - Verifica la firma `X-Hub-Signature-256` con HMAC-SHA256 usando el `APP_SECRET`.
   - Implementa idempotencia por `message.id` (Meta puede reenviar el mismo evento).
   - **mTLS / trust store:** desde el 31 de marzo de 2026 Meta firma sus llamadas a webhooks con una nueva CA interna. Si despliegas en Vercel esto estÃ¡ cubierto por su trust store gestionado, pero si en algÃºn momento se autohospeda (Docker, EC2, etc.), el sistema debe confiar en la nueva Meta Internal CA o el handshake TLS fallarÃ¡ y dejarÃ¡s de recibir eventos. DocumÃ©ntalo en el README.
3. **Vercel AI SDK 6:** usa `generateText` / `streamText` con `tools` definidas mediante `tool({ inputSchema: z.object({...}), execute: async ... })`. Para el loop multi-step usa el parÃ¡metro `stopWhen: stepCountIs(N)` para permitir varios turnos de tool-use seguidos.
4. **Modelo:** instancia con `anthropic('claude-sonnet-4-6')`. No uses alias tipo `claude-sonnet-latest` en producciÃ³n.

---

## Arquitectura general

```
[Cliente WhatsApp] â”€â”€> [Meta Cloud API] â”€â”€webhookâ”€â”€> [Next.js /api/webhooks/whatsapp]
                                                          â”‚
                                                          â”œâ”€> Verifica firma HMAC
                                                          â”œâ”€> Persiste mensaje (Supabase)
                                                          â”œâ”€> Si bot activo:
                                                          â”‚     â””â”€> Agente IA (AI SDK + Sonnet 4.6)
                                                          â”‚           â”œâ”€ tool: get_available_slots (Google Calendar)
                                                          â”‚           â”œâ”€ tool: book_appointment (Google Calendar + Supabase)
                                                          â”‚           â”œâ”€ tool: collect_patient_info
                                                          â”‚           â””â”€ tool: request_human_handoff
                                                          â””â”€> EnvÃ­a respuesta vÃ­a Graph API

[DueÃ±o del negocio] â”€â”€> [Dashboard Next.js] â”€â”€> [Supabase Auth + Postgres]
                                                  â””â”€ rutas: dashboard, citas, conversaciones, personalizaciÃ³n
```

Multi-tenant desde el dÃ­a uno: cada usuario autenticado pertenece a una `organization` y todas las tablas llevan `organization_id` con RLS.

---

## Esquema de base de datos (Supabase / Postgres)

Crea migraciones SQL en `/supabase/migrations/`. Habilita RLS en todas las tablas y crea polÃ­ticas que filtren por `organization_id` del usuario autenticado.

```sql
-- organizations: cuenta del negocio (clÃ­nica dental, otro negocio, etc.)
organizations (
  id uuid pk default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz default now()
)

-- profiles: extiende auth.users de Supabase, vincula a organization
profiles (
  id uuid pk references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  full_name text,
  role text check (role in ('owner','staff')) default 'owner',
  created_at timestamptz default now()
)

-- whatsapp_configs: credenciales por organizaciÃ³n
whatsapp_configs (
  organization_id uuid pk references organizations(id) on delete cascade,
  phone_number_id text not null,         -- Phone Number ID de Meta
  waba_id text not null,                 -- WhatsApp Business Account ID
  access_token_encrypted text not null,  -- cifrado con pgsodium o envelope
  verify_token text not null,
  app_secret_encrypted text not null,
  updated_at timestamptz default now()
)

-- google_calendar_configs: tokens OAuth por organizaciÃ³n
google_calendar_configs (
  organization_id uuid pk references organizations(id) on delete cascade,
  calendar_id text not null,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  token_expires_at timestamptz,
  updated_at timestamptz default now()
)

-- agent_configs: personalizaciÃ³n del prompt y datos del negocio
agent_configs (
  organization_id uuid pk references organizations(id) on delete cascade,
  system_prompt text not null,           -- prompt editable por el usuario
  tone text not null default 'profesional y cÃ¡lido',
  business_info jsonb not null default '{}'::jsonb,  -- horarios, servicios, direcciÃ³n, FAQ, etc.
  services jsonb not null default '[]'::jsonb,        -- [{name, duration_minutes, description}]
  business_hours jsonb not null default '{}'::jsonb,  -- {mon:[{start,end}], ...}
  handoff_message text default 'Te paso con un humano en un momento.',
  updated_at timestamptz default now()
)

-- contacts: clientes que han escrito por WhatsApp
contacts (
  id uuid pk default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  wa_phone text not null,                -- E.164, ej +5218112345678
  full_name text,
  is_new_patient boolean,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (organization_id, wa_phone)
)

-- conversations: hilo por contacto
conversations (
  id uuid pk default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  bot_active boolean default true,        -- toggle handoff humano
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
)

-- messages: cada mensaje (entrante o saliente)
messages (
  id uuid pk default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  wa_message_id text,                    -- id de Meta, para idempotencia
  direction text check (direction in ('inbound','outbound')) not null,
  sender text check (sender in ('contact','bot','human')) not null,
  content text,
  raw jsonb,                             -- payload original de Meta
  created_at timestamptz default now(),
  unique (wa_message_id)
)

-- appointments: citas agendadas
appointments (
  id uuid pk default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  service text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_event_id text,
  status text check (status in ('confirmed','cancelled','completed')) default 'confirmed',
  is_new_patient boolean,
  full_name text not null,
  phone text not null,
  notes text,
  created_at timestamptz default now()
)
```

Ãndices recomendados en `messages(conversation_id, created_at desc)`, `conversations(organization_id, last_message_at desc)`, `appointments(organization_id, starts_at)`.

---

## Flujo de conversaciÃ³n del agente IA

Implementa el agente como un loop de tool-use con AI SDK. El system prompt base lo genera la app combinando `agent_configs.system_prompt` + `tone` + `business_info` + `services` + `business_hours` y se inyecta en cada llamada.

### Comportamiento esperado

1. **Cliente escribe a WhatsApp** â†’ llega al webhook â†’ si `conversation.bot_active = true` se invoca al agente.
2. **El agente saluda y pregunta el motivo** (sÃ³lo si es el primer mensaje del hilo o ha pasado un umbral de inactividad).
3. **Si quiere cita** â†’ pregunta servicio. Servicios por defecto en clÃ­nica dental: `limpieza`, `empaste`, `blanqueamiento`. Pero deben venir de `agent_configs.services` para que sirva en otros negocios.
4. **Sugiere 3 huecos libres** de la prÃ³xima semana llamando a la tool `get_available_slots`.
5. **Recolecta los datos requeridos** (ver mÃ¡s abajo).
6. **Confirma cita** y llama a `book_appointment` (graba en Supabase + crea evento en Google Calendar).
7. **Si no entiende o el cliente lo pide** â†’ llama a `request_human_handoff`, que pone `conversations.bot_active = false` y envÃ­a el `handoff_message` al cliente. A partir de ese punto el agente no responde a ese hilo hasta que el dueÃ±o reactive el bot desde el dashboard.

### Datos a recoger por cita

- Nombre completo (del cliente, recolectado en chat)
- TelÃ©fono (lo obtiene automÃ¡ticamente del payload del webhook, no se pregunta)
- Servicio (elegido entre los configurados)
- Fecha/hora preferida (debe coincidir con un slot disponible real)
- Â¿Es nuevo paciente? (sÃ­/no, configurable en plantilla por si otro negocio no lo necesita)

### Tools del agente (todas en `/lib/agent/tools/`)

Define con `tool({ description, inputSchema: z.object({...}), execute })`:

- **`get_available_slots`** â€” input: `{ service: string, days_ahead?: number = 7 }`. Lee `business_hours` y consulta Google Calendar (FreeBusy query) para devolver 3 slots libres respetando la duraciÃ³n del servicio. Devuelve ISO strings en la timezone del `organization`.
- **`book_appointment`** â€” input: `{ full_name, service, starts_at, is_new_patient }`. Crea evento en Google Calendar y registro en `appointments`. Idempotente: si ya existe una cita en ese slot para ese contacto, no duplica.
- **`save_contact_info`** â€” input: `{ full_name?, is_new_patient? }`. Actualiza `contacts`.
- **`request_human_handoff`** â€” input: `{ reason?: string }`. Setea `bot_active = false`, envÃ­a `handoff_message`, y deberÃ­a notificar al dueÃ±o (vÃ­a Supabase Realtime al dashboard para esta primera versiÃ³n; deja un TODO para email/push).

Configura el agente con `stopWhen: stepCountIs(8)` para permitir varias rondas de tools, y `temperature: 0.3`.

---

## App web (Next.js 16.2.6)

### Estructura de rutas (App Router)

```
/app
  /(marketing)
    /page.tsx                 -> landing pÃºblica
  /(auth)
    /login/page.tsx
    /signup/page.tsx
    /callback/route.ts        -> Supabase auth callback
  /(app)
    /layout.tsx               -> shell con sidebar (Phosphor icons)
    /dashboard/page.tsx
    /citas/page.tsx
    /conversaciones/page.tsx
    /conversaciones/[id]/page.tsx
    /personalizacion/page.tsx
    /integraciones/page.tsx   -> conectar WhatsApp y Google Calendar
  /api
    /webhooks/whatsapp/route.ts
    /webhooks/google/route.ts (opcional, para cambios en el calendario)
    /auth/google/callback/route.ts
```

### AutenticaciÃ³n

- Supabase Auth con email + magic link y/o password.
- Middleware (`middleware.ts`) que protege `/(app)` y redirige a `/login` si no hay sesiÃ³n.
- Al hacer signup, se crea automÃ¡ticamente una `organization` y se enlaza el `profile`.
- Cliente Supabase server-side en Server Components usando `@supabase/ssr`.

### Dashboard (`/dashboard`)

Server Component que muestra:

- **KPI 1:** nÃºmero de conversaciones Ãºnicas en los Ãºltimos 30 dÃ­as (count distinct sobre `conversations.last_message_at`).
- **KPI 2:** citas agendadas durante la semana actual (lunes-domingo en la timezone de la organizaciÃ³n).
- GrÃ¡fico opcional: conversaciones por dÃ­a Ãºltimos 30 dÃ­as.
- Lista de Ãºltimas 5 conversaciones con link a `/conversaciones/[id]`.

### Citas (`/citas`)

Calendario interactivo (mensual/semanal) mostrando las `appointments` del usuario. Sin librerÃ­as pesadas: implementa una grilla con Tailwind o usa `react-big-calendar` si lo prefieres (decide y documenta). Click en cita abre modal con detalle (nombre, telÃ©fono, servicio, si es nuevo paciente, notas). Permitir cambiar status a `cancelled` o `completed`. Estos cambios deben sincronizarse con Google Calendar.

### Conversaciones (`/conversaciones`)

- Lista de conversaciones a la izquierda (avatar inicial, nombre/telÃ©fono, Ãºltimo mensaje, badge si bot inactivo).
- Detalle a la derecha con burbujas tipo chat (entrantes izquierda, salientes derecha, distinguir bot vs humano con color/icono).
- **Toggle "Bot activo"** en la cabecera de la conversaciÃ³n: al desactivar, el bot deja de responder ese hilo. Al volver a activar, retoma.
- **Input de mensaje** para que el dueÃ±o escriba como humano y se envÃ­e vÃ­a Cloud API. Estos mensajes se guardan con `sender = 'human'`.
- ActualizaciÃ³n en tiempo real con Supabase Realtime (canales por `conversation_id`).

### PersonalizaciÃ³n (`/personalizacion`)

Formulario con Server Actions que edita `agent_configs`:

- Textarea grande para el **system prompt** (con un template por defecto orientado a clÃ­nica dental que el usuario puede editar).
- Selector / texto libre para **tono de voz**.
- Editor de **informaciÃ³n del negocio** (nombre, direcciÃ³n, horarios, FAQ libre, polÃ­ticas de cancelaciÃ³n, etc.) â€” usa un editor JSON estructurado o campos individuales agrupados.
- Editor de **servicios**: lista editable con nombre, duraciÃ³n en minutos y descripciÃ³n.
- Editor de **horarios de atenciÃ³n**: por dÃ­a de la semana, rangos `start`-`end`.
- BotÃ³n "Probar agente" que abre un sandbox de chat para charlar con el agente sin enviar a WhatsApp (Ãºtil para validar el prompt).

### Integraciones (`/integraciones`)

- **WhatsApp:** formulario para meter `phone_number_id`, `waba_id`, `access_token`, `verify_token`, `app_secret`. BotÃ³n "Probar conexiÃ³n" que pega al endpoint `/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}` para verificar. Mostrar la URL del webhook a copiar y el verify token.
- **Google Calendar:** botÃ³n "Conectar con Google" que arranca OAuth (`scope=https://www.googleapis.com/auth/calendar`). Almacenar `refresh_token` cifrado. Listar calendarios disponibles y dejar elegir el `calendar_id` a usar.

---

## Endpoint del webhook de WhatsApp (lo mÃ¡s crÃ­tico)

`/app/api/webhooks/whatsapp/route.ts` con `export const runtime = 'nodejs'` (no edge: necesitas crypto nativo para HMAC y la operaciÃ³n puede tomar tiempo) y `export const dynamic = 'force-dynamic'`.

```ts
// GET: verificaciÃ³n
// - Lee mode/token/challenge de query string.
// - Para multi-tenant: el verify_token debe identificar a la organization.
//   Usa el formato "{org_slug}:{secret}" o un mapeo en BD.

// POST:
// 1. Lee raw body (sin parsear) para verificar firma X-Hub-Signature-256.
// 2. Resuelve organization a partir de phone_number_id del payload.
// 3. Devuelve 200 inmediatamente.
// 4. En after() / waitUntil(): procesa el mensaje:
//    - upsert contact por (organization_id, wa_phone)
//    - upsert conversation
//    - insertar message con wa_message_id (ignorar si ya existe)
//    - si bot_active: llamar al agente
//    - enviar respuesta vÃ­a Graph API y registrar message outbound
```

Usa `after()` de Next.js 16 para el procesamiento asÃ­ncrono tras responder 200.

---

## Variables de entorno

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=

# Cifrado de tokens en BD
ENCRYPTION_KEY=   # 32 bytes base64, para AES-256-GCM en /lib/crypto.ts

# App
NEXT_PUBLIC_APP_URL=
```

Las credenciales de WhatsApp se guardan **por organizaciÃ³n** en BD, no en env vars (multi-tenant).

---

## Seguridad y producciÃ³n

- **RLS habilitado** en todas las tablas. Para operaciones del webhook (que no tiene sesiÃ³n de usuario) usa `service_role_key` desde el servidor y filtra por `organization_id` resuelto desde `phone_number_id`.
- **Cifrado en BD** de todos los tokens (access tokens, refresh tokens, app secrets) con AES-256-GCM. Implementa helpers `encrypt()` / `decrypt()` en `/lib/crypto.ts`.
- **Logs estructurados** (JSON) en el webhook con `wa_message_id`, `organization_id`, latencia, errores.

---

## Entregables

1. Repositorio Next.js 16.2.6 listo para `pnpm install && pnpm dev`.
2. Migraciones SQL completas en `/supabase/migrations/` (con seed mÃ­nimo para desarrollo).
3. **README.md** con: setup local, cÃ³mo configurar la app de Meta paso a paso (verificaciÃ³n, permisos, nÃºmero de prueba, webhook), cÃ³mo configurar OAuth de Google, variables de entorno, cÃ³mo desplegar en Vercel, y un diagrama de arquitectura.
4. Sin claves hard-coded. Sin `any` (excepto cuando sea estrictamente necesario y comentado).
5. Tipos TypeScript de la BD generados con `supabase gen types typescript` en `/lib/database.types.ts`.

---

## DocumentaciÃ³n oficial de referencia

Si necesitas consultar la documentaciÃ³n actualizada (es altamente recomendable hacerlo antes de implementar cada integraciÃ³n, ya que las APIs cambian), estas son las fuentes primarias verificadas:

### Next.js 16.2.6
- **App Router (raÃ­z de la documentaciÃ³n):** https://nextjs.org/docs/app
- **GuÃ­a de upgrade a Next.js 16:** https://nextjs.org/docs/app/guides/upgrading/version-16
- **Blog post de Next.js 16 (Cache Components, View Transitions, etc.):** https://nextjs.org/blog/next-16
- **Ãndice de documentaciÃ³n en formato Markdown (Ãºtil para LLMs):** https://nextjs.org/docs/llms.txt

### WhatsApp Cloud API (Meta) â€” Graph API v25.0
- **DocumentaciÃ³n raÃ­z de WhatsApp Cloud API:** https://developers.facebook.com/docs/whatsapp/cloud-api/
- **Setup de webhooks (verificaciÃ³n, eventos, firmas):** https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- **Changelog y versiones del Graph API:** https://developers.facebook.com/docs/graph-api/changelog
- **Plataforma de WhatsApp Business (visiÃ³n general):** https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- **Postman Collection oficial de Meta (probar endpoints):** https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- **Notas de v25 (mTLS, Page Viewer Metric, deprecaciones):** https://web.swipeinsight.app/posts/facebook-launches-graph-api-v25-and-marketing-api-v25-updates-22544

> Importante: Meta libera una nueva versiÃ³n del Graph API cada ~3 meses. Antes de hacer deploy, verifica en el changelog que `v25.0` siga siendo la versiÃ³n vigente recomendada y no haya salido una superior estable.

### Vercel AI SDK 6 + Anthropic
- **DocumentaciÃ³n raÃ­z del AI SDK:** https://ai-sdk.dev/docs/introduction
- **Provider de Anthropic (modelos, tools, advisor, beta headers):** https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- **Anuncio de AI SDK 6 (agents, tool approval, MCP, DevTools):** https://vercel.com/blog/ai-sdk-6
- **GuÃ­a oficial de Vercel para construir agentes:** https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk
- **Repositorio en GitHub (ejemplos, cÃ³digo fuente, skill para coding agents):** https://github.com/vercel/ai

### Otras dependencias del stack
- **TailwindCSS v4:** https://tailwindcss.com/docs

---

## Plan de implementaciÃ³n sugerido (sigue este orden)

1. Bootstrap Next.js 16.2.6 + Tailwind + Phosphor + Supabase client.
2. Migraciones SQL + tipos + cliente Supabase server/browser.
3. Auth (signup/login/logout + middleware + onboarding que crea `organization`).
4. Shell del app (sidebar, layout, rutas vacÃ­as).
5. PÃ¡gina de Integraciones (guardar credenciales de WhatsApp + OAuth Google).
6. Webhook de WhatsApp (sÃ³lo recibir y guardar, sin agente todavÃ­a) â€” probar con la consola de pruebas de Meta.
7. Enviar mensajes outbound (helper `sendWhatsAppMessage`).
8. Agente IA con AI SDK + tools + persistencia del historial.
9. IntegraciÃ³n Google Calendar (FreeBusy + crear evento).
10. PÃ¡gina de Conversaciones con Realtime + toggle bot + envÃ­o manual.
11. PÃ¡gina de Citas (calendario).
12. PÃ¡gina de PersonalizaciÃ³n.
13. PÃ¡gina de Dashboard con KPIs.
14. Pulido, docs, deploy en Vercel.

---

## Criterios de aceptaciÃ³n

- Un mensaje de WhatsApp al nÃºmero de la clÃ­nica recibe respuesta del agente en menos de 5 segundos en condiciones normales.
- El agente recopila los 5 datos antes de confirmar la cita.
- La cita aparece simultÃ¡neamente en Google Calendar y en `/citas`.
- Si el dueÃ±o desactiva el bot en una conversaciÃ³n, los siguientes mensajes del cliente **no** son respondidos por el agente y aparecen en tiempo real en `/conversaciones/[id]`.
- Cambiar el prompt en `/personalizacion` afecta la siguiente respuesta del agente.
- Toda la informaciÃ³n de un negocio estÃ¡ aislada de la de otro (probar con dos organizaciones distintas).
- El webhook responde 200 incluso cuando el procesamiento posterior falla; los errores se loguean.