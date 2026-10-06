-- =====================================================================
-- Planes de suscripción: basic | pro | max.
-- La columna la escribe el webhook de Stripe (service role) según el precio
-- contratado. NULL = sin suscripción en Stripe (en prueba: funciones de Max).
-- RLS: la tabla ya solo permite SELECT de la fila propia (ver billing.sql).
-- =====================================================================

alter table public.org_subscriptions
  add column if not exists plan text
  check (plan in ('basic', 'pro', 'max'));
