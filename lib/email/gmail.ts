// Envío de emails con la API de Gmail usando la conexión de Google de la agencia
// (mismo OAuth que Google Calendar, permiso gmail.send). Sin proveedores extra.

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { authedClient, type GCalConfig } from "@/lib/google/calendar";

// Asunto/nombre con caracteres no ASCII (tildes, ñ): RFC 2047.
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

// Código de idioma seguro para la cabecera Content-Language (p. ej. "es", "pt-BR").
const LANG_TAG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

// Ningún valor de cabecera puede contener saltos de línea: si los tuviera, un
// valor manipulado podría añadir cabeceras (p. ej. "Bcc:") al correo.
function assertHeaderSafe(...values: Array<string | null | undefined>) {
  for (const v of values) {
    if (v && /[\r\n]/.test(v)) throw new Error("Cabecera de email no válida (salto de línea)");
  }
}

function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmail(
  config: GCalConfig,
  msg: { to: string; fromName: string; subject: string; text: string; html: string; language?: string },
): Promise<string> {
  const boundary = `b_${Date.now().toString(36)}`;
  // Remitente: la cuenta conectada. Su calendario "primary" es su email; si no lo
  // sabemos, omitimos From y Gmail pone la dirección de la cuenta.
  const fromEmail = config.calendar_id.includes("@") ? config.calendar_id : null;
  // Cabeceras estándar completas (Date, Message-ID, Reply-To): los filtros
  // antispam desconfían de correos a los que les faltan.
  const domain = fromEmail?.split("@")[1] ?? "gmail.com";
  const language = msg.language && LANG_TAG_RE.test(msg.language) ? msg.language : null;
  assertHeaderSafe(msg.to, fromEmail, domain);
  const raw = [
    ...(fromEmail ? [`From: ${encodeHeader(msg.fromName)} <${fromEmail}>`, `Reply-To: ${fromEmail}`] : []),
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    ...(language ? [`Content-Language: ${language}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.text, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.html, "utf8").toString("base64"),
    `--${boundary}--`,
  ].join("\r\n");

  const gmail = google.gmail({ version: "v1", auth: authedClient(config) });
  const { data } = await gmail.users.messages.send({ userId: "me", requestBody: { raw: toBase64Url(raw) } });
  return data.id ?? "";
}
