'use client';

import { useMemo, useState } from 'react';

type CategoryRow = { id: string; name: string; slug: string; display_order: number; is_active: boolean; products?: Array<{ count: number }> };

async function messageFrom(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string | { message?: string } } | null;
  return typeof body?.error === 'string' ? body.error : body?.error?.message ?? 'Não foi possível concluir a operação.';
}
function sortRows(rows: CategoryRow[]) { return [...rows].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'pt-BR')); }

export function CategoryManager({ initial }: { initial: CategoryRow[] }) {
  const [rows, setRows] = useState(sortRows(initial));
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())), [rows, query]);

  async function add(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const displayOrder = rows.length ? Math.max(...rows.map((row) => row.display_order)) + 10 : 0;
    const response = await fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, displayOrder }) });
    if (!response.ok) return setError(await messageFrom(response));
    const created = await response.json() as CategoryRow;
    setRows((current) => sortRows([...current, { ...created, products: [] }])); setName('');
  }
  async function save(row: CategoryRow, changes: { name?: string; displayOrder?: number; isActive?: boolean }) {
    setBusyId(row.id); setError(null);
    const response = await fetch(`/api/admin/categories/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    if (!response.ok) { setError(await messageFrom(response)); setBusyId(null); return; }
    const updated = await response.json() as CategoryRow;
    setRows((current) => sortRows(current.map((item) => item.id === row.id ? { ...item, ...updated, products: item.products } : item))); setBusyId(null);
  }
  return <div className="space-y-4">
    <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row"><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova categoria" className="flex-1 rounded border p-2" /><button className="rounded bg-amber-600 px-4 py-2 text-white">Cadastrar</button></form>
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar categorias" className="w-full rounded border p-2" />
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded border bg-white"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Nome</th><th className="p-3">Ordem</th><th className="p-3">Produtos</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead><tbody>{filtered.map((row) => <CategoryEditor key={row.id} row={row} busy={busyId === row.id} onSave={(changes) => save(row, changes)} />)}</tbody></table></div>
  </div>;
}

function CategoryEditor({ row, busy, onSave }: { row: CategoryRow; busy: boolean; onSave: (changes: { name?: string; displayOrder?: number; isActive?: boolean }) => void }) {
  const [name, setName] = useState(row.name); const [order, setOrder] = useState(row.display_order);
  return <tr className="border-b last:border-0"><td className="p-3"><input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded border p-2" /></td><td className="p-3"><input type="number" value={order} onChange={(event) => setOrder(Number(event.target.value))} className="w-24 rounded border p-2" /></td><td className="p-3 text-slate-500">{row.products?.[0]?.count ?? 0}</td><td className="p-3">{row.is_active ? 'Ativa' : 'Inativa'}</td><td className="p-3"><div className="flex gap-2"><button type="button" disabled={busy || name.trim().length < 2} onClick={() => onSave({ name: name.trim(), displayOrder: order })} className="rounded border px-3 py-2 disabled:opacity-50">Salvar</button><button type="button" disabled={busy} onClick={() => onSave({ isActive: !row.is_active })} className="rounded border px-3 py-2 disabled:opacity-50">{row.is_active ? 'Desativar' : 'Ativar'}</button></div></td></tr>;
}
