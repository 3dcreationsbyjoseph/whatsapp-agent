import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationView from "./view";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, bot_active, contact:contacts(id, wa_phone, full_name)")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();
  if (!conv) return notFound();

  const { data: msgs } = await supabase
    .from("messages")
    .select("id, direction, sender, content, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;

  return (
    <ConversationView
      conversation_id={conv.id}
      contact_wa_phone={contact?.wa_phone ?? ""}
      contact_name={contact?.full_name ?? null}
      bot_active_initial={conv.bot_active}
      initial_messages={
        (msgs ?? []).map((m) => ({
          id: m.id,
          direction: m.direction,
          sender: m.sender,
          content: m.content,
          created_at: m.created_at,
        }))
      }
    />
  );
}
