-- Somente leitura. Execute depois de RESET_TEST_DATA_ONLY_KEEP_ADMIN.sql.
SELECT
  u.id,
  u.email,
  u.email_confirmed_at,
  p.full_name,
  p.role,
  p.is_active
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE lower(u.email) = lower('jjunior2100@gmail.com');

SELECT 'products' AS table_name, count(*) AS row_count FROM public.products
UNION ALL SELECT 'product_variants', count(*) FROM public.product_variants
UNION ALL SELECT 'product_costs', count(*) FROM public.product_costs
UNION ALL SELECT 'product_images', count(*) FROM public.product_images
UNION ALL SELECT 'categories', count(*) FROM public.categories
UNION ALL SELECT 'brands', count(*) FROM public.brands
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'order_items', count(*) FROM public.order_items
UNION ALL SELECT 'stock_movements', count(*) FROM public.stock_movements
UNION ALL SELECT 'analytics_events', count(*) FROM public.analytics_events
UNION ALL SELECT 'admin_audit_logs', count(*) FROM public.admin_audit_logs
UNION ALL SELECT 'product_search_terms', count(*) FROM public.product_search_terms
UNION ALL SELECT 'product_variant_sku_counters', count(*) FROM public.product_variant_sku_counters
UNION ALL SELECT 'order_rate_limits', count(*) FROM public.order_rate_limits
UNION ALL SELECT 'order_rate_limit_events', count(*) FROM public.order_rate_limit_events
UNION ALL SELECT 'security_monitor_events', count(*) FROM public.security_monitor_events
ORDER BY table_name;

SELECT last_value AS product_sku_sequence_last_value, is_called FROM public.product_sku_seq;
SELECT last_value AS order_code_sequence_last_value, is_called FROM public.order_code_seq;
