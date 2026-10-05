// Interpreta el presupuesto tal como lo dice el cliente ("unos 3M", "entre 1 y
// 1,5 millones", "up to 800k", "ab 2 Mio"). Sin dependencias: se prueba en local.

export type Budget = { min: number | null; max: number | null };

const APPROX = /\b(about|around|approx\w*|aprox\w*|unos|unas|sobre|alrededor|en torno|circa|ca|environ|ungef\w*|rond|ongeveer|cerca de|más o menos|mas o menos)\b|~/i;
const MAX = /\b(hasta|m[aá]x\w*|up to|under|below|less than|no more than|menos de|como mucho|bis|jusqu\w*|maximum|tot|h[oö]chstens|max)\b/i;
const MIN = /\b(desde|from|m[ií]n\w*|at least|more than|over|above|m[aá]s de|a partir|ab|[aà] partir|mindestens|minimum|vanaf|plus de)\b/i;

// Convierte "3", "1,5", "1.500.000", "800" + sufijo (k, m, mil, millones...) en euros.
function toNumber(raw: string, suffix: string): number | null {
  let s = raw.trim();
  // 1.500.000 / 1,500,000 → miles; 1,5 / 1.5 → decimal.
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else s = s.replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const suf = suffix.toLowerCase().replace(/\.$/, "");
  // Miles primero: "mil" empieza por "m" pero son miles, no millones.
  if (["k", "mil", "thousand", "tausend", "duizend"].includes(suf)) return Math.round(n * 1_000);
  if (/^(m|mm|mio|mill|millon|millón|millones|million|millions|millionen|miljoen|miljon)$/.test(suf)) return Math.round(n * 1_000_000);
  // Sin sufijo: números pequeños se entienden como millones (3 → 3 M) o miles (800 → 800 k).
  if (n < 50) return Math.round(n * 1_000_000);
  if (n < 10_000) return Math.round(n * 1_000);
  return Math.round(n);
}

const NUM = /(\d+(?:[.,]\d+)*)\s*(millones|millón|millon|millions?|millionen|miljoen|miljon|mio\.?|mill\.?|mm|m|k|mil|thousand|tausend|duizend)?\b/gi;

export function parseBudget(text: string | null | undefined): Budget | null {
  if (!text) return null;
  const t = text.replace(/€|eur(os)?\b/gi, " ");
  const items = Array.from(t.matchAll(new RegExp(NUM.source, "gi")), (m) => ({ raw: m[1], suf: m[2] ?? "" }));
  if (items.length === 0) return null;
  // Si el primer número no lleva sufijo pero el último sí ("entre 1 y 1,5 millones"), lo hereda.
  const lastSuffix = [...items].reverse().find((i) => i.suf)?.suf ?? "";
  const values = items
    .map((i) => toNumber(i.raw, i.suf || lastSuffix))
    .filter((n): n is number => n != null && n > 0);
  if (values.length === 0) return null;

  if (values.length >= 2) {
    const [a, b] = values;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const v = values[0];
  if (MAX.test(t)) return { min: null, max: v };
  if (MIN.test(t)) return { min: v, max: null };
  if (APPROX.test(t)) return { min: Math.round(v * 0.85), max: Math.round(v * 1.15) };
  // Una cifra sola ("3M"): presupuesto aproximado.
  return { min: Math.round(v * 0.85), max: Math.round(v * 1.15) };
}
