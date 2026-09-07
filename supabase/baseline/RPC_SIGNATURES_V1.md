# Assinaturas de RPC do baseline V1

Estas são as assinaturas alvo. O baseline terá uma única definição de cada função; as sobrecargas legadas serão removidas apenas no reset revisado.

```text
admin_save_product(uuid, jsonb) returns uuid
create_catalog_order(text,text,text,text,text,text,text,text,text,text,jsonb,text,text) returns jsonb
adjust_stock(uuid,numeric,text,text) returns stock_movements
admin_transition_order_status(uuid,order_status) returns jsonb
admin_update_user(uuid,user_role,boolean) returns profiles
admin_create_category(text,integer) returns jsonb
admin_update_category(uuid,jsonb) returns jsonb
admin_create_brand(text) returns jsonb
admin_update_brand(uuid,jsonb) returns jsonb
admin_update_product_cost(uuid,numeric) returns jsonb
admin_remove_product_cost(uuid) returns void
admin_archive_product(uuid) returns boolean
```

Todas as RPCs administrativas obterão o ator com `auth.uid()`. Nenhuma receberá `p_user_id` do navegador. `create_catalog_order` continuará pública somente para criação controlada de pedido e buscará preços exclusivamente em `product_variants.sale_price`.
