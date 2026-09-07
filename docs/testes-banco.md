# Testes do banco

Execute `npm run test:db` para testar as regras operacionais em PostgreSQL local
via [PGlite](https://pglite.dev/docs/). `npm test` inclui esses testes e os unitários.
O banco é criado em memória e descartado ao terminar: não usa `.env.local`,
não acessa o Supabase remoto e não precisa de Docker.

A suíte aplica as migrations reais do catálogo, autorização, pedidos e estoque.
Somente a infraestrutura de identidade (`auth.users`, `auth.uid()` e roles do
Supabase) é preparada pelo teste. Não substitui a validação de Auth, Storage,
PostgREST ou concorrência entre conexões em um projeto Supabase de testes.

Os cenários cobrem desativação de variações usadas, exclusão das sem pedidos,
auditoria, preservação dos snapshots e vínculos, reativação, confirmação e
cancelamento com estoque, rejeição de checkout inativo, bloqueio de exclusão
direta/em cascata, autorização e rollback de cadastros com preço inválido.
Também cobrem o contador persistente, idempotência de pedidos e a separação dos
eventos do WhatsApp. Os testes unitários verificam a identidade da Vercel, o
prefiltro de rajadas e a decodificação/regravação segura das imagens.

PGlite é uma dependência exclusiva de desenvolvimento. A aplicação publicada
na Vercel continua acessando o Supabase pelas integrações existentes; nenhum
banco local ou processo persistente é iniciado pela aplicação.
