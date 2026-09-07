import { redirect } from 'next/navigation';
import { requireAdminPage } from '@/lib/auth/server';
import { createServiceClient } from '@/lib/supabase/service';
import { UserManagement } from '@/components/admin/UserManagement';

export default async function UsersPage() {
  const { profile } = await requireAdminPage();
  if (profile.role !== 'admin') redirect('/admin/acesso-negado?reason=role_forbidden');
  const service = createServiceClient();
  const [{ data: users }, { data: profiles }] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    service.from('profiles').select('id, full_name, role, is_active, updated_at'),
  ]);
  const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));
  const rows = (users?.users ?? []).map((user) => ({ ...profileMap.get(user.id), id: user.id, email: user.email ?? '', lastSignInAt: user.last_sign_in_at ?? null }));
  return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-6 text-2xl font-bold">Usuários</h1><UserManagement users={rows} /></main>;
}
