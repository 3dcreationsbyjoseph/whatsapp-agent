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
      text: { body },
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
