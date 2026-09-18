import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ConversacionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, bot_active, last_message_at, contact:contacts(wa_phone, full_name)")
    .eq("organization_id", profile.organization_id)
    .order("last_message_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Conversaciones</h1>
      <ul className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
        {(convs ?? []).map((c) => {
          const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
          return (
            <li key={c.id}>
              <Link href={`/conversaciones/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900">
                <div>
                  <div className="text-sm font-medium">{contact?.full_name ?? contact?.wa_phone ?? "Sin nombre"}</div>
                  <div className="text-xs text-neutral-500">{new Date(c.last_message_at).toLocaleString("es-MX")}</div>
                </div>
                {!c.bot_active ? (
                  <span className="rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-2 py-0.5">
                    Bot pausado
                  </span>
                ) : null}
              </Link>
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
