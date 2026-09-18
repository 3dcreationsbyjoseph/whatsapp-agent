import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export function makeHandoffTool(ctx: {
  conversation_id: string;
  organization_id: string;
  handoff_message: string;
}) {
  return tool({
    description:
      "Desactiva el bot en este hilo y envía el mensaje de handoff. Úsala cuando el cliente pida hablar con un humano, o cuando te trabes.",
    inputSchema: z.object({
      reason: z.string().optional(),
    }),
    execute: async ({ reason }) => {
      const admin = createAdminClient();
      const { error } = await admin
        .from("conversations")
        .update({ bot_active: false })
        .eq("id", ctx.conversation_id);
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        message_to_send: ctx.handoff_message,
        reason: reason ?? null,
      };
    },
  });
}
