// Constantes globales del proyecto.
// Centralizar aquí facilita futuras migraciones.

export const GRAPH_API_VERSION = "v25.0" as const;

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}` as const;

// Modelo de Anthropic usado por el agente.
// Para volver a Sonnet 4.6 (más listo, ~10-15x más caro), cambia por
// "claude-sonnet-4-6". Haiku 4.5 es ideal para chatbots con tools bien
// estructuradas; Sonnet 4.6 rinde mejor en razonamiento libre.
export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001" as const;

export const AGENT_MAX_STEPS = 12 as const;
export const AGENT_TEMPERATURE = 0.3 as const;

// Rutas protegidas (usadas por middleware.ts)
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/citas",
  "/conversaciones",
  "/personalizacion",
  "/integraciones",
] as const;
