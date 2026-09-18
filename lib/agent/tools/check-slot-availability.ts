import { tool } from "ai";
import { z } from "zod";
import { getFreeBusy, type GCalConfig } from "@/lib/google/calendar";

type BusinessHours = Record<string, Array<{ start: string; end: string }>>;
type Service = { name: string; duration_minutes: number; description?: string };

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function localWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(guessUtcMs);
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
    parseInt(p.hour) % 24,
    parseInt(p.minute),
  );
  const offset = asIfLocalMs - guessUtcMs;
  return new Date(guessUtcMs - offset);
}

function localDayOfWeek(date: Date, timezone: string): number {
  const s = date.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[s.slice(0, 3)] ?? 0;
}

export function makeCheckSlotAvailabilityTool(ctx: {
  gcal: GCalConfig | null;
  timezone: string;
  services: Service[];
  business_hours: BusinessHours;
}) {
  return tool({
    description:
      "Comprueba si un horario CONCRETO está libre para un servicio. Úsalo cuando el cliente proponga una fecha y hora específicas (ej. 'mañana a las 10'). Devuelve si está disponible, la cadena ISO exacta para book_appointment, y si no lo está sugiere 3 alternativas cercanas.",
    inputSchema: z.object({
      service: z.string(),
      date: z.string().describe("YYYY-MM-DD en la zona horaria del negocio"),
      time: z.string().describe("HH:MM en formato 24h, zona horaria del negocio"),
    }),
    execute: async ({ service, date, time }) => {
      const svc = ctx.services.find((s) => s.name.toLowerCase() === service.toLowerCase());
      if (!svc) {
        return { ok: false, error: `Servicio "${service}" no configurado.` };
      }
      if (!ctx.gcal) {
        return { ok: false, error: "Google Calendar aún no está conectado." };
      }
      const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
      if (!dateMatch || !timeMatch) {
        return { ok: false, error: "Formato inválido. date=YYYY-MM-DD, time=HH:MM" };
      }
      const y = parseInt(dateMatch[1]);
      const mo = parseInt(dateMatch[2]);
      const d = parseInt(dateMatch[3]);
      const h = parseInt(timeMatch[1]);
      const mi = parseInt(timeMatch[2]);

      const start = localWallTimeToUtc(y, mo, d, h, mi, ctx.timezone);
      const end = new Date(start.getTime() + svc.duration_minutes * 60_000);

      // No en el pasado (permitimos slots >= now)
      if (start.getTime() < Date.now()) {
        return { ok: true, available: false, reason: "past" };
      }

      // Comprueba que cae dentro de business_hours de ese día local
      const dow = localDayOfWeek(start, ctx.timezone);
      const dayKey = DAY_KEYS[dow];
      const ranges = ctx.business_hours[dayKey] ?? [];
      const withinBusinessHours = ranges.some((r) => {
        const [sh, sm] = r.start.split(":").map(Number);
        const [eh, em] = r.end.split(":").map(Number);
        const rStart = localWallTimeToUtc(y, mo, d, sh, sm, ctx.timezone);
        const rEnd = localWallTimeToUtc(y, mo, d, eh, em, ctx.timezone);
        return start.getTime() >= rStart.getTime() && end.getTime() <= rEnd.getTime();
      });
      if (!withinBusinessHours) {
        // Sugerir alternativas del mismo día si hay horario
        const alternatives: string[] = [];
        for (const r of ranges) {
          const [sh, sm] = r.start.split(":").map(Number);
          const [eh, em] = r.end.split(":").map(Number);
          const rStart = localWallTimeToUtc(y, mo, d, sh, sm, ctx.timezone);
          const rEnd = localWallTimeToUtc(y, mo, d, eh, em, ctx.timezone);
          for (let t = rStart.getTime(); t + svc.duration_minutes * 60_000 <= rEnd.getTime() && alternatives.length < 3; t += 30 * 60_000) {
            if (t >= Date.now()) alternatives.push(new Date(t).toISOString());
          }
        }
        return { ok: true, available: false, reason: "outside_business_hours", business_hours_today: ranges, alternative_slots: alternatives };
      }

      // Consulta FreeBusy para ese slot
      const busy = await getFreeBusy(ctx.gcal, start.toISOString(), end.toISOString());
      const overlaps = busy.some((b) => {
        const bs = new Date(b.start!).getTime();
        const be = new Date(b.end!).getTime();
        return start.getTime() < be && end.getTime() > bs;
      });

      if (!overlaps) {
        return {
          ok: true,
          available: true,
          starts_at_iso: start.toISOString(),
          ends_at_iso: end.toISOString(),
          service: svc.name,
          duration_minutes: svc.duration_minutes,
        };
      }

      // No disponible → alternativas del mismo día
      const alternatives: string[] = [];
      for (const r of ranges) {
        const [sh, sm] = r.start.split(":").map(Number);
        const [eh, em] = r.end.split(":").map(Number);
        const rStart = localWallTimeToUtc(y, mo, d, sh, sm, ctx.timezone);
        const rEnd = localWallTimeToUtc(y, mo, d, eh, em, ctx.timezone);
        const dur = svc.duration_minutes * 60_000;
        for (let t = rStart.getTime(); t + dur <= rEnd.getTime() && alternatives.length < 3; t += 30 * 60_000) {
          if (t < Date.now()) continue;
          const s = new Date(t);
          const e = new Date(t + dur);
          const collide = busy.some((b) => {
            const bs = new Date(b.start!).getTime();
            const be = new Date(b.end!).getTime();
            return s.getTime() < be && e.getTime() > bs;
          });
          if (!collide) alternatives.push(s.toISOString());
        }
      }
      return { ok: true, available: false, reason: "busy", alternative_slots: alternatives };
    },
  });
}
