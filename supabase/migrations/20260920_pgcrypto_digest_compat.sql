-- Alguns projetos Supabase expõem pgcrypto apenas com digest(bytea,text).
-- Este overload mantém compatibilidade com a RPC de idempotencia existente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION public.digest(data TEXT, algorithm TEXT)
RETURNS BYTEA
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT extensions.digest(convert_to(data, 'UTF8'), algorithm::text) $$;
