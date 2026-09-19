// Reserva una visita a una propiedad concreta. Reemplaza al book_appointment
// genérico para el dominio inmobiliario. Idempotente por (contact, property, starts_at).

import { tool } from "ai";
import { z } from "zod";
import { createEvent, type GCalConfig } from "@/lib/google/calendar";
import { createAdminClient } from "@/lib/supabase/admin";

type ServiceType = { name: string; duration_minutes: number; description?: string };

export function makeBookVisitTool(ctx: {
  organization_id: string;
  contact_id: string;
  contact_phone: string;
  gcal: GCalConfig | null;
  timezone: string;
  services: ServiceType[];
}) {
  return tool({
    description:
      "Reserva una visita a una propiedad. Llámala SOLO cuando tengas: property_id, tipo de visita ('visita presencial' | 'video llamada' | 'llamada informativa'), fecha/hora ISO exacta que devolvió get_available_slots o check_slot_availability, nombre completo del cliente. Idempotente.",
    inputSchema: z.object({
      property_id: z.string().uuid(),
      visit_type: z.enum(["presencial", "video_call", "llamada"]).default("presencial"),
      full_name: z.string().min(1),
      starts_at: z.string(),
      notes: z.string().optional(),
    }),
    execute: async ({ property_id, visit_type, full_name, starts_at, notes }) => {
      const admin = createAdminClient();

      // Resuelve el servicio y la duración a partir del tipo.
      const svcNameByType: Record<string, string> = {
        presencial: "visita presencial",
        video_call: "video llamada",
        llamada: "llamada informativa",
      };
      const svc = ctx.services.find(
        (s) => s.name.toLowerCase() === svcNameByType[visit_type],
      );
      const duration = svc?.duration_minutes ?? (visit_type === "presencial" ? 60 : 30);

      // Carga la propiedad para el título / summary.
      const { data: property } = await admin
        .from("properties")
        .select("title, reference, location, price_eur, agent_name, agent_phone")
        .eq("id", property_id)
        .eq("organization_id", ctx.organization_id)
        .single();
      if (!property) return { ok: false, error: "Propiedad no encontrada." };

      if (!ctx.gcal) return { ok: false, error: "Google Calendar no está conectado." };

      const startMs = Date.parse(starts_at);
      if (Number.isNaN(startMs)) return { ok: false, error: "starts_at inválido" };
      const endMs = startMs + duration * 60_000;

      // Idempotencia
      const { data: existing } = await admin
        .from("appointments")
        .select("id")
        .eq("organization_id", ctx.organization_id)
        .eq("contact_id", ctx.contact_id)
        .eq("property_id", property_id)
        .eq("starts_at", new Date(startMs).toISOString())
        .eq("status", "confirmed")
        .maybeSingle();
      if (existing) return { ok: true, already_booked: true, appointment_id: existing.id };

      const summary =
        visit_type === "presencial"
          ? `Visita · ${property.title}`
          : visit_type === "video_call"
          ? `Video llamada · ${property.title}`
          : `Llamada · ${property.title}`;

      let googleEventId: string | null = null;
      try {
        googleEventId = await createEvent(ctx.gcal, {
          summary: `${summary} — ${full_name}`,
          description: [
            `Cliente: ${full_name}`,
            `WhatsApp: ${ctx.contact_phone}`,
            property.reference ? `Referencia: ${property.reference}` : null,
            `Ubicación: ${property.location}`,
            property.agent_name ? `Agente asignado: ${property.agent_name}` : null,
            property.agent_phone ? `Teléfono agente: ${property.agent_phone}` : null,
            notes ? `Notas: ${notes}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
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
          property_id,
          visit_type,
          service: svcNameByType[visit_type] ?? "visita",
          starts_at: new Date(startMs).toISOString(),
          ends_at: new Date(endMs).toISOString(),
          google_event_id: googleEventId,
          status: "confirmed",
          is_new_patient: null,
          full_name,
          phone: ctx.contact_phone,
          notes: notes ?? null,
        })
        .select("id")
        .single();
      if (insErr) return { ok: false, error: insErr.message };

      // Actualiza el nombre del contacto si aún no lo tenía.
      await admin
        .from("contacts")
        .update({ full_name })
        .eq("id", ctx.contact_id)
        .is("full_name", null);

      return {
        ok: true,
        appointment_id: inserted.id,
        google_event_id: googleEventId,
        property_title: property.title,
        visit_type,
      };
    },
  });
}
