'use client';

import { useState } from 'react';

type Role = 'admin' | 'manager' | 'attendant' | 'viewer';
type User = { id: string; email: string; full_name?: string; role?: Role; is_active?: boolean; lastSignInAt?: string | null };
const roles: Array<{ value: Role; label: string }> = [{ value: 'admin', label: 'Administrador' }, { value: 'manager', label: 'Gerente' }];

export function UserManagement({ users }: { users: User[] }) {
  const [rows, setRows] = useState(users);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ fullName: string; email: string; role: Role }>({ fullName: '', email: '', role: 'viewer' });

  async function update(id: string, patch: { role?: Role; isActive?: boolean }) {
    const target = rows.find((row) => row.id === id);
    if (patch.role && !window.confirm(`Alterar ${target?.full_name || target?.email} para ${patch.role}?`)) return;
    if (patch.isActive === false && !window.confirm(`Desativar ${target?.full_name || target?.email}? O acesso será perdido imediatamente.`)) return;
    setMessage(''); setError('');
    const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
    if (!response.ok) { const result = await response.json().catch(() => null) as { error?: { message?: string } } | null; setError(result?.error?.message ?? 'Não foi possível salvar a alteração.'); return; }
    const updated = await response.json(); setRows((current) => current.map((row) => row.id === id ? { ...row, ...updated } : row)); setMessage('Alteração salva.');
  }

  async function create(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setMessage(''); setError('');
    const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const result = await response.json().catch(() => null) as User & { error?: { message?: string } };
    if (!response.ok) { setError(result?.error?.message ?? 'Não foi possível cadastrar o usuário.'); setCreating(false); return; }
    setRows((current) => [...current, result]); setForm({ fullName: '', email: '', role: 'viewer' }); setShowCreate(false); setCreating(false); setMessage('Convite enviado. O usuário receberá um e-mail para definir a senha.');
  }

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div>{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div><button type="button" onClick={() => { setShowCreate(true); setError(''); }} className="rounded bg-amber-600 px-4 py-2 font-semibold text-white">+ Novo usuário</button></div>
    {showCreate && <div className="rounded-xl border bg-white p-5 shadow-sm"><form onSubmit={create} className="grid gap-3 sm:grid-cols-2"><h2 className="font-bold sm:col-span-2">Cadastrar usuário administrativo</h2><label className="space-y-1 text-sm"><span>Nome completo</span><input required minLength={2} maxLength={150} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="w-full rounded border p-2" /></label><label className="space-y-1 text-sm"><span>E-mail</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded border p-2" /></label><label className="space-y-1 text-sm"><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })} className="w-full rounded border p-2">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label><p className="text-xs text-slate-500 sm:col-span-2">Nenhuma senha é solicitada. O usuário definirá a própria senha pelo convite.</p><div className="flex gap-2 sm:col-span-2"><button disabled={creating} className="rounded bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{creating ? 'Enviando convite...' : 'Cadastrar usuário'}</button><button type="button" disabled={creating} onClick={() => setShowCreate(false)} className="rounded border px-4 py-2">Cancelar</button></div></form></div>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="bg-slate-50 text-left"><th className="p-3">Usuário</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Último acesso</th></tr></thead><tbody>{rows.map((user) => <tr className="border-t" key={user.id}><td className="p-3"><strong>{user.full_name}</strong><br /><span className="text-slate-500">{user.email}</span></td><td className="p-3"><select value={user.role} onChange={(event) => void update(user.id, { role: event.target.value as Role })} className="rounded border p-1">{roles.map((role) => <option key={role.value} value={role.value}>{role.value}</option>)}</select></td><td className="p-3"><button onClick={() => void update(user.id, { isActive: !user.is_active })} className="rounded border px-2 py-1">{user.is_active ? 'Ativo' : 'Inativo'}</button></td><td className="p-3">{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString('pt-BR') : 'Nunca'}</td></tr>)}</tbody></table></div>
  </div>;
}
