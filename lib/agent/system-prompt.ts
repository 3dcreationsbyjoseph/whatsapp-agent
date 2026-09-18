// Ensambla el system prompt combinando el prompt editable del usuario
// con el contexto del negocio (tono, info, servicios, horarios) + la fecha/hora
// actual en la zona horaria del negocio para que el agente pueda entender
// referencias como "mañana", "el lunes", etc.

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

  const now = new Date();
  // Fecha y hora locales para la organización, formato humano en español.
  const nowLocal = new Intl.DateTimeFormat("es-ES", {
    timeZone: orgTimezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  // Fecha ISO YYYY-MM-DD en la timezone del negocio para pasar a on_date de la tool.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: orgTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const todayIso = `${p.year}-${p.month}-${p.day}`;
  const tomorrow = new Date(
    Date.UTC(parseInt(p.year), parseInt(p.month) - 1, parseInt(p.day) + 1, 12, 0),
  );
  const tomorrowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: orgTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const tp: Record<string, string> = {};
  for (const part of tomorrowParts) tp[part.type] = part.value;
  const tomorrowIso = `${tp.year}-${tp.month}-${tp.day}`;

  return [
    config.system_prompt.trim(),
    "",
    `Contexto temporal (siempre en zona ${orgTimezone}):`,
    `- Ahora mismo es: ${nowLocal}`,
    `- Hoy en formato ISO: ${todayIso}`,
    `- Mañana en formato ISO: ${tomorrowIso}`,
    "",
    `Tono de voz: ${config.tone}.`,
    "",
    "Información del negocio:",
    JSON.stringify(config.business_info, null, 2),
    "",
    "Servicios disponibles:",
    JSON.stringify(services, null, 2),
    "",
    "Horarios de atención (por día de la semana, en la zona horaria del negocio):",
    JSON.stringify(hours, null, 2),
    "",
    "Reglas críticas del flujo:",
    "1. Cuando el cliente pida cita, si no dijo el servicio, pregúntaselo primero.",
    "2. Cuando el cliente diga un día concreto ('mañana', 'lunes', 'el 20'), PASA ese día a la tool get_available_slots vía el parámetro on_date (formato YYYY-MM-DD).",
    "3. Llama a get_available_slots UNA SOLA vez y presenta los slots reales que devuelva. NUNCA inventes horarios.",
    "4. Una vez que hayas mostrado los slots al cliente, NO vuelvas a llamar a get_available_slots aunque el cliente conteste. Usa los slots que ya tienes en el contexto.",
    "5. Cuando el cliente elija un slot, en el MISMO mensaje pregúntale nombre completo Y si es paciente nuevo (juntos).",
    "6. En cuanto tengas los 4 datos (slot ISO exacto de la tool, nombre, servicio, paciente nuevo sí/no), llama INMEDIATAMENTE a book_appointment con:",
    "   - starts_at: la cadena ISO EXACTA que devolvió get_available_slots para ese slot.",
    "   - full_name, service (uno de los configurados), is_new_patient (bool).",
    "7. Cuando book_appointment devuelva ok: true, envía UN mensaje breve confirmando la cita. Nada más.",
    "8. Si book_appointment falla, informa al cliente y ofrece pedir handoff.",
    "9. El teléfono NO se pide: viene automáticamente del canal de WhatsApp.",
    "10. Si el cliente pide hablar con un humano, llama a request_human_handoff.",
    "11. Responde en el idioma del cliente. Mensajes cortos, sin markdown pesado.",
  ].join("\n");
}
