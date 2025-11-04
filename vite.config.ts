import { defineConfig } from 'vite'

const DEV_CSP = [
  "default-src 'self'",
  "img-src 'self' https: http: asset: blob: data:",
  "style-src 'self' 'unsafe-inline' blob:",
  "font-src 'self' data:",
  "script-src 'self' http: https: 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' ipc: http: https: ws: http://ipc.localhost",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ')

export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: {}, dedupe: ['katex'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  // 生产构建：分包与剥离 console/debugger；开发：预打包重库
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  optimizeDeps: {
    include: ['markdown-it', 'dompurify', 'highlight.js', 'mermaid', 'katex']
  },
  build: {
    // 为了使用动态 import 和顶层 await
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('markdown-it')) return 'markdown-it'
            if (id.includes('dompurify')) return 'dompurify'
            if (id.includes('highlight')) return 'highlightjs'
            if (id.includes('mermaid')) return 'mermaid'
          }
        }
      }
    },
    minify: 'esbuild'
  }
}))

