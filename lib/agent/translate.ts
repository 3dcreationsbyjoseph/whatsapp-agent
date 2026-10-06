// Traduce textos fijos del sistema (ficha de propiedad, mensaje de handoff,
// emails) al idioma del cliente con una llamada breve al mismo modelo.
// Nunca rompe el flujo: si falla o tarda, devuelve el texto original.

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ANTHROPIC_MODEL } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

const TIMEOUT_MS = 15_000;

// Últimos mensajes del cliente en la conversación: sirven de muestra para
// detectar su idioma cuando no hay un código fiable.
export async function clientLanguageSample(conversation_id: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("messages")
    .select("content")
    .eq("conversation_id", conversation_id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(3);
  const text = (data ?? [])
    .map((m) => (m.content ?? "").trim())
    .filter(Boolean)
    .reverse()
    .join("\n");
  return text || null;
}

export function isSpanishCode(code: string | null | undefined): boolean {
  return !!code && /^(es|spa)\b|^espa/i.test(code.trim());
}

// target.language: código ISO o nombre del idioma (p. ej. "de").
// target.sample: mensajes del cliente; se traduce al idioma en que están escritos.
export async function translateForClient(
  text: string,
  target: { language?: string | null; sample?: string | null },
): Promise<string> {
  const language = target.language?.trim();
  const sample = target.sample?.trim();
  if (!text.trim()) return text;
  if (language && isSpanishCode(language)) return text;
  if (!language && !sample) return text;

  const targetLine = language
    ? `Idioma de destino: ${language} (código ISO o nombre del idioma).`
    : `Idioma de destino: el idioma en que están escritos estos mensajes del cliente:\n«${sample!.slice(0, 600)}»\nSi están en español (o no se puede saber), devuelve el TEXTO exactamente igual.`;

  try {
    const { text: out } = await generateText({
      model: anthropic(ANTHROPIC_MODEL),
      temperature: 0,
      maxOutputTokens: 2000,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      system: [
        "Eres un traductor profesional del sector inmobiliario de lujo. Traduces textos que una agencia envía a sus clientes.",
        "Reglas:",
        "- Devuelve SOLO el texto traducido, sin comillas, explicaciones ni notas.",
        "- Conserva exactamente: saltos de línea, viñetas, emojis, *asteriscos* de negrita, cifras, precios, fechas, horas, URLs, emails, teléfonos y nombres propios de lugares.",
        "- Las líneas que empiezan por «Ref.» se dejan EXACTAMENTE igual.",
        "- Registro formal y cortés (usted/Sie/vous/U...).",
      ].join("\n"),
      prompt: `${targetLine}\n\nTEXTO:\n${text}`,
    });
    const result = out.trim();
    return result || text;
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "translation failed; sending original", err: (err as Error).message }));
    return text;
  }
}
