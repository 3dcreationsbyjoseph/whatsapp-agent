// Constantes globales del proyecto.
// Centralizar aquí facilita futuras migraciones.

export const GRAPH_API_VERSION = "v25.0" as const;

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}` as const;

export const ANTHROPIC_MODEL = "claude-sonnet-4-6" as const;

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
