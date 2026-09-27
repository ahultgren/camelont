import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
      env: { VITE_SPOTIFY_CLIENT_ID: 'test-client-id' },
      coverage: {
        provider: 'v8',
        include: ['src/**/domain/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
        thresholds: { lines: 90 },
      },
    },
  }),
)
