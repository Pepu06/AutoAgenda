module.exports = {
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['apps/web/**/*.{js,jsx}'],
      env: {
        browser: true,
      },
    },
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js'],
      env: {
        jest: true,
      },
    },
  ],
};
