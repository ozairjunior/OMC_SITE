import { redirect } from 'next/navigation';
import { requireAdminPage } from '@/lib/auth/server';

export default async function AdminIndexPage() {
  await requireAdminPage();
  redirect('/admin/dashboard');
}
