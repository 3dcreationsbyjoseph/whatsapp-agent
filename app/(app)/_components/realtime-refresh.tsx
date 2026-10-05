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
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .subscribe();
    // `contacts` no está en la publicación de Realtime: refresco periódico de respaldo
    // para recoger cambios de nombre/teléfono aunque no llegue ningún evento.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
  }, [channel, router, supabase]);

  return null;
}
