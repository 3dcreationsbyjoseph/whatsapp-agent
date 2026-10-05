import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { cleanName, hasFullName, normalizeEmail, normalizePhone, readMetadata } from "@/lib/contact-info";
import { notifyClientByEmail } from "@/lib/email/notify";
import { formatInTz } from "@/lib/format-date";
import type { GCalConfig } from "@/lib/google/calendar";

// El teléfono de contacto se guarda en contacts.metadata.contact_phone (columna
// jsonb ya existente, sin migración). wa_phone sigue siendo el número de WhatsApp.
export function makeSaveContactInfoTool(ctx: {
  contact_id: string;
  organization_id: string;
  conversation_id: string;
  wa_phone: string;
  timezone: string;
  gcal: GCalConfig | null;
}) {
  return tool({
    description:
      "Guarda el nombre y apellido(s), el teléfono de contacto y/o el email del cliente EN CUANTO los diga (llámala siempre que dé cualquiera de esos datos, también el email). Si no quiere dar su email, pasa email_declined=true. El teléfono puede ser distinto del WhatsApp; si dice que es este mismo número, pasa same_as_whatsapp=true. La respuesta indica si aún falta algo.",
    inputSchema: z.object({
      full_name: z.string().nullish().describe("Nombre y apellidos tal como los dio el cliente."),
      contact_phone: z.string().nullish().describe("Teléfono de contacto tal como lo dio el cliente."),
      same_as_whatsapp: z.boolean().nullish(),
      email: z.string().nullish().describe("Email del cliente."),
      email_declined: z.boolean().nullish().describe("true si el cliente prefiere no dar su email."),
      name_is_complete: z
        .boolean()
        .nullish()
        .describe("true si el cliente confirma que su nombre ya incluye su apellido (p. ej. «Martín es mi apellido»)."),
    }),
    execute: async ({ full_name, contact_phone, same_as_whatsapp, email, email_declined, name_is_complete }) => {
      try {
        const admin = createAdminClient();
        const { data: current } = await admin
          .from("contacts")
          .select("full_name, metadata")
          .eq("id", ctx.contact_id)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle();
        const meta = readMetadata(current?.metadata);

        const patch: { full_name?: string; metadata?: Json } = {};
        const newMeta: Record<string, unknown> = { ...meta };
        const problems: string[] = [];

        if (full_name) {
          const name = cleanName(full_name);
          if (name) {
            // El nombre que da el cliente siempre gana al del perfil de WhatsApp.
            patch.full_name = name;
            newMeta.name_source = "agent";
            if (name !== current?.full_name) delete newMeta.name_confirmed;
          } else {
            problems.push("El nombre no es válido.");
          }
        }

        if (same_as_whatsapp) {
          newMeta.contact_phone = normalizePhone(ctx.wa_phone) ?? ctx.wa_phone;
        } else if (contact_phone) {
          const phone = normalizePhone(contact_phone);
          if (phone) newMeta.contact_phone = phone;
          else problems.push("El teléfono no parece válido: pídeselo de nuevo con el prefijo si no es español.");
        }

        if (name_is_complete) newMeta.name_confirmed = true;

        let newEmail: string | null = null;
        if (email) {
          const e = normalizeEmail(email);
          if (e) {
            if (e !== meta.email) newEmail = e;
            newMeta.email = e;
            delete newMeta.email_declined;
          } else problems.push("El email no parece válido: pídeselo de nuevo.");
        } else if (email_declined && !meta.email) {
          newMeta.email_declined = true;
        }

        if (JSON.stringify(newMeta) !== JSON.stringify(meta)) patch.metadata = newMeta as Json;
        if (Object.keys(patch).length > 0) {
          const { error } = await admin
            .from("contacts")
            .update(patch)
            .eq("id", ctx.contact_id)
            .eq("organization_id", ctx.organization_id);
          if (error) return { ok: false, error: error.message };
        }

        // Si da el email después de reservar, le enviamos ya la confirmación de su próxima visita.
        let email_confirmation: string | null = null;
        if (newEmail) {
          const { data: next } = await admin
            .from("appointments")
            .select("starts_at, visit_type, property:properties(title, reference, location)")
            .eq("organization_id", ctx.organization_id)
            .eq("contact_id", ctx.contact_id)
            .eq("status", "confirmed")
            .gt("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(1)
            .maybeSingle<{
              starts_at: string;
              visit_type: string | null;
              property: { title: string; reference: string | null; location: string } | { title: string; reference: string | null; location: string }[] | null;
            }>();
          if (next) {
            const p = Array.isArray(next.property) ? next.property[0] : next.property;
            const r = await notifyClientByEmail({
              organization_id: ctx.organization_id,
              contact_id: ctx.contact_id,
              conversation_id: ctx.conversation_id,
              gcal: ctx.gcal,
              email: {
                kind: "visit_booked",
                when: formatInTz(next.starts_at, ctx.timezone, "long"),
                visit: next.visit_type === "video_call" ? "Videollamada" : next.visit_type === "llamada" ? "Llamada informativa" : "Visita presencial",
                property: p ? (p.reference ? `${p.title} (Ref. ${p.reference})` : p.title) : null,
                location: p?.location ?? null,
              },
            });
            email_confirmation = r.sent ? `confirmación de la visita enviada a ${r.to}` : `no enviada: ${r.reason}`;
          }
        }

        const finalName = patch.full_name ?? (meta.name_source === "whatsapp" ? null : current?.full_name);
        const missing: string[] = [];
        if (!hasFullName(finalName) && !newMeta.name_confirmed) missing.push("nombre y al menos un apellido");
        if (!newMeta.contact_phone) missing.push("teléfono de contacto");
        // El email se pide una vez antes de reservar; si no quiere darlo, no se insiste.
        const optional = newMeta.email || newMeta.email_declined ? [] : ["email (pídeselo una vez, para enviarle la confirmación)"];

        return {
          ok: problems.length === 0,
          saved: { full_name: patch.full_name ?? null, contact_phone: newMeta.contact_phone ?? null, email: newMeta.email ?? null },
          ...(problems.length ? { problems } : {}),
          missing,
          optional,
          ...(email_confirmation ? { email_confirmation } : {}),
          note: missing.length
            ? `Aún falta: ${missing.join(" y ")}. Pídeselo con amabilidad en un momento natural (sin bloquear sus preguntas).`
            : "Datos de contacto completos.",
        };
      } catch (err) {
        return { ok: false, error: `No se pudieron guardar los datos: ${(err as Error).message}` };
      }
    },
  });
}
