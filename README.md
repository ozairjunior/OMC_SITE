# OMC Catalogo Digital

Catalogo digital da Oliveira Material de Construcao, desenvolvido com Next.js, TypeScript, Tailwind CSS e Supabase.

## Recursos incluidos

- Catalogo publico de produtos com busca, categorias e variacoes
- Carrinho e checkout
- Criacao segura de pedidos via API/RPC
- Integracao com WhatsApp
- Painel administrativo
- Login administrativo com Supabase Auth
- Perfis, roles e controle de acesso por RLS
- Dashboard e metricas
- Gestao de produtos, variacoes e imagens
- Gestao de pedidos e status
- Auditoria administrativa
- Migrations completas do Supabase
- Testes unitarios com Vitest
- Testes E2E com Playwright
- Documentacao de autenticacao e implantacao

## Requisitos

- Node.js 20 ou superior
- npm
- Projeto Supabase

## Instalacao

1. Instale as dependencias:

   npm ci

2. Copie `.env.example` para `.env.local` e preencha as credenciais do seu ambiente.

3. Aplique as migrations da pasta `supabase/migrations` no banco Supabase, respeitando a ordem dos arquivos.

4. Inicie em desenvolvimento:

   npm run dev

## Validacoes

- TypeScript: `npm run lint`
- Testes unitarios: `npm run test:unit`
- Testes E2E: `npm run test:e2e`
- Build: `npm run build`

## Seguranca

Nunca versione ou compartilhe `.env.local`, chaves `service_role`, cookies, tokens ou senhas.

A `SUPABASE_SERVICE_ROLE_KEY` deve existir apenas no ambiente do servidor.

Leia tambem:

- `docs/autenticacao-admin.md`
- `docs/testes-autenticacao.md`
- `docs/DEPLOYMENT.md`
