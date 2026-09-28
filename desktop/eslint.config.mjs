/**
 * ESLint 9 flat config
 *
 * 作用范围：desktop/src（主进程 + preload）。
 * renderer/ 沿用原有手写风格，暂不纳入，M6 质量收口时再放开。
 */
import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error'
    }
  }
];
