// Helpers OAuth 2.0 para Google Calendar.
// El refresh token se guarda cifrado en google_calendar_configs.

import { google } from "googleapis";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Faltan variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // fuerza refresh_token
    scope: [CALENDAR_SCOPE],
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google no devolvió refresh_token. Revoca el acceso y vuelve a conectar con prompt=consent.");
  }
  return {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? null,
    expiry_date: tokens.expiry_date ?? null,
  };
}
