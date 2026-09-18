import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export function makeSaveContactInfoTool(ctx: { contact_id: string; organization_id: string }) {
  return tool({
    description: "Guarda o actualiza datos del contacto (nombre, si es paciente nuevo). Úsala apenas los captures.",
    inputSchema: z.object({
      full_name: z.string().optional(),
      is_new_patient: z.boolean().optional(),
    }),
    execute: async ({ full_name, is_new_patient }) => {
      const admin = createAdminClient();
      const patch: Record<string, unknown> = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (is_new_patient !== undefined) patch.is_new_patient = is_new_patient;
      if (Object.keys(patch).length === 0) return { ok: true, updated: false };
      const { error } = await admin.from("contacts").update(patch).eq("id", ctx.contact_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, updated: true };
    },
  });
}
