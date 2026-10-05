// Utilidades para los datos del cliente (nombre y teléfono de contacto).
// Sin dependencias: se pueden probar en local.

import { analyzeName } from "./names";

// Un nombre "real" tiene al menos 2 letras (descarta ".", "🙂", "-", etc.,
// que es lo que a veces trae el perfil de WhatsApp).
export function isRealName(name: string | null | undefined): name is string {
  if (!name) return false;
  const letters = name.match(/\p{L}/gu);
  return !!letters && letters.length >= 2;
}

export function cleanName(name: string | null | undefined): string | null {
  if (!isRealName(name)) return null;
  return name.replace(/\s+/g, " ").trim();
}

// Nombre + al menos UN apellido (ver lib/names.ts: distingue "José Juan" de "José García").
export function hasFullName(name: string | null | undefined): boolean {
  const n = cleanName(name);
  return !!n && analyzeName(n).hasSurname;
}

// Normaliza a formato internacional (+34...). Por defecto España.
// Devuelve null si no parece un teléfono válido.
export function normalizePhone(raw: string | null | undefined, defaultCountryCode = "34"): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!/^\+?\d+$/.test(s)) return null;
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  // Número español de 9 dígitos (6, 7, 8 o 9 al principio).
  if (s.length === 9 && /^[6789]/.test(s)) return `+${defaultCountryCode}${s}`;
  // Ya incluye prefijo sin "+" (p. ej. 34612345678 o el wa_id de WhatsApp).
  if (s.length >= 10 && s.length <= 15) return `+${s}`;
  return null;
}

// "34612345678" (wa_id) → "+34 612 345 678" para mostrar.
export function displayPhone(raw: string | null | undefined): string {
  const p = normalizePhone(raw);
  if (!p) return raw ?? "";
  if (p.startsWith("+34") && p.length === 12) {
    return `+34 ${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}`;
  }
  return p;
}

export type ContactMetadata = {
  contact_phone?: string;
  email?: string;
  email_declined?: boolean;
  // El cliente confirmó que su nombre ya incluye el apellido (p. ej. "Juan Martín").
  name_confirmed?: boolean;
  name_source?: "whatsapp" | "agent" | "staff";
  [key: string]: unknown;
};

export function readMetadata(metadata: unknown): ContactMetadata {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as ContactMetadata)
    : {};
}

// Email básico: algo@dominio.tld, en minúsculas. null si no es válido.
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : null;
}
