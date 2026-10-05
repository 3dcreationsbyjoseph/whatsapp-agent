import { tool } from "ai";
import { z } from "zod";
import { notifyClientByEmail } from "@/lib/email/notify";
import type { GCalConfig } from "@/lib/google/calendar";

// Email de acuse para peticiones que no son reservar/cancelar una visita.
export function makeSendRequestEmailTool(ctx: {
  organization_id: string;
  contact_id: string;
  conversation_id: string;
  gcal: GCalConfig | null;
}) {
  return tool({
    description:
      "Envía al cliente un email confirmando que hemos recibido su petición (p. ej. que le llamen, información por escrito, una oferta). Solo funciona si el cliente ha dado su email. No la uses para visitas ni cancelaciones: esas ya envían su propio email.",
    inputSchema: z.object({
      summary: z.string().min(3).describe("Qué ha pedido el cliente, en una frase y en su idioma."),
    }),
    execute: async ({ summary }) => {
      const r = await notifyClientByEmail({ ...ctx, email: { kind: "request_received", summary } });
      return r.sent ? { ok: true, sent_to: r.to } : { ok: false, reason: r.reason };
    },
  });
}
