import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // A tipagem gradual existente continua sendo verificada pelo `typecheck`.
      // Mantemos ocorrências legadas visíveis sem bloquear a adoção do lint.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Alguns componentes sincronizam estado local com URL/hidratação de store.
      // Esses casos são revisados como aviso nas regras específicas de cada arquivo.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),
]);
