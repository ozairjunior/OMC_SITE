import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
let db: PGlite;
let variantId: string;

async function createOrder(key: string, name = 'Cliente teste') {
  const { rows } = await db.query<{ result: { orderId: string; idempotentReplay: boolean } }>(`
    SELECT public.create_catalog_order($1, '83999999999', 'Rua teste', '10', 'Centro',
      'Joao Pessoa', NULL, NULL, NULL, NULL, $2::jsonb, repeat('f', 64), repeat('t', 32), $3) AS result`,
    [name, JSON.stringify([{ variant_id: variantId, quantity: 1 }]), key]);
  return rows[0].result;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('aal','aal2') $$;`);
  for (const name of ['20260728_initial_schema.sql', '20260729_add_search_indexes.sql',
    '20260729_add_product_helpers.sql', '20260731_fix_all_schema_and_rls.sql',
    '20260815_operational_integrity.sql', '20260904_positive_variant_prices.sql',
    '20260905_preserve_used_product_variants.sql', '20260906_order_rate_limit_idempotency_analytics.sql',
    '20260908_require_mfa_for_staff.sql']) {
    await db.exec(await migration(name));
  }
  const category = crypto.randomUUID();
  const product = crypto.randomUUID();
  variantId = crypto.randomUUID();
  await db.query("INSERT INTO categories(id,name,slug) VALUES($1,'Categoria','categoria')", [category]);
  await db.query("INSERT INTO products(id,category_id,name,slug,unit,price) VALUES($1,$2,'Produto','produto','UN',10)", [product, category]);
  await db.query("INSERT INTO product_variants(id,product_id,name,stock_quantity) VALUES($1,$2,'Padrao',10)", [variantId, product]);
}, 30_000);
afterAll(async () => { await db.close(); });

describe('rate limit e idempotencia no PostgreSQL', () => {
  it('incrementa o contador atomicamente e bloqueia depois de 30 tentativas', async () => {
    const fingerprint = 'a'.repeat(64);
    const results = await Promise.all(Array.from({ length: 31 }, () =>
      db.query<{ value: { allowed: boolean } }>("SELECT consume_order_rate_limit($1,'attempt') AS value", [fingerprint])));
    expect(results.flatMap((result) => result.rows).filter((row) => row.value.allowed)).toHaveLength(30);
    const count = await db.query<{ request_count: number }>('SELECT request_count FROM order_rate_limits WHERE fingerprint=$1', [fingerprint]);
    expect(count.rows[0].request_count).toBe(31);
  });

  it('devolve o mesmo pedido no retry e não duplica eventos', async () => {
    const key = crypto.randomUUID();
    const first = await createOrder(key);
    const replay = await createOrder(key);
    expect(replay).toMatchObject({ orderId: first.orderId, idempotentReplay: true });
    const orders = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM orders WHERE idempotency_key=$1', [key]);
    const events = await db.query<{ event_name: string }>('SELECT event_name FROM analytics_events WHERE order_id=$1 ORDER BY event_name', [first.orderId]);
    expect(orders.rows[0].count).toBe(1);
    expect(events.rows.map((row) => row.event_name)).toEqual(['order_created']);
  });

  it('rejeita reutilização da chave com payload diferente', async () => {
    const key = crypto.randomUUID();
    await createOrder(key);
    await expect(createOrder(key, 'Outro cliente')).rejects.toMatchObject({ code: '23505' });
  });

  it('registra whatsapp_clicked uma única vez e somente quando chamado', async () => {
    const created = await createOrder(crypto.randomUUID());
    let events = await db.query<{ event_name: string }>('SELECT event_name FROM analytics_events WHERE order_id=$1', [created.orderId]);
    expect(events.rows.some((row) => row.event_name === 'whatsapp_clicked')).toBe(false);
    await db.query("SELECT mark_order_whatsapp_clicked($1, repeat('t',32), 'session')", [created.orderId]);
    await db.query("SELECT mark_order_whatsapp_clicked($1, repeat('t',32), 'session')", [created.orderId]);
    events = await db.query<{ event_name: string }>("SELECT event_name FROM analytics_events WHERE order_id=$1 AND event_name='whatsapp_clicked'", [created.orderId]);
    expect(events.rows).toHaveLength(1);
  });

  it('registra link mostrado separadamente e de forma idempotente', async () => {
    const created = await createOrder(crypto.randomUUID());
    await db.query("SELECT mark_order_whatsapp_link_shown($1, repeat('t',32), 'session')", [created.orderId]);
    await db.query("SELECT mark_order_whatsapp_link_shown($1, repeat('t',32), 'session')", [created.orderId]);
    const events = await db.query<{ event_name: string }>("SELECT event_name FROM analytics_events WHERE order_id=$1 AND event_name='whatsapp_link_shown'", [created.orderId]);
    expect(events.rows).toHaveLength(1);
  });
});
