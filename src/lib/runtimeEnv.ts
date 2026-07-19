type RuntimeEnvKey = 'VITE_TDX_CLIENT_ID' | 'VITE_TDX_CLIENT_SECRET' | 'VITE_USE_MOCK'

interface RuntimeEnvStorage {
  VITE_TDX_CLIENT_ID?: string
  VITE_TDX_CLIENT_SECRET?: string
  VITE_USE_MOCK?: 'true' | 'false'
}

const STORAGE_KEY = 'yuchen-runtime-env'

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function readStoredEnv(): RuntimeEnvStorage {
  if (!isBrowser()) {
    return {}
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as RuntimeEnvStorage
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredEnv(payload: RuntimeEnvStorage): void {
  if (!isBrowser()) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

function getBuildEnv(key: RuntimeEnvKey): string | undefined {
  const envMap = import.meta.env as Record<string, unknown>
  const value = envMap[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

export function hasSavedRuntimeCredentials(): boolean {
  const stored = readStoredEnv()
  return Boolean(stored.VITE_TDX_CLIENT_ID?.trim()) && Boolean(stored.VITE_TDX_CLIENT_SECRET?.trim())
}

export function getRuntimeEnv(key: RuntimeEnvKey): string | undefined {
  const stored = readStoredEnv()
  const storedValue = stored[key]
  if (typeof storedValue === 'string' && storedValue.trim() !== '') {
    return storedValue
  }
  return getBuildEnv(key)
}

export function useMockFromRuntimeEnv(): boolean {
  return getRuntimeEnv('VITE_USE_MOCK') === 'true'
}

export function getRuntimeCredentialDefaults(): { clientId: string; clientSecret: string } {
  const existing = readStoredEnv()
  return {
    clientId: existing.VITE_TDX_CLIENT_ID ?? getBuildEnv('VITE_TDX_CLIENT_ID') ?? '',
    clientSecret: existing.VITE_TDX_CLIENT_SECRET ?? getBuildEnv('VITE_TDX_CLIENT_SECRET') ?? '',
  }
}

export function saveRuntimeCredentials(clientId: string, clientSecret: string): void {
  const existing = readStoredEnv()
  const mockFlag = existing.VITE_USE_MOCK ?? (getBuildEnv('VITE_USE_MOCK') === 'true' ? 'true' : 'false')

  writeStoredEnv({
    VITE_USE_MOCK: mockFlag,
    VITE_TDX_CLIENT_ID: clientId.trim(),
    VITE_TDX_CLIENT_SECRET: clientSecret.trim(),
  })
}
