-- Audit logs so podem ser criados por RPCs SECURITY DEFINER ou pelo backend
-- usando service_role. Nenhum usuario autenticado insere eventos arbitrarios.
BEGIN;
DROP POLICY IF EXISTS "Admin Insert Audit Logs" ON public.admin_audit_logs;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM anon, authenticated;
COMMIT;
