# Recuperacao do projeto

Este pacote foi reconstruido a partir da ultima versao completa fornecida no historico do projeto.

Foram preservados:

- codigo-fonte da aplicacao;
- configuracoes Next.js, TypeScript, Tailwind, Vitest e Playwright;
- migrations Supabase;
- autenticacao e autorizacao administrativa refatoradas;
- profiles e roles;
- RLS e funcoes SQL;
- APIs administrativas e publicas;
- checkout e pedidos;
- produtos, variacoes e imagens;
- testes;
- documentacao.

Foram removidos deliberadamente:

- `.env.local`, por conter segredos;
- `node_modules`, porque deve ser reconstruido por `npm ci`;
- `.next`, por ser artefato de build;
- resultados temporarios de testes;
- arquivos `*.tsbuildinfo`.

Antes de usar o projeto novamente, configure um novo `.env.local` a partir do `.env.example`.

Se a antiga `SUPABASE_SERVICE_ROLE_KEY` foi compartilhada fora do seu ambiente, rotacione a chave no Supabase antes de continuar.
