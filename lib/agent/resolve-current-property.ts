// Detecta la propiedad "actual" de una conversación mirando las últimas
// fotos enviadas (mensajes outbound tipo "[imagen] URL"). Devuelve el
// property_id cuyo photo_urls contiene esa URL. Se usa como fallback
// cuando el LLM pasa un UUID inválido o inventado a las tools.

import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveCurrentPropertyId(params: {
  organization_id: string;
  conversation_id: string;
  candidate?: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { organization_id, conversation_id, candidate } = params;

  // 1) Si el LLM pasó un candidate y coincide con una propiedad real de la org, úsalo.
  if (candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
    const { data: match } = await admin
      .from("properties")
      .select("id")
      .eq("id", candidate)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (match) return match.id;
  }

  // 2) Si no, deducir buscando la última URL de imagen enviada en la conversación y
  //    encontrar qué propiedad tiene esa URL en su photo_urls.
  const { data: msgs } = await admin
    .from("messages")
    .select("content")
    .eq("conversation_id", conversation_id)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(500);

  const imageUrls: string[] = [];
  for (const m of msgs ?? []) {
    const c = (m.content ?? "").trim();
    if (c.startsWith("[imagen] ")) imageUrls.push(c.slice("[imagen] ".length).trim());
  }

  if (imageUrls.length === 0) return null;

  // Buscar entre las propiedades de la org cuál tiene alguna de estas URLs.
  const { data: allProps } = await admin
    .from("properties")
    .select("id, photo_urls")
    .eq("organization_id", organization_id);

  for (const url of imageUrls) {
    for (const p of allProps ?? []) {
      const photos = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]) : [];
      if (photos.includes(url)) return p.id;
    }
  }

  return null;
}
