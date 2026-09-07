import { requireAdminPage } from '@/lib/auth/server';

type Filters = { inicio?: string; fim?: string; usuario?: string; acao?: string; entidade?: string; registro?: string };
type AuditRow = { id: string; user_id: string | null; action: string; entity_type: string; entity_id: string | null; old_data: unknown; new_data: unknown; created_at: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams;
  const { supabase } = await requireAdminPage();
  let query = supabase.from('admin_audit_logs').select('id,user_id,action,entity_type,entity_id,old_data,new_data,created_at').order('created_at', { ascending: false }).limit(100);
  if (filters.inicio) query = query.gte('created_at', `${filters.inicio}T00:00:00`);
  if (filters.fim) query = query.lte('created_at', `${filters.fim}T23:59:59.999`);
  if (filters.usuario) query = query.eq('user_id', filters.usuario);
  if (filters.acao?.trim()) query = query.ilike('action', `%${filters.acao.trim()}%`);
  if (filters.entidade?.trim()) query = query.ilike('entity_type', `%${filters.entidade.trim()}%`);
  if (filters.registro?.trim()) query = query.eq('entity_id', filters.registro.trim());
  const [{ data, error }, { data: profiles }] = await Promise.all([query, supabase.from('profiles').select('id,full_name').order('full_name')]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Auditoria</h1><p className="text-sm text-slate-600">Últimos 100 registros encontrados. Os logs são somente leitura.</p></div>
    <form className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
      <Field label="Data inicial"><input type="date" name="inicio" defaultValue={filters.inicio} className="w-full rounded border p-2" /></Field>
      <Field label="Data final"><input type="date" name="fim" defaultValue={filters.fim} className="w-full rounded border p-2" /></Field>
      <Field label="Usuário"><select name="usuario" defaultValue={filters.usuario ?? ''} className="w-full rounded border p-2"><option value="">Todos</option>{(profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></Field>
      <Field label="Ação"><input name="acao" defaultValue={filters.acao} placeholder="product_updated" className="w-full rounded border p-2" /></Field>
      <Field label="Entidade"><input name="entidade" defaultValue={filters.entidade} placeholder="products / orders" className="w-full rounded border p-2" /></Field>
      <Field label="ID do registro"><input name="registro" defaultValue={filters.registro} placeholder="UUID" className="w-full rounded border p-2" /></Field>
      <div className="flex gap-2 lg:col-span-6"><button className="rounded bg-amber-600 px-4 py-2 font-semibold text-white">Filtrar</button><a href="/admin/auditoria" className="rounded border px-4 py-2">Limpar</a></div>
    </form>
    {error ? <p className="rounded bg-red-50 p-4 text-red-700">Não foi possível carregar a auditoria.</p> : <div className="space-y-4">{(data as AuditRow[] | null)?.map((row) => <article key={row.id} className="rounded-xl border bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3"><div><strong>{row.action}</strong><span className="ml-2 text-sm text-slate-500">{row.entity_type}{row.entity_id ? ` · ${row.entity_id}` : ''}</span></div><div className="text-right text-xs text-slate-500"><div>{new Date(row.created_at).toLocaleString('pt-BR')}</div><div>{row.user_id ? names.get(row.user_id) ?? row.user_id : 'Sistema'}</div></div></div><AuditDiff before={row.old_data} after={row.new_data} /></article>)}{!data?.length && <p className="rounded border bg-white p-8 text-center text-slate-500">Nenhum registro encontrado.</p>}</div>}
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-xs font-semibold text-slate-700"><span>{label}</span>{children}</label>; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function display(value: unknown) { if (value == null) return '—'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const oldData = asRecord(before); const newData = asRecord(after); const keys = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])];
  if (!keys.length) return <p className="text-sm text-slate-500">Sem detalhes adicionais.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-2">Campo</th><th className="p-2">Antes</th><th className="p-2">Depois</th></tr></thead><tbody>{keys.map((key) => <tr key={key} className={display(oldData[key]) !== display(newData[key]) ? 'border-t bg-amber-50' : 'border-t'}><td className="p-2 font-medium">{key}</td><td className="max-w-md break-words p-2">{display(oldData[key])}</td><td className="max-w-md break-words p-2">{display(newData[key])}</td></tr>)}</tbody></table></div>;
}
