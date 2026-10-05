// Reserva una visita a una propiedad concreta. Reemplaza al book_appointment
// genérico para el dominio inmobiliario. Idempotente por (contact, property, starts_at).

import { tool } from "ai";
import { z } from "zod";
import { createEvent, type GCalConfig } from "@/lib/google/calendar";
import { buildEvent, getBusy, overlaps } from "@/lib/google/availability";
import { notifyClientByEmail } from "@/lib/email/notify";
import { formatInTz, parseInTz } from "@/lib/format-date";
import { cleanName, readMetadata } from "@/lib/contact-info";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCurrentPropertyId } from "../resolve-current-property";

type ServiceType = { name: string; duration_minutes: number; description?: string };

export function makeBookVisitTool(ctx: {
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  contact_phone: string;
  gcal: GCalConfig | null;
  timezone: string;
  services: ServiceType[];
}) {
  return tool({
    description:
      "Reserva una visita a una propiedad. Llámala SOLO cuando tengas: la ref de la propiedad, tipo de visita ('presencial' | 'video_call' | 'llamada'), el `starts_at_iso` exacto que devolvió get_available_slots o check_slot_availability, y el nombre completo (nombre + dos apellidos) del cliente. Idempotente.",
    inputSchema: z.object({
      property_id: z
        .string()
        .describe("La `ref` de la propiedad (también vale el id o el título)."),
      visit_type: z
        .string()
        .default("presencial")
        .describe("'presencial' | 'video_call' | 'llamada' (también acepta 'visita presencial', 'video llamada', 'llamada informativa')."),
      full_name: z.string().min(1),
      starts_at: z.string(),
      notes: z.string().optional(),
    }),
    execute: async ({ property_id: rawPropertyId, visit_type: rawVisitType, full_name, starts_at, notes }) => {
      try {
        const admin = createAdminClient();

        // Tipo de visita tolerante ("visita presencial", "videollamada", "call"...).
        const vt = rawVisitType.toLowerCase();
        const visit_type: "presencial" | "video_call" | "llamada" =
          vt.includes("video") ? "video_call" : vt.includes("llamada") || vt.includes("call") || vt.includes("tel") ? "llamada" : "presencial";

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

        // El modelo suele pasar la ref (no conoce el UUID de turnos anteriores).
        const resolvedId = await resolveCurrentPropertyId({
          organization_id: ctx.organization_id,
          conversation_id: ctx.conversation_id,
          candidate: rawPropertyId,
        });
        if (!resolvedId) {
          return { ok: false, error: "No sé qué propiedad es. Pregunta al cliente cuál o usa search_properties para obtener su `ref`." };
        }
        const property_id = resolvedId;

        // Carga la propiedad para el título / summary.
        const { data: property } = await admin
          .from("properties")
          .select("title, reference, location, price_eur, agent_name, agent_phone")
          .eq("id", property_id)
          .eq("organization_id", ctx.organization_id)
          .single<{
            title: string;
            reference: string | null;
            location: string;
            price_eur: number;
            agent_name: string | null;
            agent_phone: string | null;
          }>();
        if (!property) return { ok: false, error: "Propiedad no encontrada." };

        // Sin zona horaria explícita = hora local de la agencia (no UTC del servidor).
        const startMs = parseInTz(starts_at, ctx.timezone);
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

        // Teléfono de contacto facilitado por el cliente (si lo dio); si no, el de WhatsApp.
        const { data: contactRow } = await admin
          .from("contacts")
          .select("full_name, metadata")
          .eq("id", ctx.contact_id)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle<{ full_name: string | null; metadata: unknown }>();
        const meta = readMetadata(contactRow?.metadata);
        const contactPhone = meta.contact_phone ?? ctx.contact_phone;

        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();

        // Evita dobles reservas (Google + citas ya guardadas en la app).
        const { busy } = await getBusy(ctx.organization_id, ctx.gcal, startIso, endIso);
        if (overlaps(busy, startMs, endMs)) {
          return {
            ok: false,
            available: false,
            error: "Ese horario acaba de ocuparse. Usa check_slot_availability o get_available_slots para ofrecer otra hora.",
          };
        }

        // La reserva se guarda SIEMPRE. Si Google Calendar no responde (p. ej. permiso
        // caducado), el evento se crea automáticamente al reconectarlo en Integraciones.
        const bookedAt = new Date().toISOString();
        let googleEventId: string | null = null;
        if (ctx.gcal) {
          try {
            googleEventId = await createEvent(ctx.gcal, {
              ...buildEvent(
                {
                  full_name,
                  phone: contactPhone,
                  email: meta.email ?? null,
                  wa_phone: ctx.contact_phone,
                  visit_type,
                  notes: notes ?? null,
                  starts_at: startIso,
                  ends_at: endIso,
                  created_at: bookedAt,
                  property,
                },
                ctx.timezone,
              ),
              attendee_phone: ctx.contact_phone,
            });
          } catch (err) {
            console.warn(
              JSON.stringify({ level: "warn", msg: "google createEvent failed; booking saved pending sync", organization_id: ctx.organization_id, err: (err as Error).message }),
            );
          }
        }

        const { data: inserted, error: insErr } = await admin
          .from("appointments")
          .insert({
            organization_id: ctx.organization_id,
            contact_id: ctx.contact_id,
            property_id,
            visit_type,
            service: svcNameByType[visit_type] ?? "visita",
            starts_at: startIso,
            ends_at: endIso,
            created_at: bookedAt,
            google_event_id: googleEventId,
            status: "confirmed",
            is_new_patient: null,
            full_name,
            phone: contactPhone,
            notes: notes ?? null,
          })
          .select("id")
          .single();
        if (insErr) return { ok: false, error: insErr.message };

        // Guarda el nombre si el contacto no tenía uno puesto por el agente o el equipo.
        const name = cleanName(full_name);
        if (name && meta.name_source !== "agent" && meta.name_source !== "staff") {
          await admin
            .from("contacts")
            .update({ full_name: name, metadata: { ...meta, name_source: "agent" } as Json })
            .eq("id", ctx.contact_id)
            .eq("organization_id", ctx.organization_id);
        }

        // Email automático de acuse (si el cliente dio su email).
        const visitLabel =
          visit_type === "video_call" ? "Videollamada" : visit_type === "llamada" ? "Llamada informativa" : "Visita presencial";
        const emailResult = await notifyClientByEmail({
          organization_id: ctx.organization_id,
          contact_id: ctx.contact_id,
          conversation_id: ctx.conversation_id,
          gcal: ctx.gcal,
          email: {
            kind: "visit_booked",
            when: formatInTz(startMs, ctx.timezone, "long"),
            visit: visitLabel,
            property: property.reference ? `${property.title} (Ref. ${property.reference})` : property.title,
            location: property.location,
          },
        });

        return {
          ok: true,
          email_confirmation: emailResult.sent ? `enviado a ${emailResult.to}` : `no enviado: ${emailResult.reason}`,
          appointment_id: inserted.id,
          google_event_id: googleEventId,
          property_title: property.title,
          visit_type,
          local: formatInTz(startMs, ctx.timezone, "long"),
          booked_at_local: formatInTz(bookedAt, ctx.timezone, "datetime"),
          google_calendar: googleEventId ? "creado" : "pendiente (se sincroniza al reconectar Google Calendar)",
          note: "La visita está RESERVADA. Confírmasela al cliente con día y hora (`local`) y despídete con cordialidad. No digas que un agente la confirmará.",
        };
      } catch (err) {
        return { ok: false, error: `No se pudo reservar: ${(err as Error).message}. Usa request_human_handoff con el día/hora que pidió el cliente.` };
      }
    },
  });
}
