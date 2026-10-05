// Enlaces a la web de Google Calendar.
// `authuser` abre la sesión de la cuenta correcta cuando el usuario tiene varias
// cuentas de Google iniciadas (el calendar_id "primary" es el email de la cuenta).

const BASE = "https://calendar.google.com/calendar/u/0/r";

function authuser(calendarId: string | null | undefined): string {
  return calendarId && calendarId.includes("@") ? `?authuser=${encodeURIComponent(calendarId)}` : "";
}

export function googleCalendarUrl(calendarId: string | null | undefined): string {
  return `${BASE}${authuser(calendarId)}`;
}

// Vista de un día concreto. `ymd` = "YYYY-MM-DD" en la zona horaria de la agencia.
export function googleCalendarDayUrl(calendarId: string | null | undefined, ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${BASE}/day/${y}/${m}/${d}${authuser(calendarId)}`;
}
