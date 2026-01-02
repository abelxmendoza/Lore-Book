module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  extends: ['eslint:recommended', 'plugin:import/recommended', 'prettier'],
  plugins: ['import'],
  rules: {
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }
    ],
    'import/no-duplicates': 'error',
    'no-duplicate-imports': 'error'
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true
      }
    }
  }
};
