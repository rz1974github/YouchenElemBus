export type Direction = 'outbound' | 'inbound'

export interface AppSettings {
  timeThresholdMinutes: number
  pollingIntervalSeconds: number
  busNumbers: string[]
  stationNames: string[]
}

export interface EtaSnapshot {
  busNumber: string
  direction: Direction
  plateNumb: string
  etaByStop: Record<string, number | null>
}

export interface BusLane {
  busNumber: string
  plateNumb: string
  etas: Array<number | null>
  busY: number | null
}
