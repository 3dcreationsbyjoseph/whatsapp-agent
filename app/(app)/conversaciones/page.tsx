import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "../_components/delete-button";
import RealtimeRefresh from "../_components/realtime-refresh";
import { deleteConversation } from "./actions";

type ConvRow = {
  id: string;
  bot_active: boolean;
  last_message_at: string;
  created_at: string;
  contact: { wa_phone: string; full_name: string | null } | { wa_phone: string; full_name: string | null }[] | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function ConversacionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single<{ organization_id: string }>();
  if (!profile) return null;

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, bot_active, last_message_at, created_at, contact:contacts(wa_phone, full_name)")
    .eq("organization_id", profile.organization_id)
    .order("last_message_at", { ascending: false })
    .limit(100)
    .returns<ConvRow[]>();

  const now = Date.now();

  return (
    <div className="max-w-4xl space-y-6">
      <RealtimeRefresh channel="conversaciones-list" />
      <h1 className="text-2xl font-semibold">Conversaciones</h1>
      <ul className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
        {(convs ?? []).map((c) => {
          const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
          const label = contact?.full_name ?? contact?.wa_phone ?? "Sin nombre";
          const isNew = now - new Date(c.created_at).getTime() < DAY_MS;
          return (
            <li key={c.id} className="flex items-center gap-3 pr-4 hover:bg-neutral-900">
              <Link href={`/conversaciones/${c.id}`} className="flex flex-1 items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {label}
                    {isNew ? (
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] uppercase tracking-wide px-2 py-0.5">
                        Nueva
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {contact?.full_name ? `${contact.wa_phone} · ` : ""}
                    {new Date(c.last_message_at).toLocaleString("es-ES")}
                  </div>
                </div>
                {!c.bot_active ? (
                  <span className="rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-2 py-0.5">
                    Bot pausado
                  </span>
                ) : null}
              </Link>
              <DeleteButton
                action={deleteConversation.bind(null, c.id)}
                confirmText={`¿Borrar la conversación con ${label}? Se borrarán todos sus mensajes. El cliente y su perfil se mantienen.`}
              />
            </li>
          );
        })}
        {(convs ?? []).length === 0 ? (
          <li className="px-4 py-3 text-sm text-neutral-500">Aún no hay conversaciones.</li>
        ) : null}
      </ul>
    </div>
  );
}
