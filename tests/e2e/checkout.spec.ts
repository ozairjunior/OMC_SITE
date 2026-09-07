import { test, expect } from '@playwright/test';

test.skip(
  process.env.RUN_CHECKOUT_E2E !== 'true',
  'Defina RUN_CHECKOUT_E2E=true e use exclusivamente um projeto Supabase de testes com catálogo.'
);

test.describe('Fluxo Completo do Catálogo ao Checkout', () => {
  test('Deve permitir buscar um produto, adicionar ao carrinho e finalizar o orçamento', async ({ page }) => {
    // 1. Acessa a página do catálogo público
    await page.goto('/produtos');
    await expect(page.locator('h1')).toContainText('Catálogo de Produtos');

    // 2. Realiza busca por um produto
    const searchInput = page.locator('input[type="search"], input[placeholder*="Buscar"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Cimento');
      await page.waitForTimeout(500); // Aguarda debounce
    }

    // 3. Clica no primeiro card de produto disponível
    const productCard = page.locator('.group').first();
    await expect(productCard).toBeVisible();
    await productCard.click();

    // 4. Adiciona o produto ao carrinho
    const addToCartBtn = page.getByRole('button', { name: /Adicionar ao Carrinho/i });
    await expect(addToCartBtn).toBeVisible();
    await addToCartBtn.click();

    // 5. Navega até a página do carrinho
    await page.goto('/carrinho');
    await expect(page.locator('h1')).toContainText('Carrinho de Compras');

    // 6. Avança para a página de checkout
    const checkoutLink = page.getByRole('link', { name: /Avançar para o Checkout/i });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    // 7. Preenche os dados do cliente no formulário
    await page.fill('input[name="customerName"]', 'Cliente Teste Automático');
    await page.fill('input[name="customerPhone"]', '(83) 99999-9999');
    await page.fill('input[name="address"]', 'Rua de Teste');
    await page.fill('input[name="addressNumber"]', '123');
    await page.fill('input[name="neighborhood"]', 'Centro');
    await page.fill('input[name="city"]', 'João Pessoa');

    // 8. Envia o formulário de orçamento
    const submitBtn = page.getByRole('button', { name: /Enviar solicitação para o WhatsApp/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 9. Confirma que o pedido foi persistido antes de abrir o aplicativo externo.
    await expect(page.getByRole('heading', { name: /Solicitação registrada com sucesso/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Abrir WhatsApp/i })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  });
});
