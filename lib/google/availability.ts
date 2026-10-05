// Ocupación de la agenda y sincronización con Google Calendar.
// La reserva NUNCA depende de Google: si Google no responde (p. ej. permiso
// caducado), usamos las citas guardadas en la app para saber qué está ocupado,
// se reserva igualmente y el evento se crea en Google al reconectar.

import { createAdminClient } from "@/lib/supabase/admin";
import { formatInTz } from "@/lib/format-date";
import { createEvent, getFreeBusy, isGoogleAuthError, type GCalConfig } from "./calendar";

export type BusyRange = { start: string; end: string };

async function appointmentsBusy(organization_id: string, timeMin: string, timeMax: string): Promise<BusyRange[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("organization_id", organization_id)
    .eq("status", "confirmed")
    .lt("starts_at", timeMax)
    .gt("ends_at", timeMin);
  return (data ?? []).map((a) => ({ start: a.starts_at, end: a.ends_at }));
}

// Ocupado = Google Calendar (si responde) + citas de la app (siempre).
export async function getBusy(
  organization_id: string,
  gcal: GCalConfig | null,
  timeMin: string,
  timeMax: string,
): Promise<{ busy: BusyRange[]; google: "ok" | "disconnected" | "error" | "not_connected" }> {
  const own = await appointmentsBusy(organization_id, timeMin, timeMax);
  if (!gcal) return { busy: own, google: "not_connected" };
  try {
    const g = await getFreeBusy(gcal, timeMin, timeMax);
    const fromGoogle = g.filter((b) => b.start && b.end).map((b) => ({ start: b.start!, end: b.end! }));
    return { busy: [...fromGoogle, ...own], google: "ok" };
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "google freebusy failed", organization_id, err: (err as Error).message }));
    return { busy: own, google: isGoogleAuthError(err) ? "disconnected" : "error" };
  }
}

export function overlaps(busy: BusyRange[], startMs: number, endMs: number): boolean {
  return busy.some((b) => startMs < new Date(b.end).getTime() && endMs > new Date(b.start).getTime());
}

type EventInput = {
  full_name: string;
  phone: string;
  wa_phone?: string | null;
  visit_type: string;
  notes?: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  property?: {
    title: string;
    reference: string | null;
    location: string;
    agent_name?: string | null;
    agent_phone?: string | null;
  } | null;
};

export function buildEvent(a: EventInput, timezone: string) {
  const kind = a.visit_type === "video_call" ? "Video llamada" : a.visit_type === "llamada" ? "Llamada" : "Visita";
  return {
    summary: `${kind}${a.property ? ` · ${a.property.title}` : ""} — ${a.full_name}`,
    description: [
      `Cliente: ${a.full_name}`,
      `Teléfono: ${a.phone}`,
      a.wa_phone && a.wa_phone !== a.phone ? `WhatsApp: ${a.wa_phone}` : null,
      a.property?.reference ? `Referencia: ${a.property.reference}` : null,
      a.property ? `Ubicación: ${a.property.location}` : null,
      a.property?.agent_name ? `Agente asignado: ${a.property.agent_name}` : null,
      a.property?.agent_phone ? `Teléfono agente: ${a.property.agent_phone}` : null,
      a.notes ? `Notas: ${a.notes}` : null,
      `Reservada el ${formatInTz(a.created_at, timezone, "datetime")} por WhatsApp`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: a.starts_at,
    end: a.ends_at,
    timezone,
  };
}

// Crea en Google las citas futuras que se reservaron mientras Google no estaba disponible.
export async function syncPendingAppointments(
  organization_id: string,
  gcal: GCalConfig,
  timezone: string,
): Promise<{ synced: number; failed: number }> {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("appointments")
    .select("id, full_name, phone, visit_type, notes, starts_at, ends_at, created_at, property:properties(title, reference, location, agent_name, agent_phone)")
    .eq("organization_id", organization_id)
    .eq("status", "confirmed")
    .is("google_event_id", null)
    .gt("starts_at", new Date().toISOString())
    .returns<Array<EventInput & { id: string; property: EventInput["property"] | EventInput["property"][] }>>();

  let synced = 0;
  let failed = 0;
  for (const a of pending ?? []) {
    const property = Array.isArray(a.property) ? a.property[0] : a.property;
    try {
      const eventId = await createEvent(gcal, buildEvent({ ...a, property }, timezone));
      await admin.from("appointments").update({ google_event_id: eventId }).eq("id", a.id).eq("organization_id", organization_id);
      synced++;
    } catch (err) {
      failed++;
      console.warn(JSON.stringify({ level: "warn", msg: "pending appointment sync failed", organization_id, appointment_id: a.id, err: (err as Error).message }));
      if (isGoogleAuthError(err)) break;
    }
  }
  return { synced, failed };
}
