import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateEventStatus, type GCalConfig } from "@/lib/google/calendar";

export function makeCancelAppointmentTool(ctx: {
  organization_id: string;
  contact_id: string;
  gcal: GCalConfig | null;
}) {
  return tool({
    description:
      "Cancela una cita existente. Marca la cita como cancelled en BD y borra el evento de Google Calendar. Usa antes list_upcoming_appointments para conocer el appointment_id correcto.",
    inputSchema: z.object({
      appointment_id: z.string().uuid().describe("UUID exacto devuelto por list_upcoming_appointments"),
    }),
    execute: async ({ appointment_id }) => {
      const admin = createAdminClient();

      // Verifica que la cita existe y pertenece a este contacto (seguridad).
      const { data: appt, error: findErr } = await admin
        .from("appointments")
        .select("id, service, starts_at, google_event_id, status")
        .eq("id", appointment_id)
        .eq("organization_id", ctx.organization_id)
        .eq("contact_id", ctx.contact_id)
        .maybeSingle();
      if (findErr) return { ok: false, error: findErr.message };
      if (!appt) return { ok: false, error: "Cita no encontrada o no pertenece a este contacto." };
      if (appt.status === "cancelled") {
        return { ok: true, already_cancelled: true, appointment_id: appt.id };
      }

      // Borra evento de Google Calendar si existe.
      if (appt.google_event_id && ctx.gcal) {
        try {
          await updateEventStatus(ctx.gcal, appt.google_event_id, "cancelled");
        } catch (err) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: "google calendar delete failed on cancel",
              appointment_id,
              err: (err as Error).message,
            }),
          );
          // Continuamos: cancelamos igual en BD.
        }
      }

      const { error: updErr } = await admin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointment_id);
      if (updErr) return { ok: false, error: updErr.message };

      return {
        ok: true,
        appointment_id,
        service: appt.service,
        starts_at: appt.starts_at,
      };
    },
  });
}
