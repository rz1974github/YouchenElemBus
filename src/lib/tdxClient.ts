import { appSettings } from './appSettings'
import type { Direction, EtaSnapshot } from '../types'

interface TdxEtaRow {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  StopName?: { Zh_tw?: string }
  EstimateTime?: number | null
  StopSequence?: number
  PlateNumb?: string
}

const TDX_API_BASE =
  'https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/Taipei'

function buildApiUrl(busNumbers: string[]): string {
  const filter = busNumbers
    .map((n) => `RouteName/Zh_tw eq '${encodeURIComponent(n)}'`)
    .join(' or ')
  return `${TDX_API_BASE}?$filter=${filter}&$format=JSON`
}
const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'

// 快取 token，避免每次 poll 都重新換
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function fetchAccessToken(): Promise<string> {
  const clientId = import.meta.env.VITE_TDX_CLIENT_ID as string | undefined
  const clientSecret = import.meta.env.VITE_TDX_CLIENT_SECRET as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('VITE_TDX_CLIENT_ID / VITE_TDX_CLIENT_SECRET 未設定')
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

function normalizeStopName(stopName: string | undefined): string | null {
  if (!stopName) return null

  // 處理松山車站的多種後綴（如：松山車站(八德)、松山車站(松山)、松山車站(終點)）
  if (stopName.includes('松山車站')) {
    return '松山車站'
  }

  // 模糊比對其餘設定檔中的站點名稱
  for (const name of appSettings.stationNames) {
    if (stopName === name || stopName.startsWith(name) || stopName.includes(name)) {
      return name
    }
  }

  return null
}

function toMinute(value: number | null | undefined): number | null {
  if (value == null || value < 0) {
    return null
  }

  return Math.ceil(value / 60)
}

function buildMockSnapshots(): EtaSnapshot[] {
  const stops = appSettings.stationNames

  // 每輛 mock 車用「距監測站的分鐘數」定義位置，再往前/後推算各站 ETA
  const mockBuses: Array<{ busNumber: string; direction: Direction; etaToMonitor: number; plateNumb: string }> = [
    { busNumber: '28',   direction: 'outbound', etaToMonitor: 0, plateNumb: 'EAL-0028' },
    { busNumber: '205',  direction: 'outbound', etaToMonitor: 5, plateNumb: 'EAL-0205' },
    { busNumber: '306',  direction: 'inbound',  etaToMonitor: 8, plateNumb: '306-FL' },
    { busNumber: '306',  direction: 'inbound',  etaToMonitor: 2, plateNumb: 'EAL-3066' }, // 另一台 306！
    { busNumber: '306副', direction: 'outbound', etaToMonitor: 2, plateNumb: '306-FZ' },
    { busNumber: '605',  direction: 'outbound', etaToMonitor: 3, plateNumb: '605-FM' },
    { busNumber: '711',  direction: 'inbound',  etaToMonitor: 4, plateNumb: '711-FL' },
    { busNumber: '203',  direction: 'inbound',  etaToMonitor: 4, plateNumb: '203-U7' },
    { busNumber: '658',  direction: 'inbound',  etaToMonitor: 9, plateNumb: '658-FL' },
  ]

  const monitorStops: Record<Direction, string> = {
    outbound: '玉成里',
    inbound: '西新里',
  }

  return mockBuses.map(({ busNumber, direction, etaToMonitor, plateNumb }) => {
    const etaByStop: Record<string, number | null> = {}
    const minutesPerStop = 3
    const monitorStop = monitorStops[direction]
    
    // 回程時，站點順序在物理上是相反的
    const orderedStops = direction === 'outbound' ? stops : [...stops].reverse()
    const monitorIdx = orderedStops.indexOf(monitorStop)

    orderedStops.forEach((stop, idx) => {
      const delta = (idx - monitorIdx) * minutesPerStop
      const eta = etaToMonitor + delta
      etaByStop[stop] = eta >= 0 ? eta : null  // 已過站回傳 null
    })

    // 特例：205 去程在西新里和玉成國小中間的虛線上
    if (busNumber === '205' && direction === 'outbound') {
      etaByStop['松山車站'] = null
      etaByStop['玉成里'] = null
      etaByStop['松山磚廠'] = null
      etaByStop['南港路三段'] = null
      etaByStop['西新里'] = -1.0  // 已過站 1.0 分鐘
      etaByStop['玉成國小'] = 1.0  // 還剩 1.0 分鐘到站，此時公車正好處於兩站正中間
    }

    // 特例：28 去程剛好在南港路三段上
    if (busNumber === '28' && direction === 'outbound') {
      etaByStop['松山車站'] = null
      etaByStop['玉成里'] = null
      etaByStop['松山磚廠'] = null
      etaByStop['南港路三段'] = 0  // 剛好在站上，所以顯示在圓圈上
      etaByStop['西新里'] = 2
      etaByStop['玉成國小'] = 5  // 最後一站未過，因此不消失
    }

    // 特例：306副 去程在玉成里跟松山磚廠中間的虛線上
    if (busNumber === '306副' && direction === 'outbound') {
      etaByStop['松山車站'] = null
      etaByStop['玉成里'] = -1.5   // 已過站 1.5 分鐘
      etaByStop['松山磚廠'] = 1.5  // 還剩 1.5 分鐘到站，此時公車正好處於兩站正中間
      etaByStop['南港路三段'] = 4.5
      etaByStop['西新里'] = 7.5
      etaByStop['玉成國小'] = 10.5 // 保留到最後一站
    }

    // 特例：711 回程剛好在玉成國小上
    if (busNumber === '711' && direction === 'inbound') {
      etaByStop['玉成國小'] = 0  // 剛好到站，顯示在玉成國小圓圈上
      etaByStop['西新里'] = 3
      etaByStop['南港路三段'] = 6
      etaByStop['松山磚廠'] = 9
      etaByStop['玉成里'] = 12
      etaByStop['松山車站'] = 15 // 後續站點正常保留虛線
    }

    // 特例：203 回程已過玉成國小和西新里，在西新里與南港路三段中間的虛線上
    if (busNumber === '203' && direction === 'inbound') {
      etaByStop['玉成國小'] = null
      etaByStop['西新里'] = -1.0  // 已過 1 分鐘，不顯示圓圈，用來跟下一站拉虛線
      etaByStop['南港路三段'] = 1.0  // 剩餘 1 分鐘，顯示圓圈
      etaByStop['松山磚廠'] = 4.0
      etaByStop['玉成里'] = 7.0
      etaByStop['松山車站'] = 10.0 // 最後一站未過，確保不消失
    }

    // 特例：658 回程已過前面大部分站點，剛好在玉成里上
    if (busNumber === '658' && direction === 'inbound') {
      etaByStop['玉成國小'] = null
      etaByStop['西新里'] = null
      etaByStop['南港路三段'] = null
      etaByStop['松山磚廠'] = null
      etaByStop['玉成里'] = 0     // 剛好在站上，顯示在玉成里圓圈上
      etaByStop['松山車站'] = null // 終點站設為 null
    }

    // 特例：306 回程還有 5 分到玉成國小 (車牌 306-FL)
    if (busNumber === '306' && plateNumb === '306-FL' && direction === 'inbound') {
      etaByStop['玉成國小'] = 5
      etaByStop['西新里'] = 8
      etaByStop['南港路三段'] = 11
      etaByStop['松山磚廠'] = 14
      etaByStop['玉成里'] = 17
      etaByStop['松山車站'] = 20
    }

    // 特例：第二台 306 (車牌 EAL-3066)，已過西新里
    if (busNumber === '306' && plateNumb === 'EAL-3066' && direction === 'inbound') {
      etaByStop['玉成國小'] = null
      etaByStop['西新里'] = -1.0  // 已過，不顯示圓圈，用來與下一站拉虛線
      etaByStop['南港路三段'] = 2.0  // 即將抵達
      etaByStop['松山磚廠'] = 5.0
      etaByStop['玉成里'] = 8.0
      etaByStop['松山車站'] = 11.0
    }

    return { busNumber, direction, plateNumb, etaByStop }
  })
}

export async function fetchEtaSnapshots(signal?: AbortSignal): Promise<EtaSnapshot[]> {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true'
  const clientId = import.meta.env.VITE_TDX_CLIENT_ID as string | undefined

  if (useMock || !clientId) {
    return buildMockSnapshots()
  }

  const accessToken = await fetchAccessToken()

  const response = await fetch(buildApiUrl(appSettings.busNumbers), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`TDX request failed (${response.status})`)
  }

  const rows = (await response.json()) as TdxEtaRow[]

  const snapshots: EtaSnapshot[] = []
  let virtualPlateCounter = 1

  // 1. 分類與整理各公車、各車牌之觀測值
  // 結構：busNumber -> plateKey -> 觀測值列表
  const busGroupMap = new Map<string, Map<string, Array<{ index: number; eta: number; rawDir: Direction }>>>()

  for (const row of rows) {
    const busNumber = row.RouteName?.Zh_tw
    const stopName = row.StopName?.Zh_tw
    if (!busNumber || !stopName || !appSettings.busNumbers.includes(busNumber)) {
      continue
    }

    const normStopName = normalizeStopName(stopName)
    if (!normStopName) {
      continue
    }

    const etaMinute = toMinute(row.EstimateTime)
    if (etaMinute === null || etaMinute < 0) {
      continue
    }

    const rawDir: Direction = row.Direction === 1 ? 'inbound' : 'outbound'
    const plate = row.PlateNumb?.trim()
    const isRealPlate = plate && plate !== '' && plate !== 'no-plate'
    const plateKey = isRealPlate ? plate : 'no-plate'

    const stationIdx = appSettings.stationNames.indexOf(normStopName)
    if (stationIdx === -1) {
      continue
    }

    if (!busGroupMap.has(busNumber)) {
      busGroupMap.set(busNumber, new Map())
    }
    const plateMap = busGroupMap.get(busNumber)!
    if (!plateMap.has(plateKey)) {
      plateMap.set(plateKey, [])
    }
    plateMap.get(plateKey)!.push({ index: stationIdx, eta: etaMinute, rawDir })
  }

  // 2. 定義候選車輛介面與物理規律驗證演算法
  interface Candidate {
    etas: Record<number, number> // index -> eta
    rawDirectionFallback: Direction
  }

  // 根據候選車輛包含的站點 ETA 物理遞增規律進行客觀方向投票，不信任或依賴 TDX 的 Direction
  function getCandidateDirection(c: Candidate): Direction {
    const indices = Object.keys(c.etas).map(Number).sort((a, b) => a - b)
    if (indices.length < 2) {
      return c.rawDirectionFallback
    }

    let outboundVotes = 0
    let inboundVotes = 0
    for (let i = 0; i < indices.length; i++) {
      const idxA = indices[i]
      const etaA = c.etas[idxA]
      for (let j = i + 1; j < indices.length; j++) {
        const idxB = indices[j]
        const etaB = c.etas[idxB]
        if (etaA < etaB) {
          outboundVotes++
        } else if (etaA > etaB) {
          inboundVotes++
        }
      }
    }

    if (outboundVotes > inboundVotes) {
      return 'outbound'
    } else if (inboundVotes > outboundVotes) {
      return 'inbound'
    }

    return c.rawDirectionFallback
  }

  // 驗證是否能將某個站點 ETA 歸類到既有的候選車輛中
  function canAddToCandidate(c: Candidate, newIdx: number, newEta: number): boolean {
    if (c.etas[newIdx] !== undefined) {
      return false
    }

    const existingIndices = Object.keys(c.etas).map(Number)
    if (existingIndices.length === 0) {
      return true
    }

    const tempEtas = { ...c.etas, [newIdx]: newEta }

    // 如果該候選車輛已有 2 個或以上的觀測值，則其行駛方向已固定
    // 否則，只要其在去程或回程的任何一種物理規律下成立即可
    const directionsToTest: Direction[] = existingIndices.length >= 2
      ? [getCandidateDirection(c)]
      : ['outbound', 'inbound']

    for (const dir of directionsToTest) {
      const travelIndices = Object.keys(tempEtas).map(Number)
      if (dir === 'outbound') {
        travelIndices.sort((a, b) => a - b)
      } else {
        travelIndices.sort((a, b) => b - a)
      }

      let dirValid = true
      for (let i = 0; i < travelIndices.length - 1; i++) {
        const idxA = travelIndices[i]
        const idxB = travelIndices[i + 1]
        const etaA = tempEtas[idxA]
        const etaB = tempEtas[idxB]

        const distance = Math.abs(idxB - idxA)
        const gap = etaB - etaA

        // 物理規律限制：平均每站行車時間在 -2 分鐘（Traffic Update / 誤差）到 6 分鐘之間
        if (gap < -2 * distance || gap > 6 * distance) {
          dirValid = false
          break
        }
      }

      if (dirValid) {
        return true
      }
    }

    return false
  }

  // 3. 循著物理連續性進行公車分拆
  for (const [busNumber, plateMap] of busGroupMap.entries()) {
    for (const [plateKey, obsList] of plateMap.entries()) {
      // 依 ETA 從小到大排序，由最靠近當前物理位置的觀測值開始處理
      obsList.sort((a, b) => a.eta - b.eta)

      const candidates: Candidate[] = []

      for (const obs of obsList) {
        let added = false
        for (const c of candidates) {
          if (canAddToCandidate(c, obs.index, obs.eta)) {
            c.etas[obs.index] = obs.eta
            added = true
            break
          }
        }

        if (!added) {
          candidates.push({
            etas: { [obs.index]: obs.eta },
            rawDirectionFallback: obs.rawDir,
          })
        }
      }

      // 將分割、驗證後的物理車輛加入 Snapshot 列表中
      for (const c of candidates) {
        const dir = getCandidateDirection(c)
        const plateNumb = plateKey === 'no-plate'
          ? `no-plate-${dir}-${virtualPlateCounter++}`
          : plateKey

        const etaByStop: Record<string, number | null> = {}
        for (const stopName of appSettings.stationNames) {
          etaByStop[stopName] = null
        }

        for (const [idxStr, eta] of Object.entries(c.etas)) {
          const idx = parseInt(idxStr, 10)
          const stopName = appSettings.stationNames[idx]
          if (stopName) {
            etaByStop[stopName] = eta
          }
        }

        snapshots.push({
          busNumber,
          direction: dir,
          plateNumb,
          etaByStop,
        })
      }
    }
  }

  return snapshots
}
