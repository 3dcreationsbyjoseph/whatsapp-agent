// Resuelve qué propiedad quiere decir el modelo. El historial que recibe el
// modelo solo tiene texto (no los resultados de tools de turnos anteriores),
// así que a menudo no conoce el UUID y pasa la referencia, el título o un UUID
// inventado. Orden:
//   1) candidate como UUID real de la org
//   2) candidate como referencia ("Ref. JV-102", "jv102") o parte del título
//   3) prefer="shown": la propiedad de las últimas fotos enviadas;
//      prefer="mentioned": la única referencia citada en el mensaje más reciente que cite alguna
//   4) el otro criterio de (3) como último recurso

import { createAdminClient } from "@/lib/supabase/admin";
import { normalize } from "./property-matching";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Prop = { id: string; reference: string | null; title: string; photo_urls: unknown };

function compact(s: string): string {
  return normalize(s).replace(/^ref\s+/, "").replace(/\s+/g, "");
}

function matchCandidate(props: Prop[], candidate: string): string | null {
  const c = compact(candidate);
  if (!c) return null;
  const byRef = props.find((p) => p.reference && compact(p.reference) === c);
  if (byRef) return byRef.id;
  const n = normalize(candidate);
  const byTitle = props.filter((p) => n.length >= 4 && normalize(p.title).includes(n));
  return byTitle.length === 1 ? byTitle[0].id : null;
}

function fromShownPhotos(props: Prop[], contents: string[]): string | null {
  for (const c of contents) {
    if (!c.startsWith("[imagen] ")) continue;
    const url = c.slice("[imagen] ".length).trim();
    const p = props.find((p) => Array.isArray(p.photo_urls) && (p.photo_urls as string[]).includes(url));
    if (p) return p.id;
  }
  return null;
}

function fromMentionedRefs(props: Prop[], contents: string[]): string | null {
  const withRef = props.filter((p) => p.reference && compact(p.reference).length >= 3);
  for (const c of contents) {
    if (c.startsWith("[imagen] ") || c.startsWith("[debug]")) continue;
    const text = compact(c);
    const hits = withRef.filter((p) => text.includes(compact(p.reference!)));
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1) return null; // ambiguo: que el modelo indique cuál
  }
  return null;
}

export async function resolveCurrentPropertyId(params: {
  organization_id: string;
  conversation_id: string;
  candidate?: string | null;
  prefer?: "shown" | "mentioned";
}): Promise<string | null> {
  const admin = createAdminClient();
  const { organization_id, conversation_id, candidate, prefer = "shown" } = params;

  if (candidate && UUID_RE.test(candidate)) {
    const { data: match } = await admin
      .from("properties")
      .select("id")
      .eq("id", candidate)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (match) return match.id;
  }

  const { data: allProps } = await admin
    .from("properties")
    .select("id, reference, title, photo_urls")
    .eq("organization_id", organization_id);
  // database.types.ts aún no incluye `properties` (placeholder): cast explícito.
  const props = (allProps ?? []) as unknown as Prop[];
  if (props.length === 0) return null;

  if (candidate) {
    const id = matchCandidate(props, candidate);
    if (id) return id;
  }

  const { data: msgs } = await admin
    .from("messages")
    .select("content")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(200);
  const contents = (msgs ?? []).map((m) => (m.content ?? "").trim()).filter(Boolean);

  return prefer === "shown"
    ? fromShownPhotos(props, contents) ?? fromMentionedRefs(props, contents)
    : fromMentionedRefs(props, contents) ?? fromShownPhotos(props, contents);
}
