// Envío de mensajes salientes vía Cloud API.

import { GRAPH_API_BASE } from "@/lib/constants";

export type SendResult = {
  ok: boolean;
  message_id?: string;
  error?: string;
};

export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  body: string,
): Promise<SendResult> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
  // preview_url:true hace que WhatsApp renderice la preview automática
  // cuando el body incluye una URL (YouTube, Vimeo, artículos, etc.).
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toE164,
      type: "text",
      text: { body, preview_url: true },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, message_id: data?.messages?.[0]?.id };
}

// Envío de imagen individual con caption opcional.
// La URL debe ser pública HTTPS accesible sin auth (WhatsApp la descarga).
export async function sendWhatsAppImage(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  imageUrl: string,
  caption?: string,
): Promise<SendResult> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toE164,
      type: "image",
      image: caption ? { link: imageUrl, caption } : { link: imageUrl },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok) return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, message_id: data?.messages?.[0]?.id };
}

// Prueba de conexión: intenta leer el phone_number_id vía Graph API.
// Útil para el botón "Probar conexión" en /integraciones.
export async function testWhatsAppCredentials(phoneNumberId: string, accessToken: string): Promise<{ ok: boolean; display_phone_number?: string; error?: string }> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as { display_phone_number?: string; error?: { message?: string } };
  if (!res.ok) return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, display_phone_number: data.display_phone_number };
}

// Marca el mensaje como leído y muestra "escribiendo…" al cliente mientras el
// bot prepara la respuesta (se quita solo al enviar o a los ~25 s). Best effort.
export async function sendTypingIndicator(
  phoneNumberId: string,
  accessToken: string,
  messageId: string,
): Promise<void> {
  try {
    await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // No es crítico: si falla, el cliente simplemente no ve "escribiendo…".
  }
}

// ---------------------------------------------------------------------------
// Audio (plan Max): descarga de notas de voz entrantes y envío de notas de voz.
// ---------------------------------------------------------------------------

// Descarga un archivo multimedia recibido (2 pasos: URL temporal → bytes).
export async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<Uint8Array> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const meta = (await (await fetch(`${GRAPH_API_BASE}/${mediaId}`, { headers: auth })).json()) as {
    url?: string;
    error?: { message?: string };
  };
  if (!meta.url) throw new Error(meta.error?.message ?? "No se pudo obtener la URL del audio");
  const res = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Descarga del audio: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Sube una nota de voz OGG/Opus y la envía al cliente.
export async function sendWhatsAppVoice(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  audio: Uint8Array,
): Promise<SendResult> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "audio/ogg");
  form.append("file", new Blob([Buffer.from(audio)], { type: "audio/ogg" }), "respuesta.ogg");
  const up = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const upData = (await up.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!up.ok || !upData.id) return { ok: false, error: upData.error?.message ?? `Subida de audio HTTP ${up.status}` };

  const send = async (voice: boolean) => {
    const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toE164,
        type: "audio",
        // voice:true → se muestra como nota de voz (micrófono), no como archivo.
        audio: voice ? { id: upData.id, voice: true } : { id: upData.id },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    return res.ok
      ? { ok: true, message_id: data.messages?.[0]?.id }
      : { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
  };
  const first = await send(true);
  // Si esta versión de la API no admite el campo "voice", se envía como audio normal.
  return first.ok ? first : send(false);
}
