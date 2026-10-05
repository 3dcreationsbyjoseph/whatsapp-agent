"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Marca la petición como atendida: reactiva el bot en esa conversación.
export async function resolveHandoff(conversation_id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single<{ organization_id: string }>();
  if (!profile) throw new Error("Perfil no encontrado");

  // Acotado explícitamente a la organización del usuario.
  const { error } = await createAdminClient()
    .from("conversations")
    .update({ bot_active: true })
    .eq("id", conversation_id)
    .eq("organization_id", profile.organization_id);
  if (error) throw new Error(error.message);

  revalidatePath("/atencion");
  revalidatePath("/conversaciones");
  revalidatePath(`/conversaciones/${conversation_id}`);
}
