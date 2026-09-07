-- Reaplica a funcao para bancos que ja executaram 20260916 antes da validacao
-- explicita do INSERT de auditoria.
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID, p_role public.user_role DEFAULT NULL, p_is_active BOOLEAN DEFAULT NULL
) RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor UUID := auth.uid(); v_current public.profiles; v_result public.profiles; v_admins BIGINT; v_audit_rows INTEGER;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(ARRAY['admin']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_role IS NULL AND p_is_active IS NULL THEN RAISE EXCEPTION 'Nenhuma alteracao informada'; END IF;
  PERFORM id FROM public.profiles ORDER BY id FOR UPDATE;
  SELECT * INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current.id IS NULL THEN RAISE EXCEPTION 'Usuario nao encontrado'; END IF;
  IF v_current.id = v_actor AND p_role IS NOT NULL AND p_role <> 'admin' THEN
    SELECT count(*) INTO v_admins FROM public.profiles WHERE role = 'admin' AND is_active = true;
    IF v_admins <= 1 THEN RAISE EXCEPTION 'Nao e possivel remover o ultimo administrador ativo'; END IF;
  END IF;
  IF v_current.role = 'admin' AND ((p_role IS NOT NULL AND p_role <> 'admin') OR p_is_active = false) THEN
    SELECT count(*) INTO v_admins FROM public.profiles WHERE role = 'admin' AND is_active = true;
    IF v_admins <= 1 THEN RAISE EXCEPTION 'E necessario manter um administrador ativo'; END IF;
  END IF;
  UPDATE public.profiles SET role = COALESCE(p_role, role), is_active = COALESCE(p_is_active, is_active), updated_at = now()
  WHERE id = p_user_id RETURNING * INTO v_result;
  INSERT INTO public.admin_audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (v_actor, 'user_updated', 'profile', p_user_id, to_jsonb(v_current), to_jsonb(v_result));
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  IF v_audit_rows <> 1 THEN RAISE EXCEPTION 'Falha ao registrar auditoria'; END IF;
  RETURN v_result;
END; $$;
