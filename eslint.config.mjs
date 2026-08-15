import eslint from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'out/**',
      'release/**',
      'node_modules/**',
      '**/*.ts',
      '**/*.tsx',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
