// Registro de traspasos a una persona del equipo. Se guarda como mensaje
// "[handoff] <motivo> | <resumen>" en la conversación (sin migraciones).

export const HANDOFF_PREFIX = "[handoff] ";

const REASONS: Record<string, string> = {
  client_request: "Pide hablar con una persona",
  unknown_answer: "Pregunta que el asistente no sabe responder",
  complaint_or_sensitive: "Queja o tema delicado",
  other: "Otro motivo",
};

export function parseHandoff(content: string | null | undefined): { reason: string; summary: string | null } | null {
  if (!content?.startsWith(HANDOFF_PREFIX)) return null;
  const [code, ...rest] = content.slice(HANDOFF_PREFIX.length).split(" | ");
  return { reason: REASONS[code.trim()] ?? code.trim(), summary: rest.join(" | ").trim() || null };
}
