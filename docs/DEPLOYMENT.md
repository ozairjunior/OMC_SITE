# Implantação segura

## MFA e constraints históricas

Aplicar `20260908_require_mfa_for_staff.sql` depois das migrations de pedidos.
Administradores e managers passam a exigir sessão Supabase `aal2`; o painel
oferece a tela `/admin/seguranca` para cadastrar TOTP e a tela de login para
verificar o código. O mesmo requisito é aplicado por `public.has_role`, portanto
chamadas diretas à anon key não contornam o MFA.

Para validar dados antigos, execute primeiro:

```sql
SELECT id, name, price, promotional_price, minimum_quantity, step_quantity
FROM public.products
WHERE price <= 0 OR minimum_quantity <= 0 OR step_quantity <= 0
   OR (promotional_price IS NOT NULL AND promotional_price <= 0);

SELECT id, product_id, name, stock_quantity, low_stock_threshold
FROM public.product_variants
WHERE stock_quantity < 0 OR low_stock_threshold < 0;

-- Antes de validar 20260912, corrija tambem estas linhas:
SELECT id, price, promotional_price FROM public.products
WHERE promotional_price IS NOT NULL AND promotional_price >= price;
SELECT id, subtotal, total FROM public.orders WHERE subtotal < 0 OR total < 0;
SELECT id, order_id, quantity, unit_price, total_price FROM public.order_items
WHERE quantity <= 0 OR unit_price < 0 OR total_price < 0;
```

Corrija as linhas retornadas e então aplique
`20260910_validate_legacy_integrity_constraints.sql`. Se ainda existir dado
inválido, o PostgreSQL abortará a migration sem alterar a constraint.

O rate limit adicional do login bloqueia a sexta tentativa no intervalo de dez
minutos por IP confiável. O WAF da Vercel pode acrescentar challenge/CAPTCHA em
uma regra de firewall quando houver tráfego suspeito, sem exigir CAPTCHA no
primeiro login.

## Imagens e catálogo público

Aplique `20260907_rls_images_reconciliation.sql` depois das migrations anteriores.
Ela impede que `product_images` e `product_variants` de produtos inativos sejam
lidos pela anon key e torna o bucket `product-images` privado. As páginas públicas
e administrativas passam a usar URLs assinadas de curta duração.

A migration `20260907` não remove arquivos. A rota de reconciliação é executada
diariamente pelo cron da Vercel (`vercel.json`) e remove somente objetos WebP em
`products/<uuid>/<uuid>.webp` que não possuem linha correspondente em
`product_images`. Configure `CRON_SECRET` na Vercel com pelo menos 32 caracteres;
o cron envia esse valor como Bearer token. O endpoint rejeita chamadas sem esse
segredo e não aceita caminhos fora do formato controlado.

## Pedidos públicos e rate limit

Aplique `20260906_order_rate_limit_idempotency_analytics.sql` depois da migration
de variações. Ela cria um contador atômico separado de `orders`, protege o limite
final com advisory lock, adiciona `idempotency_key` único e separa os eventos
`order_created`, `whatsapp_link_shown` e `whatsapp_clicked`.

Crie `ORDER_RATE_LIMIT_SECRET` nos ambientes Production e Preview da Vercel com
um valor aleatório de pelo menos 32 caracteres. Mantenha o mesmo valor entre
deploys: ele protege a identidade de rede e permite que retries gerem o mesmo
token de rastreamento. Nunca use o prefixo `NEXT_PUBLIC_`.

No painel da Vercel, abra **Firewall → Configure → New Rule** e publique uma
regra com estas opções:

- condição: `Request Path` igual a `/api/orders`;
- método: `POST`, se o plano oferecer essa condição;
- ação: `Rate Limit`, janela fixa de 10 minutos e limite inicial de 30 por IP;
- resposta: `429`.

Observe os bloqueios antes de apertar o limite. Os contadores do WAF são por
região, por isso o contador atômico do Supabase continua sendo a última camada.
A API aceita em produção apenas `x-vercel-forwarded-for`, que a Vercel fornece e
protege contra spoofing; outros proxies falham fechados até terem uma estratégia
explícita de confiança. O `User-Agent` não participa da identidade.

O checkout mantém uma UUID de idempotência no `sessionStorage` enquanto a
requisição não termina. Reenvios retornam o pedido original; reutilizar a chave
com outro payload ou outra identidade é rejeitado. O clique no WhatsApp é
registrado pelo `onClick`, enquanto a exibição do link é registrada após a tela
de sucesso ser renderizada.

## Upload de imagens

Uploads continuam limitados a 5 MB. O servidor ignora MIME e extensão como prova,
decodifica os bytes com Sharp, limita a imagem a 40 megapixels e 2400 × 2400,
aplica a orientação, remove metadados e grava sempre WebP com caminho e MIME
controlados. Configure a função da Vercel com memória suficiente para o Sharp e
acompanhe duração e erros de upload após o deploy.

Depois de `20260904_positive_variant_prices.sql`, aplique
`20260905_preserve_used_product_variants.sql` no SQL Editor do Supabase.
Ela atualiza `admin_save_product` e a chave estrangeira de `order_items.variant_id`:
variações omitidas do cadastro que possuem itens de pedido são desativadas;
somente as sem itens de pedido são excluídas. O status do pedido não altera essa
regra. A auditoria registra os IDs desativados e excluídos.

Exclusões diretas de variações usadas, inclusive via exclusão do produto em
cascata, passam a ser bloqueadas. Use o arquivamento para retirar produtos do
catálogo. Variações desativadas permanecem no formulário administrativo e podem
ser reativadas. Vínculos que já estavam nulos não são recuperados pela migration.

Antes de publicar na Vercel, execute `npm test`, `npm run lint` e `npm run build`.
Configure as variáveis abaixo no ambiente correspondente da Vercel e aplique as
migrations no projeto Supabase correspondente antes da publicação. O deploy da
aplicação não aplica SQL automaticamente. Os testes locais de PostgreSQL estão
documentados em [testes-banco.md](testes-banco.md).

Aplique também `20260904_positive_variant_prices.sql`: ela rejeita preço final
menor ou igual a zero nas RPCs de salvar produto e criar pedido. A validação do
cadastro considera os valores persistidos em centavos e desfaz a transação em
caso de erro. Dados antigos não são alterados automaticamente; o checkout
rejeita variações com preço inválido até que o cadastro seja corrigido.

Para localizar esses cadastros:

```sql
SELECT p.id AS product_id, v.id AS variant_id, p.name, v.name AS variant_name,
  COALESCE(p.promotional_price, p.price) + COALESCE(v.price_adjustment, 0) AS final_price
FROM public.products p
JOIN public.product_variants v ON v.product_id = p.id
WHERE COALESCE(p.promotional_price, p.price) + COALESCE(v.price_adjustment, 0) <= 0
  OR COALESCE(p.promotional_price, p.price) + COALESCE(v.price_adjustment, 0) = 'NaN'::NUMERIC;
```

1. Aplique todas as migrations, incluindo `20260815110000_operational_integrity.sql`, antes de publicar o novo código.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_WHATSAPP_NUMBER` no ambiente do servidor.
3. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no navegador nem use o prefixo `NEXT_PUBLIC_` nela.
4. Execute `npm run lint`, `npm test` e `npm run build`.
5. Para testes completos de autenticação/RLS e checkout, use exclusivamente um projeto Supabase descartável conforme `.env.test.example`.

Novos usuários recebem role `viewer`. A promoção para administrador deve ser explícita:

```sql
UPDATE public.profiles
SET role = 'admin'::public.user_role, updated_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE email = 'usuario@exemplo.com');
```

Pedidos só comprometem estoque ao entrar em `confirmed`. Cancelar um pedido confirmado devolve o estoque; pedidos concluídos são terminais.

Pedidos sao orcamentos: o estoque e conferido na criacao e baixado somente quando o status passa para confirmed; nao existe reserva temporaria nesta versao. Aplique 20260911_business_integrity_constraints.sql e depois 20260912_validate_business_integrity_constraints.sql apos corrigir as linhas retornadas.
