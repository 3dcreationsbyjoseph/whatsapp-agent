import { tool } from "ai";
import { z } from "zod";
import { getFreeBusy, type GCalConfig } from "@/lib/google/calendar";

type BusinessHours = Record<string, Array<{ start: string; end: string }>>;
type Service = { name: string; duration_minutes: number; description?: string };

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Convierte una hora "wall clock" (año-mes-día-hora-minuto) en una zona horaria
// a un Date UTC real. Maneja DST correctamente usando Intl.DateTimeFormat.
function localWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Guess: asumimos wall time == UTC time inicialmente
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(guessUtcMs);
  // ¿Qué hora es "guess" en la zona horaria target?
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const asIfLocalMs = Date.UTC(
    parseInt(p.year),
    parseInt(p.month) - 1,
    parseInt(p.day),
    parseInt(p.hour) % 24, // "24" a veces representa medianoche
    parseInt(p.minute),
  );
  const offset = asIfLocalMs - guessUtcMs;
  return new Date(guessUtcMs - offset);
}

// Devuelve el día de la semana (0-6, dom-sab) del Date en la zona horaria dada.
function localDayOfWeek(date: Date, timezone: string): number {
  const s = date.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[s.slice(0, 3)] ?? 0;
}

// Extrae year, month, day locales del Date en la zona horaria dada.
function localYmd(date: Date, timezone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return { y: parseInt(p.year), m: parseInt(p.month), d: parseInt(p.day) };
}

export function makeGetAvailableSlotsTool(ctx: {
  gcal: GCalConfig | null;
  timezone: string;
  services: Service[];
  business_hours: BusinessHours;
}) {
  return tool({
    description:
      "Devuelve 3 huecos libres reales para un servicio en los próximos días, respetando horarios de atención y la agenda de Google Calendar. Nunca inventes horarios: siempre usa esta tool.",
    inputSchema: z.object({
      service: z.string().describe("Nombre del servicio (debe existir en la lista de servicios)"),
      days_ahead: z.number().int().min(1).max(30).default(7),
    }),
    execute: async ({ service, days_ahead }) => {
      const svc = ctx.services.find((s) => s.name.toLowerCase() === service.toLowerCase());
      if (!svc) {
        return {
          ok: false,
          error: `Servicio "${service}" no configurado. Disponibles: ${ctx.services.map((s) => s.name).join(", ")}`,
        };
      }
      if (!ctx.gcal) {
        return { ok: false, error: "Google Calendar aún no está conectado para esta organización." };
      }

      const now = new Date();
      const rangeStart = new Date(now.getTime() + 60 * 60 * 1000); // desde +1h
      const rangeEnd = new Date(now.getTime() + days_ahead * 24 * 60 * 60 * 1000);

      const busy = await getFreeBusy(ctx.gcal, rangeStart.toISOString(), rangeEnd.toISOString());
      const durationMs = svc.duration_minutes * 60_000;

      const slots: string[] = [];

      // Iteramos día por día usando el CALENDARIO LOCAL de la zona horaria.
      // Empezamos con hoy (en local) y avanzamos un día en local cada iteración.
      const { y: startY, m: startM, d: startD } = localYmd(rangeStart, ctx.timezone);
      for (let i = 0; i < days_ahead && slots.length < 3; i++) {
        // Fecha "local" del día i-ésimo
        const dayAsUtcMidnight = new Date(Date.UTC(startY, startM - 1, startD + i, 12, 0)); // pivote a mediodía UTC
        const dayLocal = localYmd(dayAsUtcMidnight, ctx.timezone);
        const dow = localDayOfWeek(dayAsUtcMidnight, ctx.timezone);
        const dayKey = DAY_KEYS[dow];
        const ranges = ctx.business_hours[dayKey] ?? [];

        for (const range of ranges) {
          const [sh, sm] = range.start.split(":").map(Number);
          const [eh, em] = range.end.split(":").map(Number);
          const dayStart = localWallTimeToUtc(dayLocal.y, dayLocal.m, dayLocal.d, sh, sm, ctx.timezone);
          const dayEnd = localWallTimeToUtc(dayLocal.y, dayLocal.m, dayLocal.d, eh, em, ctx.timezone);

          for (let t = dayStart.getTime(); t + durationMs <= dayEnd.getTime(); t += 30 * 60_000) {
            const slotStart = new Date(t);
            const slotEnd = new Date(t + durationMs);
            if (slotStart < rangeStart) continue;
            const overlaps = busy.some((b) => {
              const bs = new Date(b.start!).getTime();
              const be = new Date(b.end!).getTime();
              return slotStart.getTime() < be && slotEnd.getTime() > bs;
            });
            if (!overlaps) {
              slots.push(slotStart.toISOString());
              if (slots.length >= 3) break;
            }
          }
          if (slots.length >= 3) break;
        }
      }

      return {
        ok: true,
        service: svc.name,
        duration_minutes: svc.duration_minutes,
        timezone: ctx.timezone,
        slots,
      };
    },
  });
}
