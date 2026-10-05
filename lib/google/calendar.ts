// Cliente de Google Calendar autenticado con refresh_token cifrado.

import { google, calendar_v3 } from "googleapis";
import { getOAuthClient } from "./oauth";
import { decrypt, encrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type GCalConfig = {
  organization_id: string;
  calendar_id: string;
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  token_expires_at: string | null;
};

function calendarClient(config: GCalConfig): calendar_v3.Calendar {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    refresh_token: decrypt(config.refresh_token_encrypted),
    access_token: config.access_token_encrypted ? decrypt(config.access_token_encrypted) : undefined,
    expiry_date: config.token_expires_at ? new Date(config.token_expires_at).getTime() : undefined,
  });

  // Al refrescar el token, persistir el nuevo access_token cifrado.
  oauth2.on("tokens", async (t) => {
    if (t.access_token) {
      const admin = createAdminClient();
      await admin
        .from("google_calendar_configs")
        .update({
          access_token_encrypted: encrypt(t.access_token),
          token_expires_at: t.expiry_date ? new Date(t.expiry_date).toISOString() : null,
        })
        .eq("organization_id", config.organization_id);
    }
  });

  return google.calendar({ version: "v3", auth: oauth2 });
}

export async function getFreeBusy(config: GCalConfig, timeMin: string, timeMax: string) {
  const cal = calendarClient(config);
  const { data } = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: config.calendar_id }],
    },
  });
  return data.calendars?.[config.calendar_id]?.busy ?? [];
}

// Convierte un timestamp UTC a la representación wall-clock (sin Z) en la
// zona horaria dada. Google Calendar interpreta ese wall-clock literal como
// hora local del timeZone que le pasamos, así el evento se muestra igual
// para todo viewer sin depender del calendario destino.
function toLocalWallClockIso(isoUtc: string, timezone: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const h = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}`;
}

export async function createEvent(
  config: GCalConfig,
  args: {
    summary: string;
    description?: string;
    start: string; // ISO UTC
    end: string; // ISO UTC
    timezone: string;
    attendee_phone?: string;
  },
) {
  const cal = calendarClient(config);
  const { data } = await cal.events.insert({
    calendarId: config.calendar_id,
    requestBody: {
      summary: args.summary,
      description: args.description,
      start: {
        dateTime: toLocalWallClockIso(args.start, args.timezone),
        timeZone: args.timezone,
      },
      end: {
        dateTime: toLocalWallClockIso(args.end, args.timezone),
        timeZone: args.timezone,
      },
      extendedProperties: args.attendee_phone
        ? { private: { whatsapp_phone: args.attendee_phone } }
        : undefined,
    },
  });
  return data.id!;
}

export async function updateEventStatus(
  config: GCalConfig,
  eventId: string,
  status: "confirmed" | "cancelled",
) {
  const cal = calendarClient(config);
  if (status === "cancelled") {
    await cal.events.delete({ calendarId: config.calendar_id, eventId });
  }
}

export async function listCalendars(refreshToken: string) {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const { data } = await cal.calendarList.list();
  return (data.items ?? []).map((c) => ({
    id: c.id!,
    summary: c.summary ?? c.id!,
    primary: c.primary ?? false,
  }));
}

// ---------------------------------------------------------------------------
// Errores de autenticación con Google.
// Si la app de OAuth está en modo "Testing" en Google Cloud, el refresh_token
// caduca a los 7 días → Google responde `invalid_grant` y hay que reconectar.
// ---------------------------------------------------------------------------

export const GCAL_RECONNECT_MESSAGE =
  "Google Calendar está desconectado (el permiso ha caducado o se ha revocado). Hay que reconectarlo en Integraciones.";

export function isGoogleAuthError(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } }; code?: number | string };
  const msg = `${e?.message ?? ""} ${e?.response?.data?.error ?? ""}`.toLowerCase();
  return (
    msg.includes("invalid_grant") ||
    msg.includes("invalid_client") ||
    msg.includes("unauthorized_client") ||
    msg.includes("invalid credentials") ||
    e?.code === 401
  );
}

// Mensaje para el modelo cuando falla una tool de calendario.
export function calendarToolError(err: unknown): { ok: false; error: string } {
  if (isGoogleAuthError(err)) {
    return {
      ok: false,
      error:
        GCAL_RECONNECT_MESSAGE +
        " No puedes consultar ni reservar en la agenda ahora. Dile al cliente con naturalidad que un agente le confirmará la cita personalmente, guarda su nombre y teléfono con save_contact_info y llama a request_human_handoff con un resumen (propiedad, tipo de visita y día/hora que pidió).",
    };
  }
  return {
    ok: false,
    error: `Error de Google Calendar: ${(err as Error)?.message ?? "desconocido"}. Si vuelve a fallar, usa request_human_handoff con el día/hora que pidió el cliente.`,
  };
}

// Comprueba si la conexión sigue viva (para el panel de Integraciones).
export async function checkGoogleConnection(
  config: GCalConfig,
): Promise<{ ok: true } | { ok: false; reconnect: boolean; error: string }> {
  try {
    const oauth2 = getOAuthClient();
    oauth2.setCredentials({ refresh_token: decrypt(config.refresh_token_encrypted) });
    await oauth2.getAccessToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, reconnect: isGoogleAuthError(err), error: (err as Error).message };
  }
}
