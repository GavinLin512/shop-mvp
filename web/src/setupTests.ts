import '@testing-library/jest-dom'

// 此環境的 jsdom 未提供 Web Storage / confirm（Node 22+ 原生 localStorage 受 flag 限制而為 undefined），
// 在測試啟動時補上 in-memory 實作，讓依賴 storage / confirm 的元件可正常運作。
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() { return this.store.size }
  clear() { this.store.clear() }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  setItem(key: string, value: string) { this.store.set(key, String(value)) }
  removeItem(key: string) { this.store.delete(key) }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null }
}

function installStorage(name: 'localStorage' | 'sessionStorage') {
  const instance = new MemoryStorage()
  for (const target of [globalThis, window] as Array<typeof globalThis | Window>) {
    Object.defineProperty(target, name, { value: instance, configurable: true, writable: true })
  }
}

installStorage('localStorage')
installStorage('sessionStorage')

// jsdom 不實作 confirm（會印 "Not implemented" 並回 undefined）；測試預設一律確認
window.confirm = () => true
