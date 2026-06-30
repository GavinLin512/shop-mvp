// Cloudflare Pages Function — 把 /api/* 反向代理到 Render 後端。
// 取代 dev 時 vite.config.ts 的 proxy（同樣去掉 /api 前綴），
// 讓瀏覽器視為「同源」呼叫，免 CORS。
//
// 需在 Pages 專案設定環境變數 BACKEND_URL = Render 服務網址
//   例：https://shop-mvp-api.onrender.com
interface Env {
  BACKEND_URL: string
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const incoming = new URL(request.url)
  const backend = new URL(env.BACKEND_URL)

  // 去掉 /api 前綴後轉發（對齊 dev 的 rewrite: /^\/api/ → ''）
  backend.pathname = incoming.pathname.replace(/^\/api/, '') || '/'
  backend.search = incoming.search

  // 以原 request 複製 method / headers / body；Workers runtime 自動處理串流 body
  return fetch(new Request(backend, request))
}
