// Ensambla el system prompt combinando el prompt editable del usuario
// con el contexto del negocio (tono, info, servicios, horarios).

import type { Json } from "@/lib/database.types";

export type AgentConfig = {
  system_prompt: string;
  tone: string;
  business_info: Json;
  services: Json;
  business_hours: Json;
  handoff_message: string | null;
};

export function buildSystemPrompt(config: AgentConfig, orgTimezone: string): string {
  const services = Array.isArray(config.services) ? config.services : [];
  const hours = typeof config.business_hours === "object" && config.business_hours ? config.business_hours : {};

  return [
    config.system_prompt.trim(),
    "",
    `Tono de voz: ${config.tone}.`,
    `Zona horaria de referencia: ${orgTimezone}.`,
    "",
    "Información del negocio:",
    JSON.stringify(config.business_info, null, 2),
    "",
    "Servicios disponibles:",
    JSON.stringify(services, null, 2),
    "",
    "Horarios de atención (por día de la semana):",
    JSON.stringify(hours, null, 2),
    "",
    "Reglas estrictas:",
    "- Antes de agendar una cita necesitas: nombre completo, servicio (uno de los configurados), fecha/hora que coincida con un slot libre real, y si es paciente nuevo (sí/no).",
    "- El teléfono NO se pide: viene automáticamente del canal de WhatsApp.",
    "- Sugiere 3 huecos libres reales llamando a la tool `get_available_slots` — nunca inventes horarios.",
    "- Confirma explícitamente con el cliente antes de llamar a `book_appointment`.",
    "- Si el cliente pide hablar con un humano, o si te trabas, llama a `request_human_handoff`.",
    "- Responde siempre en el idioma del cliente (español por defecto). Mensajes cortos, sin markdown pesado.",
  ].join("\n");
}
