import React, { createContext, useContext, useEffect, useState } from 'react'
import { getConfig } from '../api/client'
import type { Config } from '../types'

const defaultConfig: Config = { demoMode: false, provider: 'mock' }

const ConfigContext = createContext<Config>(defaultConfig)

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(defaultConfig)

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {
        // 無法取得 config 時維持預設值（demoMode=false）
      })
  }, [])

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
}

export function useConfig(): Config {
  return useContext(ConfigContext)
}
