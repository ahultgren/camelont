import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import boundaries from 'eslint-plugin-boundaries'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

/**
 * Architecture boundaries (see docs/architecture.md, "Dependency rules").
 *
 *   app → pages → features → shared
 *
 * A feature's internals (domain/api/model/ui) are private; other layers import only
 * its index.ts. Cross-feature edges are listed explicitly in FEATURE_EDGES. Never
 * disable these rules: move the code instead.
 */
const FEATURE_EDGES: Record<string, string[]> = {
  playlists: ['auth'],
  mixing: ['track-features'],
  'mix-view': ['mixing', 'track-features'],
}

const SEGMENTS = ['domain', 'api', 'model', 'ui'] as const
const SAME_FEATURE = { feature: '{{ from.element.captured.feature }}' }

const shared = (...modules: string[]) => ({
  element: { type: 'shared', captured: modules.map((module) => ({ module })) },
})
const own = (...segments: string[]) => ({
  element: { type: segments.map((s) => `feature-${s}`), captured: SAME_FEATURE },
})

const crossFeaturePolicies = Object.entries(FEATURE_EDGES).map(([from, targets]) => ({
  from: {
    element: { type: ['feature-ui', 'feature-model'], captured: { feature: from } },
  },
  allow: {
    to: { element: { type: 'feature', captured: targets.map((feature) => ({ feature })) } },
  },
}))

export default defineConfig(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'docs',
      'public',
      'node_modules',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (default exports only in .vue files and config).',
        },
      ],
    },
  },
  {
    files: ['**/*.vue', '**/*.d.ts', '*.config.ts', 'eslint.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // import.meta.env is read only in src/app/config.ts
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/app/config.ts', 'src/**/*.test.ts', 'src/test/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'import.meta',
          property: 'env',
          message: 'Read configuration through src/app/config.ts.',
        },
      ],
    },
  },
  {
    // Domain code is pure TypeScript: no Vue, no I/O libraries, no packages at all.
    files: ['src/features/*/domain/**/*.ts', 'src/shared/music/**/*.ts', 'src/shared/lib/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.|@/)',
              message:
                'Domain code imports no packages (no Vue, no I/O). Move this to model/ or api/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
      'boundaries/include': ['src/**/*'],
      'boundaries/legacy-templates': false,
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'page', pattern: 'src/pages', partialMatch: false },
        ...SEGMENTS.map((segment) => ({
          type: `feature-${segment}`,
          pattern: `src/features/*/${segment}`,
          capture: ['feature'],
          partialMatch: false,
        })),
        { type: 'feature', pattern: 'src/features/*', capture: ['feature'], partialMatch: false },
        { type: 'shared', pattern: 'src/shared/*', capture: ['module'], partialMatch: false },
        { type: 'test-support', pattern: 'src/test', partialMatch: false },
      ],
      'boundaries/elements-single-match': true,
      'boundaries/files': [{ category: 'test', pattern: '**/*.test.ts' }],
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: { to: { element: { type: ['app', 'page', 'feature', 'shared'] } } },
            },
            {
              from: { element: { type: 'page' } },
              allow: { to: { element: { type: ['page', 'feature', 'shared'] } } },
            },
            // A feature's index.ts re-exports its own internals.
            { from: { element: { type: 'feature' } }, allow: { to: own(...SEGMENTS) } },
            {
              from: { element: { type: 'feature-ui' } },
              allow: { to: [own('ui', 'model', 'domain'), { element: { type: 'shared' } }] },
            },
            {
              from: { element: { type: 'feature-model' } },
              allow: {
                to: [own('model', 'api', 'domain'), shared('music', 'lib', 'api', 'storage')],
              },
            },
            {
              from: { element: { type: 'feature-api' } },
              allow: { to: [own('api', 'domain'), shared('music', 'lib', 'api', 'storage')] },
            },
            {
              from: { element: { type: 'feature-domain' } },
              allow: { to: [own('domain'), shared('music', 'lib')] },
            },
            ...crossFeaturePolicies,
            // shared never imports upward; inside shared: lib ← music ← ui, lib ← api, storage
            { from: shared('lib'), allow: { to: shared('lib') } },
            { from: shared('music'), allow: { to: shared('music', 'lib') } },
            { from: shared('api'), allow: { to: shared('api', 'lib') } },
            { from: shared('storage'), allow: { to: shared('storage', 'lib') } },
            { from: shared('ui'), allow: { to: shared('ui', 'music', 'lib') } },
            // Test helpers (MSW server, fixtures) serve tests only.
            {
              from: { element: { type: 'test-support' } },
              allow: { to: { element: { type: ['test-support', 'shared', 'feature'] } } },
            },
            {
              from: { file: { categories: 'test' } },
              allow: { to: { element: { type: 'test-support' } } },
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
)
