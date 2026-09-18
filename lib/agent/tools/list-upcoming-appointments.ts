import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export function makeListUpcomingAppointmentsTool(ctx: {
  organization_id: string;
  contact_id: string;
}) {
  return tool({
    description:
      "Devuelve las citas confirmadas y futuras de ESTE contacto (WhatsApp). Úsala cuando el cliente pida modificar/cancelar una cita y necesites saber qué citas tiene.",
    inputSchema: z.object({}),
    execute: async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("appointments")
        .select("id, service, starts_at, ends_at, status")
        .eq("organization_id", ctx.organization_id)
        .eq("contact_id", ctx.contact_id)
        .eq("status", "confirmed")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) return { ok: false, error: error.message };
      return { ok: true, appointments: data ?? [] };
    },
  });
}
