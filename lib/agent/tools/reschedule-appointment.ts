// Cambia de hora (y opcionalmente de tipo) una visita existente en un solo paso:
// actualiza la cita en BD y MUEVE el mismo evento de Google Calendar (no crea
// uno nuevo ni deja el antiguo). Antes el modelo reservaba la nueva y a veces
// no cancelaba la anterior, quedando las dos en el calendario.

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEvent, moveEvent, type GCalConfig } from "@/lib/google/calendar";
import { buildEvent, getBusy, overlaps, type BusyRange } from "@/lib/google/availability";
import { notifyClientByEmail } from "@/lib/email/notify";
import { formatInTz, parseInTz } from "@/lib/format-date";
import { readMetadata } from "@/lib/contact-info";
import { visitLabel } from "./list-upcoming-appointments";

type ServiceType = { name: string; duration_minutes: number; description?: string };
type Prop = {
  title: string;
  reference: string | null;
  location: string;
  agent_name: string | null;
  agent_phone: string | null;
};

const SERVICE_BY_TYPE: Record<string, string> = {
  presencial: "visita presencial",
  video_call: "video llamada",
  llamada: "llamada informativa",
};

// Quita del "ocupado" el hueco de la propia cita que se mueve (si no, moverla
// 30 min se vería como solapada consigo misma).
function withoutInterval(busy: BusyRange[], startMs: number, endMs: number): BusyRange[] {
  const out: BusyRange[] = [];
  for (const b of busy) {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    if (be <= startMs || bs >= endMs) {
      out.push(b);
      continue;
    }
    if (bs < startMs) out.push({ start: b.start, end: new Date(startMs).toISOString() });
    if (be > endMs) out.push({ start: new Date(endMs).toISOString(), end: b.end });
  }
  return out;
}

export function makeRescheduleAppointmentTool(ctx: {
  organization_id: string;
  contact_id: string;
  conversation_id: string;
  contact_phone: string;
  // Solo Google Calendar (null si el plan no lo incluye o no está conectado).
  gcal: GCalConfig | null;
  // Conexión de Google para enviar emails con Gmail (todos los planes).
  mail: GCalConfig | null;
  timezone: string;
  services: ServiceType[];
}) {
  return tool({
    description:
      "Cambia una visita ya reservada a otro día/hora (y opcionalmente de tipo). Actualiza la cita y mueve el evento en Google Calendar automáticamente: NO uses book_visit + cancel_appointment para modificar. Antes: list_upcoming_appointments para el appointment_id y check_slot_availability o get_available_slots para el nuevo `starts_at_iso`.",
    inputSchema: z.object({
      appointment_id: z.string().uuid().describe("appointment_id devuelto por list_upcoming_appointments"),
      new_starts_at: z.string().describe("El `starts_at_iso` exacto del nuevo hueco (de check_slot_availability o get_available_slots)."),
      visit_type: z
        .string()
        .optional()
        .describe("Solo si el cliente cambia también el tipo: 'presencial' | 'video_call' | 'llamada'."),
    }),
    execute: async ({ appointment_id, new_starts_at, visit_type: rawType }) => {
      try {
        const admin = createAdminClient();
        const { data: appt } = await admin
          .from("appointments")
          .select(
            "id, starts_at, ends_at, status, visit_type, full_name, phone, notes, created_at, google_event_id, property:properties(title, reference, location, agent_name, agent_phone)",
          )
          .eq("id", appointment_id)
          .eq("organization_id", ctx.organization_id)
          .eq("contact_id", ctx.contact_id)
          .maybeSingle<{
            id: string;
            starts_at: string;
            ends_at: string;
            status: string;
            visit_type: string | null;
            full_name: string;
            phone: string;
            notes: string | null;
            created_at: string;
            google_event_id: string | null;
            property: Prop | Prop[] | null;
          }>();
        if (!appt) return { ok: false, error: "Cita no encontrada o no pertenece a este cliente. Usa list_upcoming_appointments." };
        if (appt.status !== "confirmed") return { ok: false, error: "Esa cita no está confirmada (cancelada o completada): no se puede modificar." };

        // Tipo de visita: el nuevo si lo pide, si no el actual.
        let visit_type = appt.visit_type ?? "presencial";
        if (rawType) {
          const vt = rawType.toLowerCase();
          visit_type = vt.includes("video") ? "video_call" : vt.includes("llamada") || vt.includes("call") || vt.includes("tel") ? "llamada" : "presencial";
        }
        const oldStartMs = new Date(appt.starts_at).getTime();
        const oldEndMs = new Date(appt.ends_at).getTime();
        const svc = ctx.services.find((s) => s.name.toLowerCase() === SERVICE_BY_TYPE[visit_type]);
        const durationMs =
          visit_type === appt.visit_type
            ? oldEndMs - oldStartMs
            : (svc?.duration_minutes ?? (visit_type === "presencial" ? 60 : 30)) * 60_000;

        const startMs = parseInTz(new_starts_at, ctx.timezone);
        if (Number.isNaN(startMs)) return { ok: false, error: "new_starts_at inválido" };
        if (startMs < Date.now()) return { ok: false, error: "Esa hora ya ha pasado. Ofrece otra con get_available_slots." };
        const endMs = startMs + durationMs;
        if (startMs === oldStartMs && visit_type === appt.visit_type) {
          return { ok: true, unchanged: true, local: formatInTz(startMs, ctx.timezone, "long") };
        }

        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();
        const { busy } = await getBusy(ctx.organization_id, ctx.gcal, startIso, endIso);
        if (overlaps(withoutInterval(busy, oldStartMs, oldEndMs), startMs, endMs)) {
          return { ok: false, available: false, error: "Ese horario está ocupado. Usa check_slot_availability o get_available_slots para ofrecer otra hora." };
        }

        // Google: mover el MISMO evento. Si no existe (o la cita no tenía), se crea.
        const property = Array.isArray(appt.property) ? appt.property[0] : appt.property;
        const { data: contactRow } = await admin
          .from("contacts")
          .select("metadata")
          .eq("id", ctx.contact_id)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle<{ metadata: unknown }>();
        const event = buildEvent(
          {
            full_name: appt.full_name,
            phone: appt.phone,
            email: readMetadata(contactRow?.metadata).email ?? null,
            wa_phone: ctx.contact_phone,
            visit_type,
            notes: appt.notes,
            starts_at: startIso,
            ends_at: endIso,
            created_at: appt.created_at,
            property: property ?? null,
          },
          ctx.timezone,
        );
        let googleEventId = appt.google_event_id;
        let google: "movido" | "creado" | "no conectado" | "error" = "no conectado";
        if (ctx.gcal) {
          try {
            const moved = googleEventId ? await moveEvent(ctx.gcal, googleEventId, event) : false;
            if (moved) google = "movido";
            else {
              googleEventId = await createEvent(ctx.gcal, { ...event, attendee_phone: ctx.contact_phone });
              google = "creado";
            }
          } catch (err) {
            google = "error";
            console.warn(
              JSON.stringify({ level: "warn", msg: "google move on reschedule failed", organization_id: ctx.organization_id, appointment_id, err: (err as Error).message }),
            );
          }
        }

        const { error: updErr } = await admin
          .from("appointments")
          .update({
            starts_at: startIso,
            ends_at: endIso,
            visit_type: visit_type as "presencial" | "video_call" | "llamada",
            service: SERVICE_BY_TYPE[visit_type] ?? "visita",
            google_event_id: googleEventId,
          })
          .eq("id", appt.id)
          .eq("organization_id", ctx.organization_id);
        if (updErr) return { ok: false, error: updErr.message };

        const propertyLabel = property ? (property.reference ? `${property.title} (Ref. ${property.reference})` : property.title) : null;
        const emailResult = await notifyClientByEmail({
          organization_id: ctx.organization_id,
          contact_id: ctx.contact_id,
          conversation_id: ctx.conversation_id,
          gcal: ctx.mail,
          email: {
            kind: "visit_rescheduled",
            previous: formatInTz(oldStartMs, ctx.timezone, "long"),
            when: formatInTz(startMs, ctx.timezone, "long"),
            visit: visitLabel(visit_type),
            property: propertyLabel,
          },
        });

        return {
          ok: true,
          appointment_id: appt.id,
          previous_local: formatInTz(oldStartMs, ctx.timezone, "long"),
          local: formatInTz(startMs, ctx.timezone, "long"),
          visit: visitLabel(visit_type),
          property: propertyLabel,
          google_calendar:
            google === "error"
              ? "no se pudo actualizar en Google Calendar (la cita SÍ está cambiada en la agenda de la agencia)"
              : google,
          email_confirmation: emailResult.sent ? `enviado a ${emailResult.to}` : `no enviado: ${emailResult.reason}`,
          note: "La cita está MODIFICADA (no hay que cancelar nada más). Confírmale al cliente el nuevo día y hora (`local`).",
        };
      } catch (err) {
        return { ok: false, error: `No se pudo modificar la cita: ${(err as Error).message}. Usa request_human_handoff con la nueva hora que pidió el cliente.` };
      }
    },
  });
}
