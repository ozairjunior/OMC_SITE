# Testes da autenticação administrativa

## Testes unitários

Não acessam rede nem banco e podem ser executados diretamente:

```bash
npm run test:unit
```

Eles cobrem usuário autenticado, sessão expirada, profile ausente, profile
inativo, roles `admin`, `manager`, `viewer` e `attendant`, mensagens de erro,
redirecionamentos do middleware e respostas 401/403/500 das APIs.

## Testes E2E e RLS

Estes testes criam e removem usuários, profiles e categorias temporárias. Use
exclusivamente um projeto Supabase descartável, nunca produção.

1. Aplique todas as migrations ao projeto de teste.
2. Copie as variáveis de `.env.test.example` para o ambiente do terminal.
3. Confirme manualmente o project ref em `SUPABASE_TEST_PROJECT_REF`.
4. Instale o navegador do Playwright, se necessário:

```bash
npx playwright install chromium
```

5. Execute somente a suíte administrativa:

```bash
npm run test:auth:e2e
```

A suíte só modifica o banco quando todas estas condições existem:

- `RUN_AUTH_E2E=true`;
- `ALLOW_TEST_DATA_MUTATION=true`;
- todas as variáveis `SUPABASE_TEST_*` estão definidas;
- o project ref informado corresponde ao host da URL de teste.

Sem essas condições, os testes E2E administrativos são ignorados. A limpeza é
executada antes e depois da suíte.

## Cobertura integrada

A suíte E2E valida:

- login válido de `admin` e `manager`;
- senha inválida e usuário inexistente;
- profile ausente, inativo e role `viewer`;
- acesso anônimo ao dashboard e a todas as APIs administrativas protegidas;
- consistência entre middleware e API;
- sessão invalidada após remoção do usuário;
- logout e tentativa de voltar ao painel;
- operações RLS reais: `admin` e `manager` podem inserir categoria, enquanto
  `viewer`, profile inativo, usuário sem profile e usuário anônimo são negados.
