"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Borra un cliente de la organización actual. Las FKs (ON DELETE CASCADE) borran
// también sus conversaciones, mensajes, lead y citas guardadas en la app.
// Los eventos ya creados en Google Calendar NO se borran.
export async function deleteContact(contact_id: string) {
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
    .from("contacts")
    .delete()
    .eq("id", contact_id)
    .eq("organization_id", profile.organization_id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Cliente no encontrado");

  revalidatePath("/leads");
  revalidatePath("/conversaciones");
  revalidatePath("/dashboard");
}
