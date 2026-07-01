import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getConfig } from '../api/client'
import type { Config } from '../types'

const defaultConfig: Config = { demoMode: false, provider: 'mock', stripeConfigured: false }

type ConfigContextValue = Config & {
  refetchConfig: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue>({
  ...defaultConfig,
  refetchConfig: async () => {},
})

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(defaultConfig)

  const refetchConfig = useCallback(async () => {
    try {
      const next = await getConfig()
      setConfig(next)
    } catch {
      // 無法取得 config 時維持現狀
    }
  }, [])

  useEffect(() => {
    refetchConfig()
  }, [refetchConfig])

  return (
    <ConfigContext.Provider value={{ ...config, refetchConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig(): ConfigContextValue {
  return useContext(ConfigContext)
}
