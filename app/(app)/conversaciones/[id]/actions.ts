"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { sendWhatsAppText } from "@/lib/whatsapp/send";

export async function setBotActive(conversation_id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ bot_active: active })
    .eq("id", conversation_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/conversaciones/${conversation_id}`);
}

export async function sendHumanMessage(conversation_id: string, body: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) throw new Error("Perfil no encontrado");

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact:contacts(wa_phone)")
    .eq("id", conversation_id)
    .eq("organization_id", profile.organization_id)
    .single();
  if (!conv) throw new Error("Conversación no encontrada");
  const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
  if (!contact) throw new Error("Contacto no encontrado");

  // Necesitamos el token cifrado — se lee con admin (RLS bypass) para no exponerlo al front.
  const admin = createAdminClient();
  const { data: wa } = await admin
    .from("whatsapp_configs")
    .select("phone_number_id, access_token_encrypted")
    .eq("organization_id", profile.organization_id)
    .single();
  if (!wa) throw new Error("WhatsApp no configurado");

  const accessToken = decrypt(wa.access_token_encrypted);
  const send = await sendWhatsAppText(wa.phone_number_id, accessToken, contact.wa_phone, body);
  if (!send.ok) throw new Error(send.error ?? "Error enviando");

  const { error: insErr } = await admin.from("messages").insert({
    conversation_id,
    organization_id: profile.organization_id,
    wa_message_id: send.message_id ?? null,
    direction: "outbound",
    sender: "human",
    content: body,
    raw: null,
  });
  if (insErr) throw new Error(insErr.message);

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation_id);
}
