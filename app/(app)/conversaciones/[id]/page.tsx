import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationView from "./view";
import { cleanName, displayPhone, readMetadata } from "@/lib/contact-info";
import { DEFAULT_TIMEZONE } from "@/lib/format-date";

type ConvContact = { id: string; wa_phone: string; full_name: string | null; metadata: unknown };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, bot_active, contact:contacts(id, wa_phone, full_name, metadata), organization:organizations(timezone)")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single<{
      id: string;
      bot_active: boolean;
      contact: ConvContact | ConvContact[] | null;
      organization: { timezone: string } | { timezone: string }[] | null;
    }>();
  if (!conv) return notFound();

  const { data: msgs } = await supabase
    .from("messages")
    .select("id, direction, sender, content, created_at")
    .eq("conversation_id", conv.id)
    // Los "[debug]" son trazas internas de las tools, no mensajes del chat.
    .not("content", "like", "[debug]%")
    .order("created_at", { ascending: true })
    .limit(200);

  const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
  const org = Array.isArray(conv.organization) ? conv.organization[0] : conv.organization;
  const contactPhone = readMetadata(contact?.metadata).contact_phone;

  return (
    <ConversationView
      conversation_id={conv.id}
      contact_wa_phone={displayPhone(contact?.wa_phone)}
      contact_phone={contactPhone ? displayPhone(contactPhone) : null}
      contact_name={cleanName(contact?.full_name)}
      timezone={org?.timezone ?? DEFAULT_TIMEZONE}
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
