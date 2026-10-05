// Formateo de fechas SIEMPRE en la zona horaria de la organización.
// En Vercel el servidor corre en UTC: sin `timeZone` las horas salen 1-2 h
// desfasadas respecto a España. Sirve en servidor y en cliente.

export const DEFAULT_TIMEZONE = "Europe/Madrid";

type Style = "datetime" | "date" | "time" | "long";

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  datetime: { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
  date: { day: "2-digit", month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
  long: { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false },
};

export function formatInTz(
  value: string | number | Date,
  timezone: string | null | undefined,
  style: Style = "datetime",
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { ...OPTIONS[style], timeZone: timezone || DEFAULT_TIMEZONE }).format(d);
}

// Interpreta una fecha ISO. Si no trae zona ("2026-10-06T10:00"), se toma como
// hora local de `timezone` (no como UTC del servidor). Devuelve ms UTC o NaN.
export function parseInTz(value: string, timezone: string | null | undefined): number {
  const s = value.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return Date.parse(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return Date.parse(s);
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(guess));
  const p: Record<string, number> = {};
  for (const part of parts) p[part.type] = Number(part.value);
  const asLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return guess - (asLocal - guess);
}
