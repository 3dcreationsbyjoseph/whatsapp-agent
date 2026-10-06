import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateEventStatus, type GCalConfig } from "@/lib/google/calendar";
import { notifyClientByEmail } from "@/lib/email/notify";
import { formatInTz } from "@/lib/format-date";

export function makeCancelAppointmentTool(ctx: {
  organization_id: string;
  contact_id: string;
  conversation_id: string;
  timezone: string;
  // Solo Google Calendar (null si el plan no lo incluye o no está conectado).
  gcal: GCalConfig | null;
  // Conexión de Google para enviar emails con Gmail (todos los planes).
  mail: GCalConfig | null;
}) {
  return tool({
    description:
      "Cancela una cita existente. Marca la cita como cancelled en BD y borra el evento de Google Calendar. Usa antes list_upcoming_appointments para conocer el appointment_id correcto. Para CAMBIAR una cita de hora usa reschedule_appointment, no esta.",
    inputSchema: z.object({
      appointment_id: z.string().uuid().describe("UUID exacto devuelto por list_upcoming_appointments"),
    }),
    execute: async ({ appointment_id }) => {
      const admin = createAdminClient();

      // Verifica que la cita existe y pertenece a este contacto (seguridad).
      const { data: appt, error: findErr } = await admin
        .from("appointments")
        .select("id, service, starts_at, google_event_id, status, property:properties(title)")
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
      let google = appt.google_event_id && ctx.gcal ? "eliminado" : "sin evento en Google";
      if (appt.google_event_id && ctx.gcal) {
        try {
          await updateEventStatus(ctx.gcal, appt.google_event_id, "cancelled");
        } catch (err) {
          google = "no se pudo eliminar de Google Calendar (la cita SÍ está cancelada en la agenda de la agencia)";
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

      const prop = (appt as unknown as { property?: { title: string } | { title: string }[] | null }).property;
      const propertyTitle = Array.isArray(prop) ? prop[0]?.title : prop?.title;
      const emailResult = await notifyClientByEmail({
        organization_id: ctx.organization_id,
        contact_id: ctx.contact_id,
        conversation_id: ctx.conversation_id,
        gcal: ctx.mail,
        email: { kind: "visit_cancelled", when: formatInTz(appt.starts_at, ctx.timezone, "long"), property: propertyTitle ?? null },
      });

      return {
        ok: true,
        appointment_id,
        service: appt.service,
        starts_at: appt.starts_at,
        local: formatInTz(appt.starts_at, ctx.timezone, "long"),
        google_calendar: google,
        email_confirmation: emailResult.sent ? `enviado a ${emailResult.to}` : `no enviado: ${emailResult.reason}`,
      };
    },
  });
}
