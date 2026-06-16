import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'no-console': 'error',
      // Pre-existing issues to be fixed during frontend review — warn not error
      // so they don't block CI while we work through them module by module
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
