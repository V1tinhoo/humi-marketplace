-- =====================================================================
-- HUMI · Minimum price per minute R$ 0,30 (maximum stays R$ 5,00).
-- Safe to run more than once.
-- =====================================================================
update public.platform_settings set value = 30, updated_at = now() where key = 'price_min_cents_per_minute';
notify pgrst, 'reload schema';
