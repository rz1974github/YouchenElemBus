import { appSettings } from './appSettings'
import { buildMockEtaRows, buildMockStopOfRoute } from './mockTdx'
import { getRuntimeEnv, isMockEnabled } from './runtimeEnv'

// TDX 的 Direction 是「每條路線自己」的去返程定義，各路線不同（例如 205 的 0 往松山車站、
// 306 的 0 往玉成國小），本 App 只拿它當分組鍵，上班/下班由 StopOfRoute 的站序判斷。

// EstimatedTimeOfArrival 原始資料列（沒有站序、沒有車牌）
export interface TdxEtaRow {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  StopName?: { Zh_tw?: string }
  EstimateTime?: number | null
}

// StopOfRoute 原始資料：每條（子）路線每個方向的站序
export interface TdxStopOfRoute {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  Stops?: Array<{ StopName?: { Zh_tw?: string }; StopSequence?: number }>
}

const TDX_API_BASE = 'https://tdx.transportdata.tw/api/basic/v2/Bus'
const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'

function buildApiUrl(resource: string, busNumbers: string[]): string {
  const filter = busNumbers
    .map((n) => `RouteName/Zh_tw eq '${encodeURIComponent(n)}'`)
    .join(' or ')
  return `${TDX_API_BASE}/${resource}/City/Taipei?$filter=${filter}&$format=JSON`
}

// 快取 token，避免每次 poll 都重新換
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function fetchAccessToken(): Promise<string> {
  const clientId = getRuntimeEnv('VITE_TDX_CLIENT_ID')
  const clientSecret = getRuntimeEnv('VITE_TDX_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('VITE_TDX_CLIENT_ID / VITE_TDX_CLIENT_SECRET 未設定，請先點擊「環境設定」')
  }

  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(`TDX token request failed (${res.status})`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  // 提前 30 秒過期，避免邊界問題
  tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000
  return cachedToken
}

async function fetchTdx<T>(resource: string): Promise<T> {
  const accessToken = await fetchAccessToken()
  const response = await fetch(buildApiUrl(resource, appSettings.busNumbers), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`TDX ${resource} request failed (${response.status})`)
  }

  return (await response.json()) as T
}

export async function fetchEtaRows(): Promise<TdxEtaRow[]> {
  if (isMockEnabled()) {
    return buildMockEtaRows()
  }
  return fetchTdx<TdxEtaRow[]>('EstimatedTimeOfArrival')
}

// 站序是靜態資料，整個 session 只抓一次
let stopOfRoutePromise: Promise<TdxStopOfRoute[]> | null = null

export function fetchStopOfRoute(): Promise<TdxStopOfRoute[]> {
  if (isMockEnabled()) {
    return Promise.resolve(buildMockStopOfRoute())
  }
  if (!stopOfRoutePromise) {
    stopOfRoutePromise = fetchTdx<TdxStopOfRoute[]>('StopOfRoute').catch((err: unknown) => {
      stopOfRoutePromise = null
      throw err
    })
  }
  return stopOfRoutePromise
}
