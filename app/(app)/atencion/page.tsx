import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cleanName, displayPhone, readMetadata } from "@/lib/contact-info";
import { DEFAULT_TIMEZONE, formatInTz } from "@/lib/format-date";
import { HANDOFF_PREFIX, parseHandoff } from "@/lib/handoff";
import ActionButton from "../_components/action-button";
import RealtimeRefresh from "../_components/realtime-refresh";
import { resolveHandoff } from "./actions";

type Contact = { wa_phone: string; full_name: string | null; metadata: unknown };
type Row = {
  id: string;
  last_message_at: string;
  contact: Contact | Contact[] | null;
};

// Conversaciones con el bot pausado: el cliente quiere hablar con una persona
// (o alguien del equipo pausó el bot). Se resuelven reactivando el bot.
export default async function AtencionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, organization:organizations(timezone)")
    .eq("id", user.id)
    .single<{ organization_id: string; organization: { timezone: string } | null }>();
  if (!profile) return null;
  const tz = profile.organization?.timezone ?? DEFAULT_TIMEZONE;

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, last_message_at, contact:contacts(wa_phone, full_name, metadata)")
    .eq("organization_id", profile.organization_id)
    .eq("bot_active", false)
    .order("last_message_at", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const rows = convs ?? [];

  // Último traspaso registrado de cada conversación.
  const handoffs = new Map<string, { content: string; created_at: string }>();
  if (rows.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", rows.map((r) => r.id))
      .like("content", `${HANDOFF_PREFIX}%`)
      .order("created_at", { ascending: false })
      .returns<{ conversation_id: string; content: string; created_at: string }[]>();
    for (const m of msgs ?? []) if (!handoffs.has(m.conversation_id)) handoffs.set(m.conversation_id, m);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <RealtimeRefresh channel="atencion-list" />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Atención humana</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Clientes que han pedido hablar con una persona. El asistente queda en pausa en esas conversaciones hasta que las
          marques como atendidas.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-neutral-500 text-sm">
          No hay ningún cliente esperando a una persona.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
            const meta = readMetadata(contact?.metadata);
            const name = cleanName(contact?.full_name) ?? displayPhone(meta.contact_phone ?? contact?.wa_phone);
            const h = handoffs.get(c.id);
            const parsed = parseHandoff(h?.content);
            return (
              <li key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-5 py-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{name}</span>
                      <span className="rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] uppercase tracking-wide px-2 py-0.5">
                        {parsed ? parsed.reason : "Bot pausado manualmente"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-400">
                      {meta.contact_phone ? `Tel. ${displayPhone(meta.contact_phone)} · ` : ""}
                      WhatsApp {displayPhone(contact?.wa_phone)}
                      {meta.email ? ` · ${meta.email}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-neutral-500">
                    {h ? <>Pidió atención<div className="text-neutral-300">{formatInTz(h.created_at, tz)}</div></> : null}
                    <div className="mt-1">Último mensaje {formatInTz(c.last_message_at, tz)}</div>
                  </div>
                </div>
                {parsed?.summary ? <p className="text-sm text-neutral-300">“{parsed.summary}”</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/conversaciones/${c.id}`}
                    className="rounded-lg bg-white text-black font-medium px-3 py-1.5 text-xs hover:bg-neutral-200 transition"
                  >
                    Abrir conversación y responder
                  </Link>
                  <ActionButton
                    action={resolveHandoff.bind(null, c.id)}
                    label="Marcar atendido y reactivar bot"
                    pendingLabel="Reactivando…"
                    confirmText={`¿Marcar como atendido a ${name}? El asistente volverá a responder en esta conversación.`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
