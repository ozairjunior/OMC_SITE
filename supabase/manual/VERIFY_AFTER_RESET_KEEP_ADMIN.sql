-- Somente leitura: valida o reset do ambiente Oliveira.
SELECT id,email,email_confirmed_at FROM auth.users WHERE lower(email)=lower('jjunior2100@gmail.com');
SELECT p.id,p.full_name,p.role,p.is_active FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)=lower('jjunior2100@gmail.com');
SELECT count(*) AS profile_count FROM public.profiles;
SELECT 'products' AS table_name,count(*) AS row_count FROM public.products UNION ALL SELECT 'orders',count(*) FROM public.orders UNION ALL SELECT 'order_items',count(*) FROM public.order_items UNION ALL SELECT 'stock_movements',count(*) FROM public.stock_movements;
