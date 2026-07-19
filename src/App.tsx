import { useEffect, useMemo, useState } from 'react'
import { RouteDiagram } from './components/RouteDiagram'
import { useRealtimeBuses } from './hooks/useRealtimeBuses'
import { appSettings } from './lib/appSettings'
import { getRuntimeCredentialDefaults, hasSavedRuntimeCredentials, saveRuntimeCredentials } from './lib/runtimeEnv'
import type { Direction } from './types'

function App() {
  const [envReady, setEnvReady] = useState(false)
  const [isEnvDialogOpen, setIsEnvDialogOpen] = useState(false)
  const [clientIdInput, setClientIdInput] = useState('')
  const [clientSecretInput, setClientSecretInput] = useState('')
  const [envError, setEnvError] = useState<string | null>(null)
  const [direction, setDirection] = useState<Direction>('outbound')
  const [debugMode, setDebugMode] = useState(appSettings.debugMode)
  const [copied, setCopied] = useState(false)
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null)

  useEffect(() => {
    const defaults = getRuntimeCredentialDefaults()
    setClientIdInput(defaults.clientId)
    setClientSecretInput(defaults.clientSecret)

    if (hasSavedRuntimeCredentials()) {
      setEnvReady(true)
      setIsEnvDialogOpen(false)
    } else {
      setEnvReady(false)
      setIsEnvDialogOpen(true)
    }
  }, [])

  const { stationNames, stationY, lanes, snapshots, loading, refreshing, error, updatedAt, paused, togglePause, refetch } =
    useRealtimeBuses(direction, envReady)

  // 1. 工程模式「不限 1 台車」顯示！直接渲染所有的車道平行線
  const displayedLanes = lanes

  // 2. 如果沒有手動選定車牌，預設選取當前車道中的第一台車（使下方 debug line 始終有初始資料顯示）
  const activeSelectedPlate = useMemo(() => {
    if (selectedPlate && lanes.some((l) => l.plateNumb === selectedPlate)) {
      return selectedPlate
    }
    return lanes[0]?.plateNumb ?? null
  }, [lanes, selectedPlate])

  // 3. 取得選定車牌對應的 JSON Snapshot 資料
  const debugSnapshotArray = useMemo(() => {
    if (!debugMode || !activeSelectedPlate) {
      return []
    }
    const matched = snapshots.find(
      (s) => s.plateNumb === activeSelectedPlate && s.direction === direction
    )
    return matched ? [matched] : []
  }, [debugMode, direction, activeSelectedPlate, snapshots])

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugSnapshotArray, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const title = useMemo(
    () => (direction === 'outbound' ? '去程 松山車站 -> 玉成國小' : '回程 玉成國小 -> 松山車站'),
    [direction],
  )

  const openEnvSettingsDialog = () => {
    const defaults = getRuntimeCredentialDefaults()
    setClientIdInput(defaults.clientId)
    setClientSecretInput(defaults.clientSecret)
    setEnvError(null)
    setIsEnvDialogOpen(true)
  }

  const saveEnvSettings = () => {
    const nextClientId = clientIdInput.trim()
    const nextClientSecret = clientSecretInput.trim()

    if (!nextClientId || !nextClientSecret) {
      setEnvError('請完整填寫 TDX key 與 secret。')
      return
    }

    saveRuntimeCredentials(nextClientId, nextClientSecret)
    setEnvError(null)
    setEnvReady(true)
    setIsEnvDialogOpen(false)
    window.location.reload()
  }

  const cancelEnvSettings = () => {
    if (!envReady) {
      setEnvError('首次使用請先完成環境設定。')
      return
    }
    setIsEnvDialogOpen(false)
    setEnvError(null)
  }

  if (!envReady && !isEnvDialogOpen) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <h1>松山車站到玉成國小公車動態</h1>
          <p>正在初始化環境設定...</p>
        </header>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>松山車站到玉成國小公車動態</h1>
        <p>10 分鐘內快到玉成里的車，會顯示在右側平行線。</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
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

        <div className="flex flex-wrap items-center gap-3 mt-[14px]">
          <button
            type="button"
            onClick={openEnvSettingsDialog}
            className="px-4 py-2 bg-[#130d2f] hover:bg-[#20184a] text-[#d4c8ff] border border-[#a48dff]/50 rounded-xl font-bold text-sm tracking-wider cursor-pointer transition-all duration-300"
          >
            環境設定
          </button>

          {/* 立即更新按鈕 */}
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => void refetch()}
            className="px-4 py-2 bg-[#051329] hover:bg-[#092244] disabled:opacity-50 text-neon-cyan border border-neon-cyan/50 rounded-xl font-bold text-sm tracking-wider cursor-pointer transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,245,255,0.4)] hover:border-neon-cyan flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 text-neon-cyan ${loading || refreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              {/* 順時針循環箭頭圖示 */}
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {loading || refreshing ? '更新中...' : '立即更新'}
          </button>

          {/* 暫停鍵（僅工程模式顯示） */}
          {debugMode && (
            <button
              type="button"
              onClick={togglePause}
              className={`px-4 py-2 rounded-xl font-bold text-sm tracking-wider cursor-pointer transition-all duration-300 border flex items-center gap-2 ${
                paused
                  ? 'bg-[#1a1105] text-[#ffaa00] border-[#ffaa00]/70 shadow-[0_0_12px_rgba(255,170,0,0.35)]'
                  : 'bg-[#051329] hover:bg-[#092244] text-neon-cyan border-neon-cyan/50 hover:shadow-[0_0_15px_rgba(0,245,255,0.35)]'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${paused ? 'bg-[#ffaa00]' : 'bg-neon-cyan animate-pulse'}`} />
              {paused ? '已暫停' : '暫停'}
            </button>
          )}
        </div>
      </div>

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
        <RouteDiagram
          stationNames={stationNames}
          stationY={stationY}
          lanes={displayedLanes}
          direction={direction}
          selectedPlate={activeSelectedPlate}
          onSelectBus={(plate) => {
            setSelectedPlate(plate)
            setDebugMode(true)
          }}
        />
      </section>

      {/* 工程模式的 debug line 區塊 (去程與回程皆全面支援點選顯示) */}
      {debugMode && (
        <section className="mt-6 p-4 bg-[#030a16] border border-[#ffaa00]/40 rounded-xl shadow-[0_0_15px_rgba(255,170,0,0.1)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffaa00] animate-ping" />
              <h3 className="text-[#ffaa00] font-bold text-sm tracking-wider">
                工程除錯數據 ({direction === 'outbound' ? '去程' : '回程'} Debug Line)
              </h3>
              {debugSnapshotArray.length > 0 && (
                <span className="text-xs text-[#7ecfdf]/60 font-mono">
                  ({debugSnapshotArray[0].busNumber} - {debugSnapshotArray[0].plateNumb})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyJson}
                className="px-3 py-1 bg-[#1a1105] hover:bg-[#291705] border border-[#ffaa00]/50 hover:border-[#ffaa00] text-[#ffaa00] text-xs font-bold rounded transition-all duration-200 cursor-pointer flex items-center gap-1.5"
              >
                {copied ? '已複製！' : '複製 JSON 資料'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDebugMode(false)
                  setSelectedPlate(null)
                }}
                className="px-3 py-1 bg-[#260a0a] hover:bg-[#3d1212] border border-[#ff4d4d]/50 hover:border-[#ff4d4d] text-[#ff4d4d] text-xs font-bold rounded transition-all duration-200 cursor-pointer flex items-center"
              >
                關閉工程模式
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto rounded bg-black/60 p-3 border border-white/5">
            {debugSnapshotArray.length > 0 ? (
              <pre className="text-xs text-[#00ff66] font-mono leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(debugSnapshotArray, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-[#ffaa00]/70 font-mono">
                {loading ? '資料載入中...' : `目前${direction === 'outbound' ? '去程' : '回程'}無任何公車資料，請等候或點擊「立即更新」`}
              </p>
            )}
          </div>
        </section>
      )}

      {isEnvDialogOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="max-w-md w-full rounded-2xl border border-[#6fd2ff]/60 bg-[#031026] p-6 text-[#d6f6ff] shadow-[0_0_30px_rgba(0,195,255,0.35)] space-y-4">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                saveEnvSettings()
              }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold tracking-wide text-neon-cyan">環境設定</h2>
              <p className="text-sm text-[#95d6ea]">請輸入 TDX API 憑證，將儲存在瀏覽器 localStorage。</p>

              <label className="block text-sm font-semibold space-y-1">
                <span>VITE_TDX_CLIENT_ID</span>
                <input
                  value={clientIdInput}
                  onChange={(event) => setClientIdInput(event.target.value)}
                  className="w-full rounded-lg border border-[#3b6780] bg-[#010915] px-3 py-2 text-sm text-[#d6f6ff] outline-none focus:border-[#6fd2ff]"
                  autoComplete="off"
                />
              </label>

              <label className="block text-sm font-semibold space-y-1">
                <span>VITE_TDX_CLIENT_SECRET</span>
                <input
                  type="password"
                  value={clientSecretInput}
                  onChange={(event) => setClientSecretInput(event.target.value)}
                  className="w-full rounded-lg border border-[#3b6780] bg-[#010915] px-3 py-2 text-sm text-[#d6f6ff] outline-none focus:border-[#6fd2ff]"
                  autoComplete="off"
                />
              </label>

              {envError ? <p className="text-sm text-[#ff8e8e] font-semibold">{envError}</p> : null}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={cancelEnvSettings}
                  className="px-4 py-2 rounded-xl border border-[#3b6780] text-[#9cd5e6] hover:bg-[#0a2039] font-bold text-sm cursor-pointer transition-all duration-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl border border-[#74dcff] bg-[#08314f] text-[#c9f2ff] font-bold hover:bg-[#0a4066] text-sm cursor-pointer transition-all duration-200 shadow-[0_0_15px_rgba(0,195,255,0.2)]"
                >
                  儲存並套用
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
