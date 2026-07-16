import { useMemo, useState } from 'react'
import { RouteDiagram } from './components/RouteDiagram'
import { useRealtimeBuses } from './hooks/useRealtimeBuses'
import { appSettings } from './lib/appSettings'
import type { Direction } from './types'

function App() {
  const [direction, setDirection] = useState<Direction>('outbound')

  const { stationNames, stationY, lanes, loading, error, updatedAt } =
    useRealtimeBuses(direction)

  const title = useMemo(
    () => (direction === 'outbound' ? '去程 松山車站 -> 玉成國小' : '回程 玉成國小 -> 松山車站'),
    [direction],
  )

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>松山車站到玉成國小公車動態</h1>
        <p>10 分鐘內快到玉成里的車，會顯示在右側平行線。</p>
      </header>

      <section className="toolbar" aria-label="方向切換">
        <button
          type="button"
          className={direction === 'outbound' ? 'tab active' : 'tab'}
          onClick={() => setDirection('outbound')}
        >
          去程
        </button>
        <button
          type="button"
          className={direction === 'inbound' ? 'tab active' : 'tab'}
          onClick={() => setDirection('inbound')}
        >
          回程
        </button>
      </section>

      <section className="status-panel" aria-live="polite">
        <span>方向: {title}</span>
        <span>更新頻率: 每 {appSettings.pollingIntervalSeconds} 秒</span>
        <span>
          最後更新: {updatedAt ? updatedAt.toLocaleTimeString('zh-TW', { hour12: false }) : '--'}
        </span>
      </section>

      {error ? <p className="error">資料讀取失敗: {error}</p> : null}
      {loading ? <p className="loading">即時資料載入中...</p> : null}

      <section className="diagram-wrap">
        <RouteDiagram stationNames={stationNames} stationY={stationY} lanes={lanes} />
      </section>
    </main>
  )
}

export default App
