import globals from 'globals';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';

export default [
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        plugins: {
            prettier,
        },
        rules: {
            ...js.configs.recommended.rules,
            'prettier/prettier': 'error',
        },
    },
];
