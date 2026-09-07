# Auditoria para baseline V1 do banco

Data da análise: 2026-09-05. Esta auditoria foi feita por inspeção estática do código e das migrations; nenhuma conexão ou alteração foi executada no Supabase.

## Objetos usados pela aplicação

Tabelas principais: `categories`, `brands`, `products`, `product_variants`, `product_images`, `product_search_terms`, `product_costs`, `orders`, `order_items`, `profiles`, `analytics_events`, `order_rate_limits`, `stock_movements`, `admin_audit_logs`.

Tabela auxiliar estrutural: `product_variant_sku_counters`, usada para geração transacional e não reutilizável de SKUs de variantes.

Objetos Auth/Storage: `auth.users`, trigger de criação de profile, bucket `product-images` e policies de `storage.objects`.

Tipos: `public.order_status` e `public.user_role`.

Sequences: `public.order_code_seq`, `public.product_sku_seq`.

RPCs chamadas pelo código: `create_catalog_order`, `consume_order_rate_limit`, `check_login_failure_limit`, `mark_order_whatsapp_link_shown`, `mark_order_whatsapp_clicked`, `admin_save_product`, `admin_archive_product`, `admin_set_primary_product_image`, `admin_transition_order_status`, `admin_update_user`, `admin_create_category`, `admin_update_category`, `admin_create_brand`, `admin_update_brand`, `admin_update_product_cost`, `admin_remove_product_cost`, `adjust_stock`, `get_my_profile_access`.

Views usadas: `view_sales_funnel_summary` e `view_top_requested_products`.

## Legado que deve ser removido no baseline

- `products.promotional_price` e toda lógica de preço promocional.
- `product_variants.price_adjustment`; o preço final deve ser `sale_price`.
- `products.brand` textual; a relação final é `products.brand_id -> brands.id`.
- As implementações encadeadas de `admin_save_product`; deve existir uma única função final.
- `create_catalog_order` possui duas overloads instaladas e deverá ficar com uma única assinatura V1. `adjust_stock` e `handle_order_confirmation` possuem uma assinatura instalada cada; versões múltiplas nas migrations são histórico de `CREATE OR REPLACE`.
- Policies de mutação direta (`FOR ALL`) em tabelas críticas; mutações devem passar por RPC/API.

## Decisões resolvidas do baseline V1

- GTIN/barcode: somente `product_variants.barcode`, opcional, dígitos e comprimentos 8/12/13/14, unicidade parcial; GS1 fora do V1.
- Roles: `admin`, `manager`, `attendant`, `viewer` conforme matriz aprovada.
- Storage: bucket privado de 5 MB, JPEG/PNG/WebP, signed URLs server-side.
- Administrador preservado: `jjunior2100@gmail.com`, profile recriado com o mesmo UUID.
- Idempotência: `text` em `orders.idempotency_key`, RPC, TypeScript e testes.
- Overload instalada: somente `create_catalog_order` possui duas versões; `adjust_stock` e `handle_order_confirmation` possuem uma assinatura cada.

## Pendências antes do reset

Ainda falta concluir o schema estrutural V1, RPCs e triggers finais, RLS/grants, views analíticas, refatoração TypeScript variant-first, testes em banco vazio e validação completa. Somente depois disso será gerado o reset derivado do baseline aprovado.

## Resultado da introspecção de funções

O banco atual confirmou uma sobrecarga duplicada de `create_catalog_order`: uma versão sem idempotency key e outra com `p_idempotency_key uuid`. A aplicação V1 deverá manter uma única assinatura estável com `p_idempotency_key text` e `p_request_fingerprint text`.

`admin_save_product` ainda possui a assinatura legada `(p_product_id uuid, p_payload jsonb, p_user_id uuid)`. No baseline V1 ela deverá ser substituída por `(p_product_id uuid, p_payload jsonb)` e obter o ator com `auth.uid()`.

Também permanecem assinaturas legadas com `p_user_id` em `admin_archive_product`, RPCs de categoria/marca/custo e transição de pedido. Elas serão reescritas no baseline, sem overloads.

## Auxiliares e triggers legados confirmados

O banco atual possui as funções auxiliares `admin_save_product_core`, `admin_save_product_brand_price_core` e `admin_save_product_inventory_core`. Elas não farão parte do baseline V1; serão substituídas por uma única `admin_save_product(uuid,jsonb)`.

Os triggers confirmados incluem `trg_sync_variant_sale_price`, `trg_variants_global_barcode`, `trg_products_global_barcode`, `trg_assign_product_sku`, `trg_assign_variant_sku`, auditoria automática de products/variants/images/profiles, atualização de timestamps e registro inicial/de alterações de estoque. No modelo V1, sincronização por `price_adjustment` e barcode em `products` serão removidas; barcode e preço existirão somente na variante.

## Policies e Auth confirmados

O trigger `auth.users -> handle_new_auth_user()` está instalado como `on_auth_user_created`.

As policies atuais ainda permitem `ALL` direto em `categories`, `products`, `product_variants`, `product_images`, `product_search_terms` e `profiles`. No baseline V1 essas mutações deverão ser revogadas para `anon`/`authenticated`, mantendo somente SELECT controlado e RPCs administrativas.

Há policies públicas de leitura para imagens, produtos, variantes, categorias e marcas. O baseline V1 deverá remover a leitura pública direta de `storage.objects`; o catálogo receberá signed URLs por servidor.

O acesso a `supabase_migrations.schema_migrations` retornou `42P01`; esse schema não existe neste projeto e não será referenciado pelo reset.

## Escopo de código de barras V1

A validação GS1/dígito verificador foi deliberadamente retirada do V1. `product_variants.barcode` será opcional, aceitará somente dígitos com 8, 12, 13 ou 14 caracteres e terá unicidade parcial quando preenchido. A validação matemática poderá ser adicionada em migration futura.

## Divergência confirmada entre código e banco

`src/app/api/auth/login-attempt/route.ts` chama `check_login_failure_limit`, porém essa função não apareceu na introspecção do banco. O baseline deverá incluir uma implementação final dessa RPC, ou a rota deverá ser alterada para usar uma função efetivamente instalada antes de qualquer reset.

Os testes de banco ainda chamam `admin_save_product` com o terceiro argumento `p_user_id`; eles precisarão ser atualizados junto com a assinatura V1.

## Preservação do administrador principal

O reset futuro deverá preservar a linha de `auth.users` cujo e-mail normalizado seja `jjunior2100@gmail.com`, com o UUID confirmado `7c589d00-68b7-4cd4-b73e-03ef6dd5b4a9`. Antes de remover `public.profiles`, deverá capturar `id`, `email` e `full_name` em estrutura temporária. O nome confirmado é `Junior Administrator`; não existe esse valor em `raw_user_meta_data`.

Após recriar as tabelas, somente este profile deverá ser recriado com `role = 'admin'` e `is_active = true`. O profile órfão `aaf6864b-3c54-4412-85f9-cad6e5663f15` não deverá ser recriado. O reset não poderá excluir nem alterar `auth.users`, `auth.identities` ou fatores MFA.

As verificações pós-reset deverão usar `COUNT(*)` real nas tabelas da aplicação. `pg_stat_user_tables.n_live_tup` é apenas estatística e não será usado para comprovar banco vazio.
