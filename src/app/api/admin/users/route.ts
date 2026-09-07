import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { createServiceClient } from '@/lib/supabase/service';
import { z } from 'zod';

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['admin', 'manager']),
});

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: { code: 'USER_ADMIN_REQUIRED', message: 'Acesso negado.' } }, { status: 403 });

  const service = createServiceClient();
  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    service.from('profiles').select('id, full_name, role, is_active, created_at, updated_at'),
  ]);
  if (usersError || profilesError) return NextResponse.json({ error: { code: 'USER_LIST_FAILED', message: 'Não foi possível carregar os usuários.' } }, { status: 500 });
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return NextResponse.json((users?.users ?? []).map((user) => ({
    ...profileMap.get(user.id), id: user.id, email: user.email ?? null, lastSignInAt: user.last_sign_in_at ?? null,
  })));
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: { code: 'USER_ADMIN_REQUIRED', message: 'Acesso negado.' } }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string; role?: string; isActive?: boolean } | null;
  if (!body?.id || (body.role && !['admin', 'manager', 'attendant', 'viewer'].includes(body.role)) || typeof body.isActive !== 'boolean' && !body.role) {
    return NextResponse.json({ error: { code: 'USER_UPDATE_INVALID', message: 'Dados de usuário inválidos.' } }, { status: 400 });
  }
  if (body.id === auth.user.id && body.isActive === false) return NextResponse.json({ error: { code: 'USER_SELF_DEACTIVATION', message: 'Não é possível desativar o próprio usuário.' } }, { status: 409 });
  const { data, error } = await auth.supabase.rpc('admin_update_user', { p_user_id: body.id, p_role: body.role ?? null, p_is_active: typeof body.isActive === 'boolean' ? body.isActive : null });
  if (error) return NextResponse.json({ error: { code: 'USER_UPDATE_FAILED', message: error.message.includes('ultimo') || error.message.includes('necessario') ? 'É necessário manter um administrador ativo.' : 'Não foi possível atualizar o usuário.' } }, { status: 409 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  if (auth.profile.role !== 'admin') return NextResponse.json({ error: { code: 'USER_ADMIN_REQUIRED', message: 'Apenas administradores podem cadastrar usuários.' } }, { status: 403 });

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'USER_CREATE_INVALID', message: 'Informe nome, e-mail e uma role válida.' } }, { status: 400 });

  const service = createServiceClient();
  const { data: listed, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return NextResponse.json({ error: { code: 'USER_LOOKUP_FAILED', message: 'Não foi possível verificar o e-mail informado.' } }, { status: 500 });
  if ((listed.users ?? []).some((user) => user.email?.trim().toLowerCase() === parsed.data.email)) {
    return NextResponse.json({ error: { code: 'USER_EMAIL_EXISTS', message: 'Já existe um usuário com este e-mail.' } }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(parsed.data.email, { data: { full_name: parsed.data.fullName }, redirectTo: `${origin}/auth/accept-invite` });
  if (inviteError || !invited.user) {
    const duplicate = inviteError?.message.toLowerCase().includes('already') || inviteError?.message.toLowerCase().includes('exists');
    return NextResponse.json({ error: { code: duplicate ? 'USER_EMAIL_EXISTS' : 'USER_INVITE_FAILED', message: duplicate ? 'Já existe um usuário com este e-mail.' : 'Não foi possível enviar o convite para este usuário.' } }, { status: duplicate ? 409 : 500 });
  }

  const { data: profile, error: profileError } = await service.from('profiles').upsert({ id: invited.user.id, full_name: parsed.data.fullName, role: parsed.data.role, is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select('id,full_name,role,is_active,created_at,updated_at').single();
  if (profileError || !profile) {
    await service.auth.admin.deleteUser(invited.user.id);
    return NextResponse.json({ error: { code: 'USER_PROFILE_FAILED', message: 'NÃ£o foi possÃ­vel concluir o cadastro do usuÃ¡rio.' } }, { status: 500 });
  }
  if (profileError) return NextResponse.json({ error: { code: 'USER_PROFILE_FAILED', message: 'O convite foi criado, mas não foi possível concluir o perfil. Tente novamente.' } }, { status: 500 });

  const { error: auditError } = await service.from('admin_audit_logs').insert({ user_id: auth.user.id, action: 'user_created', entity_type: 'profile', entity_id: invited.user.id, old_data: null, new_data: { full_name: profile.full_name, role: profile.role, is_active: profile.is_active, email: parsed.data.email } });
  if (auditError) await service.auth.admin.deleteUser(invited.user.id);
  if (auditError) return NextResponse.json({ error: { code: 'USER_AUDIT_FAILED', message: 'O usuário foi criado, mas não foi possível registrar a auditoria.' } }, { status: 500 });

  if (auditError) {
    await service.auth.admin.deleteUser(invited.user.id);
  }
  return NextResponse.json({ ...profile, id: invited.user.id, email: parsed.data.email, lastSignInAt: null }, { status: 201 });
}
