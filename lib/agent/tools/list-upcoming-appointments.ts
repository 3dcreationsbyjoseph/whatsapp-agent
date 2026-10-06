import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatInTz } from "@/lib/format-date";

type Prop = { title: string; reference: string | null };

export function visitLabel(visitType: string | null): string {
  return visitType === "video_call" ? "Videollamada" : visitType === "llamada" ? "Llamada informativa" : "Visita presencial";
}

export function makeListUpcomingAppointmentsTool(ctx: {
  organization_id: string;
  contact_id: string;
  timezone: string;
}) {
  return tool({
    description:
      "Devuelve las citas confirmadas y futuras de ESTE contacto (WhatsApp), con su hora local en `local` (usa esa al hablar con el cliente), el tipo de visita y la propiedad. Úsala cuando el cliente pida consultar, modificar o cancelar una cita.",
    inputSchema: z.object({}),
    execute: async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("appointments")
        .select("id, starts_at, visit_type, property:properties(title, reference)")
        .eq("organization_id", ctx.organization_id)
        .eq("contact_id", ctx.contact_id)
        .eq("status", "confirmed")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .returns<Array<{ id: string; starts_at: string; visit_type: string | null; property: Prop | Prop[] | null }>>();
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        // Sin la hora UTC: el modelo debe usar `local` (hora de la agencia).
        appointments: (data ?? []).map((a) => {
          const p = Array.isArray(a.property) ? a.property[0] : a.property;
          return {
            appointment_id: a.id,
            local: formatInTz(a.starts_at, ctx.timezone, "long"),
            visit: visitLabel(a.visit_type),
            property: p ? (p.reference ? `${p.title} (Ref. ${p.reference})` : p.title) : null,
          };
        }),
        timezone: ctx.timezone,
      };
    },
  });
}
