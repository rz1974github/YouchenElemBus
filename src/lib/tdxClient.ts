import { appSettings } from './appSettings'
import { buildMockRows } from './mockTdx'
import { getRuntimeEnv, isMockEnabled } from './runtimeEnv'

// TDX EstimatedTimeOfArrival 原始資料列。
// Direction 是 TDX 對「該路線」的去返程定義，各路線不同，本 App 只拿來分組。
export interface TdxEtaRow {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  StopName?: { Zh_tw?: string }
  StopSequence?: number
  EstimateTime?: number | null
  PlateNumb?: string
}

const TDX_API_BASE =
  'https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/Taipei'
const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'

function buildApiUrl(busNumbers: string[]): string {
  const filter = busNumbers
    .map((n) => `RouteName/Zh_tw eq '${encodeURIComponent(n)}'`)
    .join(' or ')
  return `${TDX_API_BASE}?$filter=${filter}&$format=JSON`
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

export async function fetchEtaRows(signal?: AbortSignal): Promise<TdxEtaRow[]> {
  if (isMockEnabled()) {
    return buildMockRows()
  }

  const accessToken = await fetchAccessToken()
  const response = await fetch(buildApiUrl(appSettings.busNumbers), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!response.ok) {
    throw new Error(`TDX request failed (${response.status})`)
  }

  return (await response.json()) as TdxEtaRow[]
}
