"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Borra una conversación (y sus mensajes, por ON DELETE CASCADE) de la
// organización actual. El cliente y su lead se mantienen.
export async function deleteConversation(conversation_id: string) {
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

  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversation_id)
    .eq("organization_id", profile.organization_id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Conversación no encontrada");

  revalidatePath("/conversaciones");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
