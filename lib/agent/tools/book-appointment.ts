import { tool } from "ai";
import { z } from "zod";
import { createEvent, type GCalConfig } from "@/lib/google/calendar";
import { createAdminClient } from "@/lib/supabase/admin";

type Service = { name: string; duration_minutes: number; description?: string };

export function makeBookAppointmentTool(ctx: {
  organization_id: string;
  contact_id: string;
  contact_phone: string;
  gcal: GCalConfig | null;
  timezone: string;
  services: Service[];
}) {
  return tool({
    description:
      "Crea la cita en Google Calendar y en la BD. Idempotente por (contact_id, starts_at). Llama a esta tool SOLO después de confirmar todos los datos con el cliente.",
    inputSchema: z.object({
      full_name: z.string().min(1),
      service: z.string(),
      starts_at: z.string().describe("ISO 8601 en UTC, debe coincidir con un slot devuelto por get_available_slots"),
      is_new_patient: z.boolean(),
      notes: z.string().optional(),
    }),
    execute: async ({ full_name, service, starts_at, is_new_patient, notes }) => {
      const svc = ctx.services.find((s) => s.name.toLowerCase() === service.toLowerCase());
      if (!svc) return { ok: false, error: `Servicio desconocido: ${service}` };
      if (!ctx.gcal) return { ok: false, error: "Google Calendar no conectado." };

      const startMs = Date.parse(starts_at);
      if (Number.isNaN(startMs)) return { ok: false, error: "starts_at inválido" };
      const endMs = startMs + svc.duration_minutes * 60_000;

      const admin = createAdminClient();
      const { data: existing } = await admin
        .from("appointments")
        .select("id, google_event_id")
        .eq("organization_id", ctx.organization_id)
        .eq("contact_id", ctx.contact_id)
        .eq("starts_at", new Date(startMs).toISOString())
        .eq("status", "confirmed")
        .maybeSingle();
      if (existing) {
        return { ok: true, already_booked: true, appointment_id: existing.id };
      }

      let googleEventId: string | null = null;
      try {
        googleEventId = await createEvent(ctx.gcal, {
          summary: `${svc.name} — ${full_name}`,
          description: [
            `Servicio: ${svc.name}`,
            `Paciente: ${full_name}${is_new_patient ? " (nuevo)" : ""}`,
            `Teléfono: ${ctx.contact_phone}`,
            notes ? `Notas: ${notes}` : null,
          ].filter(Boolean).join("\n"),
          start: new Date(startMs).toISOString(),
          end: new Date(endMs).toISOString(),
          timezone: ctx.timezone,
          attendee_phone: ctx.contact_phone,
        });
      } catch (err) {
        return { ok: false, error: `Google Calendar: ${(err as Error).message}` };
      }

      const { data: inserted, error: insErr } = await admin
        .from("appointments")
        .insert({
          organization_id: ctx.organization_id,
          contact_id: ctx.contact_id,
          service: svc.name,
          starts_at: new Date(startMs).toISOString(),
          ends_at: new Date(endMs).toISOString(),
          google_event_id: googleEventId,
          status: "confirmed",
          is_new_patient,
          full_name,
          phone: ctx.contact_phone,
          notes: notes ?? null,
        })
        .select("id")
        .single();
      if (insErr) return { ok: false, error: insErr.message };

      // Actualiza nombre del contacto si no lo tenía.
      await admin
        .from("contacts")
        .update({ full_name, is_new_patient })
        .eq("id", ctx.contact_id);

      return { ok: true, appointment_id: inserted.id, google_event_id: googleEventId };
    },
  });
}
