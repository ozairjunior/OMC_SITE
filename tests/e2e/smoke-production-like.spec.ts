import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createLocalSmokeAdmin, currentTotp, localServiceClient, removeLocalSmokeAdmin, smokeAdminEmail, smokeAdminPassword } from './helpers/local-smoke-admin';

let totpSecret = '';
let smokeAdminId = '';
const smokeRun = Date.now();
const categoryName = `OMC SMOKE FERRAMENTAS ${smokeRun}`;
const brandName = `OMC SMOKE MARCA ${smokeRun}`;
const productName = `OMC SMOKE PRODUTO 001 ${smokeRun}`;
const categorySlug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const brandSlug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
let categoryId = '';
let brandId = '';
let productId = '';
let variantId = '';
let productSlug = '';
let orderId = '';

function localAnonClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321') throw new Error('AMBIENTE BLOQUEADO: Supabase não local.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}

async function loginSmoke(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(smokeAdminEmail());
  await page.locator('input[type="password"]').fill(smokeAdminPassword());
  const attempt = page.waitForResponse((response) => response.url().includes('/api/auth/login-attempt'));
  await page.getByRole('button', { name: 'Entrar no Painel' }).click();
  expect((await attempt).status()).not.toBe(503);
  await page.waitForURL(/\/admin\/seguranca|\/admin\/dashboard/);
  if (page.url().includes('/admin/seguranca')) {
    await page.getByPlaceholder('000000').fill(currentTotp(totpSecret));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await page.waitForURL(/\/admin\/dashboard$/);
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const service = localServiceClient();
  await service.from('products').delete().eq('name', productName);
  await service.from('categories').delete().eq('name', categoryName);
  await service.from('brands').delete().eq('name', brandName);
  const admin = await createLocalSmokeAdmin();
  smokeAdminId = admin.id;
  totpSecret = admin.totpSecret;
});
test.afterAll(async () => {
  const service = localServiceClient();
  if (productId) await service.from('products').delete().eq('id', productId);
  if (categoryId) await service.from('categories').delete().eq('id', categoryId);
  if (brandId) await service.from('brands').delete().eq('id', brandId);
  await removeLocalSmokeAdmin();
});

test('cria admin local, autentica com MFA/AAL2 e acessa o dashboard', async ({ page }) => {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(smokeAdminEmail());
  await page.locator('input[type="password"]').fill(smokeAdminPassword());
  const attempt = page.waitForResponse((response) => response.url().includes('/api/auth/login-attempt'));
  await page.getByRole('button', { name: 'Entrar no Painel' }).click();
  expect((await attempt).status()).not.toBe(503);
  await page.waitForURL(/\/admin\/seguranca|\/admin\/dashboard/);
  if (page.url().includes('/admin/seguranca')) {
    await page.getByPlaceholder('000000').fill(currentTotp(totpSecret));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await page.waitForURL(/\/admin\/dashboard$/);
  }
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(1);
});

test('cadastra categoria e marca pela interface e valida persistência local', async ({ page }) => {
  await loginSmoke(page);
  await page.goto('/admin/categorias');
  await page.getByPlaceholder('Nova categoria').fill(categoryName);
  const categoryResponse = page.waitForResponse((response) => response.url().includes('/api/admin/categories') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  const createdCategory = await (await categoryResponse).json();
  await expect(page.getByRole('row', { name: new RegExp(categoryName) }).getByRole('textbox').first()).toBeVisible();
  await page.goto('/admin/marcas');
  await page.getByPlaceholder('Nova marca').fill(brandName);
  const brandResponse = page.waitForResponse((response) => response.url().includes('/api/admin/brands') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  const createdBrand = await (await brandResponse).json();
  await expect(page.getByRole('row', { name: new RegExp(brandName) }).getByRole('textbox').first()).toBeVisible();
  const service = localServiceClient();
  const createdCategoryId = createdCategory.id ?? createdCategory.data?.id;
  expect(createdCategoryId).toMatch(/^[0-9a-f-]{36}$/i);
  const { data: category } = await service.from('categories').select('id,slug,is_active').eq('id', createdCategoryId).maybeSingle();
  const { data: brands, error: brandError } = await service.from('brands').select('id').eq('slug', brandSlug).limit(1);
  if (brandError) throw new Error(`Validação local da marca falhou: ${brandError.message}`);
  const brand = brands?.[0];
  expect(category?.slug).toBe(categorySlug);
  expect(category?.is_active).toBe(true);
  expect(brand?.id).toBeTruthy();
  categoryId = category?.id || '';
  brandId = brand?.id || '';
});

test('cria produto com variante Padrão sem UUID e valida o banco local', async ({ page }) => {
  await loginSmoke(page);
  await page.goto('/admin/produtos/novo');
  await page.locator('[name="name"]').fill(productName);
  await page.locator('[name="price"]').fill('100');
  await page.locator('[name="categoryId"]').selectOption(categoryId);
  await page.locator('[name="brandId"]').selectOption(brandId);
  await page.locator('[name="variants.0.name"]').fill('Padrão');
  await page.locator('[name="variants.0.stockQuantity"]').fill('0');
  await page.locator('[name="variants.0.salePrice"]').fill('');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await page.waitForURL(/\/admin\/produtos$/);
  const service = localServiceClient();
  const { data: product, error } = await service.from('products').select('id,slug,sku,price,category_id,brand_id,product_variants(id,name,sku,stock_quantity,sale_price)').eq('name', productName).single();
  expect(error).toBeNull();
  expect(product?.sku).toBeTruthy();
  expect(product?.price).toBe(100);
  expect(product?.category_id).toBe(categoryId);
  expect(product?.brand_id).toBe(brandId);
  expect(product?.product_variants).toHaveLength(1);
  const variant = product?.product_variants?.[0];
  expect(variant?.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(variant?.name).toBe('Padrão');
  expect(Number(variant?.stock_quantity)).toBe(0);
  expect(variant?.sku).toBeTruthy();
  expect(Number(variant?.sale_price ?? product?.price)).toBe(100);
  productId = product?.id || '';
  variantId = variant?.id || '';
  productSlug = product?.slug || '';
});

test('edita o produto sem duplicar produto ou variante', async ({ page }) => {
  await loginSmoke(page);
  await page.goto(`/admin/produtos/${productId}`);
  await page.locator('[name="shortDescription"]').fill('Produto smoke editado');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await page.waitForURL(/\/admin\/produtos$/);
  const service = localServiceClient();
  const { data: products } = await service.from('products').select('id,sku,short_description,product_variants(id)').eq('name', productName);
  expect(products).toHaveLength(1);
  expect(products?.[0].id).toBe(productId);
  expect(products?.[0].short_description).toBe('Produto smoke editado');
  expect(products?.[0].product_variants).toHaveLength(1);
});

test('registra entrada e rejeita saída que deixaria estoque negativo', async ({ page }) => {
  await loginSmoke(page);
  await page.goto('/admin/estoque');
  const variantSelect = page.locator('form select').first();
  await variantSelect.selectOption(variantId);
  await page.locator('form select').nth(1).selectOption('purchase');
  await page.locator('form input[type="number"]').fill('10');
  await page.locator('form textarea').fill('OMC smoke entrada');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Movimentação registrada.')).toBeVisible();
  const service = localServiceClient();
  const { data: afterEntry } = await service.from('product_variants').select('stock_quantity').eq('id', variantId).single();
  expect(Number(afterEntry?.stock_quantity)).toBe(10);
  const { data: movement } = await service.from('stock_movements').select('quantity,new_quantity,variant_id,type,reason,user_id').eq('variant_id', variantId).eq('reason', 'OMC smoke entrada').order('created_at', { ascending: false }).limit(1).single();
  expect(Number(movement?.quantity)).toBe(10);
  expect(Number(movement?.new_quantity)).toBe(10);
  expect(movement?.type).toBe('purchase');
  expect(movement?.user_id).toBe(smokeAdminId);

  await page.locator('form select').nth(1).selectOption('sale');
  await page.locator('form input[type="number"]').fill('11');
  await page.locator('form textarea').fill('OMC smoke saída inválida');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText(/NÃ£o foi possÃ­vel ajustar o estoque|Não foi possível ajustar o estoque/)).toBeVisible();
  const { data: afterRejected } = await service.from('product_variants').select('stock_quantity').eq('id', variantId).single();
  expect(Number(afterRejected?.stock_quantity)).toBe(10);
  const { data: invalidMovement } = await service.from('stock_movements').select('id').eq('variant_id', variantId).eq('reason', 'OMC smoke saída inválida');
  expect(invalidMovement).toHaveLength(0);
});

test('catálogo público e carrinho desktop usam o produto criado', async ({ page }) => {
  await page.goto('/produtos');
  await expect(page.getByText(productName)).toBeVisible();
  await expect(page.getByText('R$ 100.00')).toBeVisible();
  await page.goto(`/produtos/${productSlug}`);
  await expect(page.getByRole('heading', { name: productName })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar ao Carrinho' }).click();
  await expect(page.getByText('1').first()).toBeVisible();
  await page.locator('a[href="/carrinho"]').click();
  await expect(page.getByText(productName)).toBeVisible();
  await expect(page.getByText(/R\$ 100\.00 \/ UN/)).toBeVisible();
  await expect(page.getByText(/Total Estimado:/)).toBeVisible();
});

test.describe('carrinho mobile/touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  test('toque real adiciona o produto ao carrinho', async ({ page }) => {
    await page.goto(`/produtos/${productSlug}`);
    await page.getByRole('button', { name: 'Adicionar ao Carrinho' }).tap();
    await expect(page.locator('a[href="/carrinho"]')).toContainText('1');
    await page.locator('a[href="/carrinho"]').tap();
    await expect(page.getByText(productName)).toBeVisible();
  });
});

test('checkout cria pedido e intercepta WhatsApp sem navegação externa', async ({ page }) => {
  await page.goto(`/produtos/${productSlug}`);
  await page.getByRole('button', { name: 'Adicionar ao Carrinho' }).click();
  await page.locator('a[href="/carrinho"]').click();
  await page.getByRole('link', { name: /Avançar para o Checkout/ }).click();
  await page.locator('[name="customerName"]').fill('OMC SMOKE CLIENTE');
  await page.locator('[name="customerPhone"]').fill('83999999999');
  await page.locator('[name="address"]').fill('Rua Smoke Teste');
  await page.locator('[name="addressNumber"]').fill('100');
  await page.locator('[name="neighborhood"]').fill('Smoke');
  await page.locator('[name="city"]').fill('Joao Pessoa');
  await page.getByRole('button', { name: /Enviar solicitação/ }).click();
  await expect(page.getByText(/Solicitação registrada com sucesso/)).toBeVisible();
  const whatsapp = page.getByRole('link', { name: /Abrir WhatsApp/ });
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  const service = localServiceClient();
  const { data: order } = await service.from('orders').select('id,status,customer_name,total,order_items(quantity,variant_id)').eq('customer_name', 'OMC SMOKE CLIENTE').order('created_at', { ascending: false }).limit(1).maybeSingle();
  expect(order?.status).toBe('request_created');
  expect(order?.total).toBe(100);
  expect(order?.order_items?.[0]?.quantity).toBe(1);
  orderId = order?.id || '';
});

test('admin encontra pedido, confirma e valida baixa de estoque', async ({ page }) => {
  await loginSmoke(page);
  await page.goto('/admin/pedidos');
  await expect(page.getByText('OMC SMOKE CLIENTE')).toBeVisible();
  const card = page.locator('div').filter({ hasText: 'OMC SMOKE CLIENTE' }).filter({ has: page.locator('select') }).last();
  await card.locator('select').selectOption('confirmed');
  await expect.poll(async () => (await localServiceClient().from('orders').select('status').eq('id', orderId).single()).data?.status).toBe('confirmed');
  const { data: variant } = await localServiceClient().from('product_variants').select('stock_quantity').eq('id', variantId).single();
  expect(Number(variant?.stock_quantity)).toBe(9);
  const { data: movement } = await localServiceClient().from('stock_movements').select('quantity,new_quantity').eq('variant_id', variantId).eq('quantity', -1).order('created_at', { ascending: false }).limit(1).maybeSingle();
  expect(Number(movement?.quantity)).toBe(-1);
  expect(Number(movement?.new_quantity)).toBe(9);
});

test('rate limit registra login_failure/login_ip e bloqueia após o limite', async ({ page }) => {
  const service = localServiceClient();
  await service.from('order_rate_limits').delete().in('scope', ['login_ip', 'login_failure']);
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(smokeAdminEmail());
  await page.locator('input[type="password"]').fill(`${smokeAdminPassword()}-incorreta`);
  const failureResponse = page.waitForResponse((response) => response.url().includes('/api/auth/login-failure'));
  await page.getByRole('button', { name: 'Entrar no Painel' }).click();
  expect((await failureResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.locator('input[type="password"]').fill(smokeAdminPassword());
  const allowed = page.waitForResponse((response) => response.url().includes('/api/auth/login-attempt'));
  await page.getByRole('button', { name: 'Entrar no Painel' }).click();
  expect((await allowed).status()).toBe(200);
  await page.waitForURL(/\/admin\/seguranca|\/admin\/dashboard/);
  if (page.url().includes('/admin/seguranca')) {
    await page.getByPlaceholder('000000').fill(currentTotp(totpSecret));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await page.waitForURL(/\/admin\/dashboard$/);
  }
  const { data: scopes } = await service.from('order_rate_limits').select('scope').in('scope', ['login_ip', 'login_failure']);
  expect(new Set((scopes || []).map((row) => row.scope))).toEqual(new Set(['login_ip', 'login_failure']));

  await service.from('order_rate_limits').delete().in('scope', ['login_ip', 'login_failure']);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await page.request.post('/api/auth/login-failure');
    expect(response.status()).toBe(200);
  }
  const blocked = await page.request.post('/api/auth/login-attempt');
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
  await service.from('order_rate_limits').delete().in('scope', ['login_ip', 'login_failure']);
});

test('logout encerra a sessão e impede retorno ao dashboard', async ({ page }) => {
  await loginSmoke(page);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/admin\/dashboard/);
});
