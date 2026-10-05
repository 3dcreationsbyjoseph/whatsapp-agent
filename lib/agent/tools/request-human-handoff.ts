import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyClientByEmail } from "@/lib/email/notify";
import type { GCalConfig } from "@/lib/google/calendar";

export const DEFAULT_HANDOFF_MESSAGE =
  "Gracias por su paciencia. Un miembro de nuestro equipo le atenderá personalmente en breve.";

export function makeHandoffTool(ctx: {
  conversation_id: string;
  organization_id: string;
  contact_id: string;
  gcal: GCalConfig | null;
  handoff_message: string;
}) {
  return tool({
    description:
      "Pasa la conversación a una persona del equipo: pausa el bot en este hilo y el sistema envía al cliente el mensaje de handoff configurado. Úsala si el cliente pide hablar con una persona, si no tienes la respuesta en los datos de la agencia, o ante quejas o temas delicados. Después de llamarla NO escribas nada más.",
    inputSchema: z.object({
      reason: z
        .enum(["client_request", "unknown_answer", "complaint_or_sensitive", "other"])
        .describe("Motivo del handoff"),
      summary: z
        .string()
        .optional()
        .describe("Resumen breve de lo que pide el cliente (también va en el email de acuse que recibe; escríbelo en su idioma)."),
    }),
    execute: async ({ reason, summary }) => {
      const admin = createAdminClient();
      const { error } = await admin
        .from("conversations")
        .update({ bot_active: false })
        .eq("id", ctx.conversation_id)
        .eq("organization_id", ctx.organization_id);
      if (error) return { ok: false, error: error.message };
      console.log(
        JSON.stringify({
          level: "info",
          msg: "human handoff",
          organization_id: ctx.organization_id,
          conversation_id: ctx.conversation_id,
          reason,
          summary: summary ?? null,
        }),
      );
      // Acuse por email de la petición (si el cliente dio su email).
      if (summary) {
        await notifyClientByEmail({
          organization_id: ctx.organization_id,
          contact_id: ctx.contact_id,
          conversation_id: ctx.conversation_id,
          gcal: ctx.gcal,
          email: { kind: "request_received", summary },
        });
      }
      return {
        ok: true,
        message_to_send: ctx.handoff_message,
        reason,
      };
    },
  });
}
