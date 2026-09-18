# WhatsApp Agent — SaaS multi-tenant

Plataforma que actúa como agente IA de atención al cliente vía WhatsApp para clínicas dentales (y otros negocios con agendamiento de citas). Incluye webhook + dashboard web.

Stack: **Next.js 16.2.6**, TypeScript strict, **TailwindCSS v4**, **Supabase** (Postgres + Auth + RLS), **Vercel AI SDK 6** con Anthropic **Claude Sonnet 4.6**, **WhatsApp Cloud API v25.0**, **Google Calendar API**.

Ver [PROMPT.md](PROMPT.md) para el brief completo del proyecto y [CLAUDE.md](CLAUDE.md) para las reglas persistentes que el agente de código debe respetar.

---

## Requisitos

- Node.js 22 (`.nvmrc`)
- pnpm 9+
- Cuenta de [Supabase](https://supabase.com) con Supabase CLI instalada (`npm i -g supabase`)
- Cuenta de [Anthropic](https://console.anthropic.com/) con API key
- Cuenta de [Meta for Developers](https://developers.facebook.com/) con app de WhatsApp Business
- Proyecto en [Google Cloud Console](https://console.cloud.google.com/) con OAuth 2.0 configurado

---

## Setup local paso a paso

### 1. Clonar e instalar

```bash
pnpm install
```

### 2. Copiar variables de entorno

```bash
cp .env.example .env.local
```

Luego rellena `.env.local`. Para generar la `ENCRYPTION_KEY` (AES-256-GCM):

```bash
pnpm gen:key
```

Copia el output a `ENCRYPTION_KEY=` en `.env.local`.

### 3. Crear proyecto Supabase y aplicar migraciones

1. En [supabase.com/dashboard](https://supabase.com/dashboard) crea un nuevo proyecto.
2. Copia `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al `.env.local`.
3. Ejecuta las migraciones:

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Esto crea todas las tablas con RLS + índices + triggers, incluyendo el trigger que autocrea `organization` + `profile` + `agent_config` al hacer signup.

4. **Habilita Realtime** en el dashboard de Supabase → Database → Replication → habilita las tablas `messages` y `conversations` (ya las agrega la migración al publication, pero verifica).

5. (Opcional) Regenera los tipos de TypeScript:

```bash
pnpm gen:types
```

### 4. Configurar Anthropic

Crea tu API key en [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) y colócala en `ANTHROPIC_API_KEY`.

### 5. Configurar Google OAuth (Calendar)

1. Ve a [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Crea una **OAuth 2.0 Client ID** (Web application).
3. En **Authorized redirect URIs** añade: `http://localhost:3000/api/auth/google/callback` (y el de producción).
4. Habilita la **Google Calendar API** en el proyecto.
5. Copia `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` a `.env.local`.

### 6. Configurar la app de Meta (WhatsApp Cloud API)

1. Ve a [Meta for Developers](https://developers.facebook.com/apps) y crea una app tipo **Business**.
2. Añade el producto **WhatsApp**. Meta te da un **número de prueba** y un **Phone Number ID**.
3. En **App settings → Basic** copia el **App Secret**.
4. Crea un **System User** en el Business Manager y genera un **System User Access Token** con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
5. En **WhatsApp → Configuration → Webhook** apunta la **Callback URL** a `https://TU-DOMINIO.vercel.app/api/webhooks/whatsapp` (necesita HTTPS público — usa [ngrok](https://ngrok.com/) para desarrollo).
6. El **Verify token** debe tener el formato `{slug-de-tu-organizacion}:{secreto-random}`. El slug se genera automáticamente al hacer signup (lo ves en `/integraciones`).
7. Suscríbete al webhook para el campo `messages`.

> ℹ️ **mTLS (importante para autohosted):** desde el 31 de marzo de 2026 Meta firma llamadas a webhooks con una nueva CA interna. Vercel gestiona su trust store. Si en algún momento migras a servidor propio (Docker, EC2), asegúrate de confiar en la **Meta Internal CA** o el TLS handshake fallará.

### 7. Arrancar dev server

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000). Crea tu cuenta en `/signup`, ve a `/integraciones` y guarda las credenciales de WhatsApp; después haz click en **Conectar con Google**.

---

## Flujo end-to-end

1. Cliente envía un WhatsApp al número.
2. Meta llama al webhook → verifica firma → guarda mensaje → responde 200.
3. `after()` ejecuta el agente en background:
   - Combina system prompt (personalizable) + info del negocio.
   - Loop con AI SDK 6 + tools (`get_available_slots`, `book_appointment`, `save_contact_info`, `request_human_handoff`).
   - Envía la respuesta por Cloud API.
4. Todo se refleja en tiempo real en `/conversaciones/[id]` (Supabase Realtime).
5. El dueño puede **pausar el bot** en cualquier hilo desde el dashboard y responder manualmente.

---

## Despliegue en Vercel

1. Sube el repo a GitHub y conéctalo en Vercel.
2. Añade **todas** las env vars de `.env.local` en Vercel Project Settings → Environment Variables.
3. Actualiza `NEXT_PUBLIC_APP_URL` y `GOOGLE_OAUTH_REDIRECT_URI` con tu dominio de Vercel.
4. Añade el nuevo redirect URI en Google Cloud Console.
5. En la app de Meta, actualiza la **Callback URL** del webhook al dominio de Vercel.
6. Despliega. El webhook usa `runtime = 'nodejs'` (fluid compute).

---

## Arquitectura

```
[Cliente WhatsApp] ──> [Meta Cloud API] ──webhook──> [Next.js /api/webhooks/whatsapp]
                                                        │
                                                        ├─ Verifica X-Hub-Signature-256 (HMAC-SHA256)
                                                        ├─ Resuelve org por phone_number_id
                                                        ├─ Persiste mensaje (idempotente por wa_message_id)
                                                        ├─ Responde 200 inmediatamente
                                                        └─ after() ejecuta el agente:
                                                              ├─ AI SDK 6 + Claude Sonnet 4.6
                                                              ├─ Tools: slots, book, save, handoff
                                                              └─ Google Calendar (FreeBusy + insert event)

[Dueño] ──> [Dashboard Next.js] ──> [Supabase Auth + RLS + Realtime]
              ├─ /dashboard         KPIs
              ├─ /citas             calendario
              ├─ /conversaciones    chat con Realtime + toggle bot
              ├─ /personalizacion   prompt, tono, servicios, horarios
              └─ /integraciones     credenciales de WhatsApp + Google
```

**Aislamiento multi-tenant:** cada tabla tiene `organization_id` y RLS activo. Las políticas filtran usando el `profiles.organization_id` del usuario autenticado. El webhook usa `service_role_key` (bypass RLS) pero filtra manualmente por el `organization_id` derivado del `phone_number_id`.

---

## Estructura del código

```
app/
  (marketing)/page.tsx          Landing
  (auth)/                       login, signup, callback
  (app)/                        Dashboard, citas, conversaciones, personalización, integraciones
  api/
    webhooks/whatsapp/route.ts  Webhook Cloud API (GET verify + POST con HMAC)
    auth/google/                OAuth 2.0 flow

lib/
  constants.ts                  GRAPH_API_VERSION, ANTHROPIC_MODEL, etc.
  crypto.ts                     AES-256-GCM (tokens en BD)
  database.types.ts             Tipos de Supabase (regenera con pnpm gen:types)
  supabase/                     server / browser / admin / middleware
  whatsapp/                     send + verificación de firma
  google/                       OAuth + Calendar client
  agent/
    run-agent.ts                Loop AI SDK 6 con stopWhen: stepCountIs(8)
    system-prompt.ts            Ensamble del system prompt
    tools/                      4 tools del agente

supabase/migrations/            SQL: schema + RLS + trigger de signup

scripts/gen-encryption-key.mjs  Genera ENCRYPTION_KEY base64
```

---

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Dev server en :3000 |
| `pnpm build` | Build de producción |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm gen:key` | Genera clave AES-256-GCM |
| `pnpm gen:types` | Regenera `lib/database.types.ts` desde Supabase |

---

## Notas / TODOs

- **Cifrado**: helpers `encrypt()`/`decrypt()` usan AES-256-GCM con clave en env. Guardan `base64(iv || authTag || ciphertext)`.
- **Idempotencia**: `messages.wa_message_id` es UNIQUE — Meta puede reenviar el mismo evento.
- **Handoff**: cuando `conversations.bot_active = false`, el webhook procesa/guarda el mensaje pero **no** invoca al agente.
- **TODOs pendientes**: notificaciones (push/email) al dueño cuando se pide handoff; sandbox "Probar agente" en `/personalizacion`; refresh automático de tokens de Google (parcialmente resuelto por el listener `tokens` en `lib/google/calendar.ts`).
