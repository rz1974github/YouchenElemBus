// 本 App 的方向只有「上班」與「下班」，刻意不叫 direction / 去程 / 回程，
// 以免和 TDX API 的 Direction 欄位（各路線自己定義的去返程）混淆。
// - toWork（上班）：松山車站 → 玉成國小
// - toHome（下班）：玉成國小 → 松山車站
export type Trip = 'toWork' | 'toHome'

export interface TripSettings {
  label: string
  boardingStop: string
}

export interface AppSettings {
  thresholdMinutes: number
  pollingIntervalSeconds: number
  debugMode: boolean
  busNumbers: string[]
  // 依上班方向的行駛順序排列；下班方向反序讀取同一份
  stationNames: string[]
  trips: Record<Trip, TripSettings>
}

// 一台實體公車。etas 依該趟次的行駛順序排列（與 getTripStops(trip) 同序），
// 只含這台車即將經過的站，其餘為 null。
export interface Vehicle {
  id: string
  busNumber: string
  plateNumb: string | null
  trip: Trip
  etas: Array<number | null>
}

export interface BusLane extends Vehicle {
  busY: number
  laneIndex: number
}
