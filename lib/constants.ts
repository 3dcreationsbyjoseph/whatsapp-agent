// Constantes globales del proyecto.
// Centralizar aquí facilita futuras migraciones.

export const GRAPH_API_VERSION = "v25.0" as const;

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}` as const;

// Modelo de Anthropic usado por el agente.
// Haiku 4.5 = mucho más barato; soporta tool use. No admite adaptive thinking
// ni effort, así que no se pasan providerOptions de ese tipo.
// Alternativas: "claude-sonnet-5" (mejor razonamiento/multi-idioma), "claude-sonnet-4-6".
export const ANTHROPIC_MODEL = "claude-haiku-4-5" as const;

export const AGENT_MAX_STEPS = 12 as const;
export const AGENT_TEMPERATURE = 0.3 as const;

// Rutas protegidas (usadas por middleware.ts)
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/citas",
  "/conversaciones",
  "/personalizacion",
  "/integraciones",
  "/facturacion",
  "/atencion",
  "/visitas",
  "/leads",
  "/propiedades",
] as const;
