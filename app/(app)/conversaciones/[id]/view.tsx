"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { setBotActive, sendHumanMessage } from "./actions";

type Msg = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "contact" | "bot" | "human";
  content: string | null;
  created_at: string;
};

export default function ConversationView({
  conversation_id,
  contact_wa_phone,
  contact_name,
  bot_active_initial,
  initial_messages,
}: {
  conversation_id: string;
  contact_wa_phone: string;
  contact_name: string | null;
  bot_active_initial: boolean;
  initial_messages: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initial_messages);
  const [botActive, setBotActiveState] = useState(bot_active_initial);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`conv:${conversation_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation_id}` },
        (payload) => {
          const m = payload.new as unknown as Msg;
          setMessages((prev) => (prev.find((p) => p.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversation_id}` },
        (payload) => {
          const conv = payload.new as unknown as { bot_active: boolean };
          setBotActiveState(conv.bot_active);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation_id, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function onToggleBot() {
    startTransition(async () => {
      await setBotActive(conversation_id, !botActive);
    });
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text.trim();
    setText("");
    startTransition(async () => {
      await sendHumanMessage(conversation_id, body);
    });
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-3">
        <div>
          <div className="text-lg font-medium">{contact_name ?? contact_wa_phone}</div>
          <div className="text-xs text-neutral-500">{contact_wa_phone}</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className={botActive ? "text-emerald-400" : "text-yellow-400"}>
            Bot {botActive ? "activo" : "pausado"}
          </span>
          <input
            type="checkbox"
            checked={botActive}
            onChange={onToggleBot}
            disabled={isPending}
            className="h-4 w-4 accent-emerald-500"
          />
        </label>
      </header>

      <div className="flex-1 overflow-y-auto space-y-2 py-2">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSend} className="flex gap-2 border-t border-neutral-800 pt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={botActive ? "Enviar como humano (pausa el bot para tomar el hilo)" : "Escribe un mensaje…"}
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <button
          type="submit"
          disabled={isPending || !text.trim()}
          className="rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isOut = msg.direction === "outbound";
  const bg =
    msg.sender === "human"
      ? "bg-emerald-500/20 border-emerald-500/40"
      : msg.sender === "bot"
      ? "bg-blue-500/15 border-blue-500/30"
      : "bg-neutral-800 border-neutral-700";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl border px-3 py-2 text-sm ${bg}`}>
        <div>{msg.content}</div>
        <div className="text-[10px] mt-1 text-neutral-400">
          {msg.sender === "bot" ? "Bot" : msg.sender === "human" ? "Tú" : ""}{" "}
          {new Date(msg.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
