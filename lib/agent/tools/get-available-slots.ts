import { tool } from "ai";
import { z } from "zod";
import { getFreeBusy, type GCalConfig } from "@/lib/google/calendar";

type BusinessHours = Record<string, Array<{ start: string; end: string }>>;
type Service = { name: string; duration_minutes: number; description?: string };

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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
      const start = new Date(now.getTime() + 60 * 60 * 1000); // desde +1h
      const end = new Date(now.getTime() + days_ahead * 24 * 60 * 60 * 1000);

      const busy = await getFreeBusy(ctx.gcal, start.toISOString(), end.toISOString());
      const durationMs = svc.duration_minutes * 60_000;

      const slots: string[] = [];
      for (let day = new Date(start); day < end && slots.length < 3; day = nextDay(day)) {
        const dayKey = DAY_KEYS[day.getUTCDay()];
        const ranges = ctx.business_hours[dayKey] ?? [];
        for (const range of ranges) {
          const [sh, sm] = range.start.split(":").map(Number);
          const [eh, em] = range.end.split(":").map(Number);
          const dayStart = setLocalTime(day, sh, sm);
          const dayEnd = setLocalTime(day, eh, em);
          for (let t = dayStart.getTime(); t + durationMs <= dayEnd.getTime(); t += 30 * 60_000) {
            const slotStart = new Date(t);
            const slotEnd = new Date(t + durationMs);
            if (slotStart < start) continue;
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

      return { ok: true, service: svc.name, duration_minutes: svc.duration_minutes, slots };
    },
  });
}

function nextDay(d: Date): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + 1);
  n.setUTCHours(0, 0, 0, 0);
  return n;
}

function setLocalTime(d: Date, h: number, m: number): Date {
  const n = new Date(d);
  n.setUTCHours(h, m, 0, 0);
  return n;
}
