import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const adminId = '00000000-0000-4000-8000-000000000001';
const categoryId = '00000000-0000-4000-8000-000000000002';
const historyMigration = '20260905_preserve_used_product_variants.sql';
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

type Variant = { id?: string; name: string; stockQuantity: number; priceAdjustment: number; isActive: boolean };
const newVariant = (name: string): Variant => ({ name, stockQuantity: 10, priceAdjustment: 0, isActive: true });
const payload = (variants: Variant[], extra = {}) => ({
  categoryId, name: 'Produto teste', slug: 'produto-teste', unit: 'UN',
  price: 10, promotionalPrice: null, minimumQuantity: 1, stepQuantity: 1,
  variants, ...extra,
});

let db: PGlite;
let productId: string;
let used: Variant;
let unused: Variant;
let kept: Variant;

async function save(variants: Variant[], extra = {}, id: string | null = productId) {
  const { rows } = await db.query<{ id: string }>(
    'SELECT public.admin_save_product($1, $2::jsonb, $3) AS id',
    [id, JSON.stringify(payload(variants, extra)), adminId],
  );
  return rows[0].id;
}

async function order(variantId = used.id, idempotencyKey = crypto.randomUUID()) {
  const { rows } = await db.query<{ result: { orderId: string } }>(`
    SELECT public.create_catalog_order(
      'Cliente teste', '83999999999', 'Rua teste', '10', 'Centro', 'Joao Pessoa',
      NULL, NULL, NULL, NULL, $1::jsonb, repeat('a', 64), repeat('b', 32), $2
    ) AS result`, [JSON.stringify([{ variant_id: variantId, quantity: 2 }]), idempotencyKey]);
  return rows[0].result.orderId;
}

async function transition(orderId: string, status: string) {
  await db.query('SELECT public.admin_transition_order_status($1, $2::public.order_status, $3)', [orderId, status, adminId]);
}

async function storedVariant(id = used.id) {
  const { rows } = await db.query<{ id: string; is_active: boolean; stock_quantity: string }>(
    'SELECT id, is_active, stock_quantity FROM public.product_variants WHERE id = $1', [id],
  );
  return rows[0];
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  // Somente a infraestrutura de identidade do Supabase e simulada.
  // Tabelas, RLS, RPCs, constraints e triggers da aplicacao vem das migrations reais.
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object('aal', COALESCE(NULLIF(current_setting('request.jwt.claim.aal', true), ''), 'aal2'))
    $$;
  `);
  for (const name of [
    '20260728_initial_schema.sql',
    '20260729_add_search_indexes.sql',
    '20260729_add_product_helpers.sql',
    '20260731_fix_all_schema_and_rls.sql',
    '20260815_create_auth_profiles.sql',
    '20260815_operational_integrity.sql',
    '20260904_positive_variant_prices.sql',
    historyMigration,
    '20260906_order_rate_limit_idempotency_analytics.sql',
    '20260908_require_mfa_for_staff.sql',
  ]) await db.exec(await migration(name));

  await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [adminId, 'admin@example.test']);
  await db.query("UPDATE public.profiles SET role = 'admin' WHERE id = $1", [adminId]);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [adminId]);
  await db.query("INSERT INTO public.categories(id, name, slug) VALUES ($1, 'Teste', 'teste')", [categoryId]);
}, 30_000);

beforeEach(async () => {
  await db.exec('BEGIN');
  productId = await save([newVariant('Usada'), newVariant('Sem uso'), newVariant('Mantida')], {}, null);
  const { rows } = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM public.product_variants WHERE product_id = $1', [productId],
  );
  const variant = (name: string) => ({ ...newVariant(name), id: rows.find((row) => row.name === name)!.id });
  used = variant('Usada'); unused = variant('Sem uso'); kept = variant('Mantida');
});

afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

describe('historico operacional das variacoes no PostgreSQL', () => {
  it('desativa variacao usada, exclui a sem uso e registra os IDs na auditoria', async () => {
    const orderId = await order();
    await save([kept]);
    expect(await storedVariant()).toMatchObject({ id: used.id, is_active: false, stock_quantity: '10.00' });
    expect(await storedVariant(unused.id)).toBeUndefined();
    expect(await storedVariant(kept.id)).toMatchObject({ is_active: true });
    const { rows } = await db.query('SELECT variant_id, variant_name_snapshot, unit_price FROM public.order_items WHERE order_id = $1', [orderId]);
    expect(rows).toEqual([{ variant_id: used.id, variant_name_snapshot: 'Usada', unit_price: '10.00' }]);
    const audit = await db.query<{ new_data: { archived_variant_ids: string[]; deleted_variant_ids: string[] } }>(
      "SELECT new_data FROM public.admin_audit_logs WHERE entity_id = $1 AND action = 'product_updated'", [productId],
    );
    expect(audit.rows[0].new_data).toMatchObject({ archived_variant_ids: [used.id], deleted_variant_ids: [unused.id] });
  });

  it('continua devolvendo estoque apos remover uma variacao de pedido confirmado', async () => {
    const orderId = await order();
    await transition(orderId, 'confirmed');
    expect((await storedVariant()).stock_quantity).toBe('8.00');
    await save([kept]);
    await transition(orderId, 'cancelled');
    expect(await storedVariant()).toMatchObject({ is_active: false, stock_quantity: '10.00' });
    await transition(orderId, 'cancelled');
    expect((await storedVariant()).stock_quantity).toBe('10.00');
  });

  it('permite confirmar pedido existente depois de desativar sua variacao', async () => {
    const orderId = await order();
    await save([kept]);
    await transition(orderId, 'confirmed');
    expect(await storedVariant()).toMatchObject({ is_active: false, stock_quantity: '8.00' });
  });

  it('preserva tambem pedidos cancelados e permite reativar a mesma variacao', async () => {
    const orderId = await order();
    await transition(orderId, 'cancelled');
    await save([kept]);
    await save([kept]);
    expect((await storedVariant()).is_active).toBe(false);
    await save([kept, used]);
    expect(await storedVariant()).toMatchObject({ id: used.id, is_active: true });
  });

  it('impede exclusao direta de variacao usada e exclusao em cascata do produto', async () => {
    await order();
    for (const [table, id] of [['product_variants', used.id], ['products', productId]]) {
      await db.exec('SAVEPOINT deletion');
      await expect(db.query(`DELETE FROM public.${table} WHERE id = $1`, [id])).rejects.toMatchObject({ code: '23001' });
      await db.exec('ROLLBACK TO SAVEPOINT deletion');
    }
    expect((await storedVariant()).id).toBe(used.id);
  });

  it('rejeita novo checkout da variacao inativa sem criar pedido parcial', async () => {
    await order();
    await save([kept]);
    await db.exec('SAVEPOINT checkout');
    await expect(order()).rejects.toThrow('Variacao indisponivel');
    await db.exec('ROLLBACK TO SAVEPOINT checkout');
    const { rows } = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.orders');
    expect(rows[0].count).toBe(1);
  });

  it('mantem a validacao de preco e desfaz desativacoes quando o cadastro falha', async () => {
    await order();
    await db.exec('SAVEPOINT invalid_price');
    await expect(save([{ ...kept, priceAdjustment: -10 }])).rejects.toMatchObject({ code: '23514' });
    await db.exec('ROLLBACK TO SAVEPOINT invalid_price');
    expect((await storedVariant()).is_active).toBe(true);
    expect(await storedVariant(unused.id)).toBeDefined();
    const { rows } = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.admin_audit_logs WHERE action = 'product_updated'");
    expect(rows[0].count).toBe(0);
  });

  it('continua exigindo acesso administrativo', async () => {
    await db.exec('SAVEPOINT denied');
    await db.exec("SELECT set_config('request.jwt.claim.sub', '', true)");
    await expect(save([kept])).rejects.toThrow('Acesso administrativo negado');
    await db.exec('ROLLBACK TO SAVEPOINT denied');
    expect(await storedVariant()).toBeDefined();
  });

  it('rejeita preco promocional com ajuste que zera o valor persistido em centavos', async () => {
    await db.exec('SAVEPOINT rounded_price');
    await expect(save([{ ...kept, priceAdjustment: -4.999 }], { promotionalPrice: 5 })).rejects.toMatchObject({ code: '23514' });
    await db.exec('ROLLBACK TO SAVEPOINT rounded_price');
    expect(await storedVariant(kept.id)).toBeDefined();
  });

  it('rejeita no checkout um preco negativo legado', async () => {
    await db.query('UPDATE public.product_variants SET price_adjustment = -20 WHERE id = $1', [used.id]);
    await db.exec('SAVEPOINT legacy_price');
    await expect(order()).rejects.toMatchObject({ code: '23514' });
    await db.exec('ROLLBACK TO SAVEPOINT legacy_price');
    const { rows } = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.orders');
    expect(rows[0].count).toBe(0);
  });
});
