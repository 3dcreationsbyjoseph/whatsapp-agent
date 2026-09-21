// Constantes globales del proyecto.
// Centralizar aquí facilita futuras migraciones.

export const GRAPH_API_VERSION = "v25.0" as const;

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}` as const;

// Modelo de Anthropic usado por el agente.
// Sonnet 5 = mejor razonamiento, tool calling y multi-idioma (recomendado para
// producción de un producto de lujo). Alternativas:
// - "claude-sonnet-4-6" (~20% más barato, un poco peor multi-idioma)
// - "claude-haiku-4-5-20251001" (~10-15x más barato, para demos o batch)
export const ANTHROPIC_MODEL = "claude-sonnet-5" as const;

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
