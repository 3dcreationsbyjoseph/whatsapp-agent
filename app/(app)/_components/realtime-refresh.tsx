"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

// Refresca la página (Server Component) cuando entra un mensaje o cambia una
// conversación: así aparecen solos los clientes y conversaciones nuevos.
// RLS filtra los eventos a la organización del usuario.
export default function RealtimeRefresh({ channel }: { channel: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 800);
    };
    const ch = supabase
      .channel(channel)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [channel, router, supabase]);

  return null;
}
