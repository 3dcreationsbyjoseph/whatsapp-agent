// Valida el parámetro `next` de login / callback: solo rutas internas.
// Rechaza URLs absolutas ("https://..."), protocol-relative ("//evil.com"),
// barras invertidas y caracteres de control (los navegadores eliminan
// tabs/saltos de línea, así que "/\t/evil.com" acabaría siendo "//evil.com").

export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\x00-\x1f\x7f]/.test(next)) return fallback;
  return next;
}
