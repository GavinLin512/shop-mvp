import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Vitest 4 慣用做法：loadEnv(mode, ...) 會依 mode='test' 自動載入 .env.test
// 第三個引數 '' 表示不過濾前綴，所有 env var 都注入
export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: loadEnv(mode, process.cwd(), ''),
  },
}))
