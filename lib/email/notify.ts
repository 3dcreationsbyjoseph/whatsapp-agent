// Emails automáticos al cliente: acuse de solicitud de visita, cancelación y
// cualquier otra petición. Solo si el cliente dio su email y la agencia tiene
// Google conectado con permiso de Gmail. Nunca rompe el flujo del bot: si no se
// puede enviar, lo registra y devuelve el motivo.

import { createAdminClient } from "@/lib/supabase/admin";
import { readMetadata, cleanName } from "@/lib/contact-info";
import type { GCalConfig } from "@/lib/google/calendar";
import { sendGmail } from "./gmail";
import { clientLanguageSample, isSpanishCode, translateForClient } from "@/lib/agent/translate";

export type EmailKind =
  | { kind: "visit_booked"; when: string; visit: string; property?: string | null; location?: string | null }
  | { kind: "visit_cancelled"; when: string; property?: string | null }
  | { kind: "visit_rescheduled"; previous: string; when: string; visit: string; property?: string | null }
  | { kind: "request_received"; summary: string };

type Lang = "es" | "en";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function template(e: EmailKind, lang: Lang, name: string | null, org: string) {
  const hi = lang === "es" ? `Hola${name ? ` ${name}` : ""},` : `Dear${name ? ` ${name}` : " client"},`;
  const problems =
    lang === "es"
      ? "Si surgiera cualquier problema o cambio, le avisaremos lo antes posible por WhatsApp o por este correo."
      : "Should any problem or change arise, we will let you know as soon as possible via WhatsApp or this email.";
  const sign = lang === "es" ? `Un saludo,\n${org}` : `Kind regards,\n${org}`;

  let subject: string;
  let lines: string[];
  switch (e.kind) {
    case "visit_booked":
      subject = lang === "es" ? `Hemos recibido su solicitud de visita — ${org}` : `We have received your viewing request — ${org}`;
      lines =
        lang === "es"
          ? [
              "Hemos recibido su solicitud y su cita ha quedado reservada:",
              `• ${e.visit}: ${e.when}`,
              ...(e.property ? [`• Propiedad: ${e.property}${e.location ? ` (${e.location})` : ""}`] : []),
            ]
          : [
              "We have received your request and your appointment is booked:",
              `• ${e.visit}: ${e.when}`,
              ...(e.property ? [`• Property: ${e.property}${e.location ? ` (${e.location})` : ""}`] : []),
            ];
      break;
    case "visit_cancelled":
      subject = lang === "es" ? `Su cita ha sido cancelada — ${org}` : `Your appointment has been cancelled — ${org}`;
      lines =
        lang === "es"
          ? [`Le confirmamos que su cita del ${e.when}${e.property ? ` (${e.property})` : ""} ha quedado cancelada.`, "Si desea una nueva fecha, escríbanos por WhatsApp."]
          : [`We confirm that your appointment on ${e.when}${e.property ? ` (${e.property})` : ""} has been cancelled.`, "If you would like a new date, just message us on WhatsApp."];
      break;
    case "visit_rescheduled":
      subject = lang === "es" ? `Su cita ha sido modificada — ${org}` : `Your appointment has been changed — ${org}`;
      lines =
        lang === "es"
          ? [
              "Le confirmamos el cambio de su cita:",
              `• Antes: ${e.previous}`,
              `• Ahora: ${e.visit}, ${e.when}`,
              ...(e.property ? [`• Propiedad: ${e.property}`] : []),
            ]
          : [
              "We confirm the change to your appointment:",
              `• Previously: ${e.previous}`,
              `• Now: ${e.visit}, ${e.when}`,
              ...(e.property ? [`• Property: ${e.property}`] : []),
            ];
      break;
    case "request_received":
      subject = lang === "es" ? `Hemos recibido su solicitud — ${org}` : `We have received your request — ${org}`;
      lines =
        lang === "es"
          ? ["Hemos recibido su solicitud:", `• ${e.summary}`, "Nos pondremos en contacto con usted en breve."]
          : ["We have received your request:", `• ${e.summary}`, "We will get back to you shortly."];
      break;
  }

  const text = [hi, "", ...lines, "", problems, "", sign].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">
<p>${esc(hi)}</p>
${lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join("\n")}
<p style="margin-top:16px">${esc(problems)}</p>
<p style="margin-top:16px">${esc(sign).replace(/\n/g, "<br>")}</p>
</div>`;
  return { subject, text, html };
}

// Cada email enviado deja un mensaje "[email] Enviado a ..." en la conversación;
// se usa también para contar envíos (límites anti-spam).
const EMAIL_LOG_PREFIX = "[email] ";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EMAILS_PER_CONVERSATION_PER_DAY = 5;
const MAX_EMAILS_PER_ORG_PER_DAY = 200;
const MAX_SUMMARY_LENGTH = 300;

// El resumen de la petición lo redacta la IA a partir de lo que escribe el
// cliente: sin enlaces, emails ni teléfonos, y con longitud acotada.
function sanitizeSummary(summary: string): string {
  const clean = summary
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "")
    .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "")
    // Teléfonos con prefijo internacional (no toca precios como "1.500.000 €").
    .replace(/(?:\+|\b00)\d[\d\s().-]{7,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const short = clean.length > MAX_SUMMARY_LENGTH ? `${clean.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…` : clean;
  return short || "Su solicitud";
}

// HTML del email a partir del texto ya traducido (párrafos separados por línea en blanco).
function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:8px 0">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">\n${paragraphs}\n</div>`;
}

export async function notifyClientByEmail(params: {
  organization_id: string;
  contact_id: string;
  conversation_id: string;
  gcal: GCalConfig | null;
  email: EmailKind;
}): Promise<{ sent: boolean; reason?: string; to?: string }> {
  const { organization_id, contact_id, conversation_id, gcal } = params;
  const admin = createAdminClient();
  try {
    // `leads` aún no está en database.types.ts (placeholder): tipamos el resultado.
    const [{ data: contact }, { data: org }] = await Promise.all([
      admin
        .from("contacts")
        .select("full_name, metadata, leads(language)")
        .eq("id", contact_id)
        .eq("organization_id", organization_id)
        .maybeSingle<{
          full_name: string | null;
          metadata: unknown;
          leads: { language: string | null }[] | { language: string | null } | null;
        }>(),
      admin.from("organizations").select("name").eq("id", organization_id).maybeSingle<{ name: string }>(),
    ]);
    const lead = Array.isArray(contact?.leads) ? contact?.leads[0] : contact?.leads;

    const to = readMetadata(contact?.metadata).email;
    if (!to) return { sent: false, reason: "El cliente no ha dado su email." };
    if (!gcal) return { sent: false, reason: "Google no está conectado (Integraciones)." };

    // Límite de envíos: el email lo da el propio cliente (sin verificar), así que
    // sin tope se podría usar el Gmail de la agencia para mandar spam a terceros.
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const [{ count: convCount }, { count: orgCount }] = await Promise.all([
      admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversation_id)
        .like("content", `${EMAIL_LOG_PREFIX}%`)
        .gte("created_at", since),
      admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .like("content", `${EMAIL_LOG_PREFIX}%`)
        .gte("created_at", since),
    ]);
    if ((convCount ?? 0) >= MAX_EMAILS_PER_CONVERSATION_PER_DAY) {
      return { sent: false, reason: "Límite de emails a este cliente alcanzado por hoy. No prometas más emails; confírmaselo por WhatsApp." };
    }
    if ((orgCount ?? 0) >= MAX_EMAILS_PER_ORG_PER_DAY) {
      console.warn(JSON.stringify({ level: "warn", msg: "org daily email limit reached", organization_id }));
      return { sent: false, reason: "Límite diario de emails de la agencia alcanzado. Confírmaselo por WhatsApp." };
    }

    const orgName = org?.name ?? "";
    const firstName = cleanName(contact?.full_name)?.split(" ")[0] ?? null;
    const email: EmailKind =
      params.email.kind === "request_received"
        ? { kind: "request_received", summary: sanitizeSummary(params.email.summary) }
        : params.email;
    const es = template(email, "es", firstName, orgName);

    // Se escribe en español y se traduce al idioma de los mensajes del cliente
    // (leads.language vale 'es' por defecto aunque el cliente escriba en otro idioma).
    // Si el idioma ya está guardado y no es español, se usa directamente.
    const target =
      lead?.language && !isSpanishCode(lead.language)
        ? { language: lead.language }
        : { sample: await clientLanguageSample(conversation_id) };
    const [subject, text] = await Promise.all([
      translateForClient(es.subject, target),
      translateForClient(es.text, target),
    ]);
    const html = text === es.text ? es.html : textToHtml(text);

    await sendGmail(gcal, { to, fromName: orgName, subject, text, html });

    // Queda constancia en la conversación (lo ve el equipo y el propio bot).
    await admin.from("messages").insert({
      conversation_id,
      organization_id,
      wa_message_id: null,
      direction: "outbound",
      sender: "bot",
      content: `${EMAIL_LOG_PREFIX}Enviado a ${to}: ${subject}`,
      raw: null,
    });
    return { sent: true, to };
  } catch (err) {
    const message = (err as Error).message ?? "";
    const insufficient = /insufficient|scope|permission/i.test(message);
    console.warn(JSON.stringify({ level: "warn", msg: "client email failed", organization_id, contact_id, err: message }));
    return {
      sent: false,
      reason: insufficient
        ? "Falta el permiso de Gmail: reconecta Google en Integraciones."
        : `No se pudo enviar el email: ${message}`,
    };
  }
}
