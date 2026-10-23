import { appSettings } from '../lib/appSettings'
import type { BusLane, Trip } from '../types'

interface RouteDiagramProps {
  stationNames: string[]
  stationY: number[]
  lanes: BusLane[]
  trip: Trip
  selectedId: string | null
  onSelectBus: (id: string) => void
}

const SVG_WIDTH = 900
// 底部預留首站外側的車子位置，避免被外框裁切
const SVG_HEIGHT = 870
const MAIN_LINE_X = 160
const RIGHT_START_X = 260
const RIGHT_GAP = 101

function formatEta(eta: number | null): string {
  if (eta == null) {
    return '--'
  }

  return `${eta}分`
}

export function RouteDiagram({
  stationNames,
  stationY,
  lanes,
  trip,
  selectedId,
  onSelectBus,
}: RouteDiagramProps) {
  return (
    <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="route-svg" role="img" aria-label="公車動態路線圖">
      <g transform="translate(5, 0)">
      <line
        x1={MAIN_LINE_X}
        y1={stationY[0]}
        x2={MAIN_LINE_X}
        y2={stationY[stationY.length - 1]}
        className="main-line"
      />

      {stationNames.map((name, idx) => (
        <g key={name}>
          <circle cx={MAIN_LINE_X} cy={stationY[idx]} r={15.6} className="station-dot" />
          <text x={MAIN_LINE_X - 26} y={stationY[idx] + 8} className="station-label" textAnchor="end">
            {name}
          </text>
        </g>
      ))}

      {lanes.map((lane) => {
        const x = RIGHT_START_X + lane.laneIndex * RIGHT_GAP
        const displayY = lane.busY

        return (
          <g key={lane.id}>
            {/* 從車子位置到終點站的剩餘路段 */}
            <line x1={x} y1={displayY} x2={x} y2={stationY[stationY.length - 1]} className="lane-line" />

            {lane.etas.map((eta, etaIdx) => eta == null ? null : (
              <g key={`${lane.busNumber}-${etaIdx}`}>
                <circle cx={x} cy={stationY[etaIdx]} r={19.5} className="eta-dot" />
                <text x={x} y={stationY[etaIdx] + 6.5} className="eta-text" textAnchor="middle">
                  {formatEta(eta)}
                </text>
              </g>
            ))}

            <g
              transform={`translate(${x}, ${displayY - 3}) scale(0.975)`}
              onClick={() => onSelectBus(lane.id)}
              style={{ cursor: 'pointer' }}
              className={selectedId === lane.id ? 'selected-bus-g' : ''}
            >
              <g className="bus-wiggle">
                {/* 選中發光圈 */}
                {selectedId === lane.id && (
                  <rect
                    x={-26}
                    y={-17}
                    width={52}
                    height={28}
                    rx={6}
                    fill="none"
                    stroke="#ffaa00"
                    strokeWidth={3}
                    style={{ filter: 'drop-shadow(0 0 8px #ffaa00)' }}
                  />
                )}
                {/* 車身 */}
                <rect x={-22} y={-13} width={44} height={20} rx={4} className="bus-body" />
                {/* 目的地牌（車頭上方） */}
                <rect x={16} y={-13} width={6} height={6} rx={1} className="bus-destination" />
                {/* 擋風玻璃（車頭右側） */}
                <rect x={16} y={-7} width={6} height={10} rx={1} className="bus-windshield" />
                {/* 車窗 */}
                <rect x={-18} y={-10} width={9} height={8} rx={1} className="bus-window" />
                <rect x={-6} y={-10} width={9} height={8} rx={1} className="bus-window" />
                <rect x={6} y={-10} width={8} height={8} rx={1} className="bus-window" />
                {/* 輪子 */}
                <circle cx={-13} cy={11} r={6} className="bus-wheel" />
                <circle cx={13} cy={11} r={6} className="bus-wheel" />
                <circle cx={-13} cy={11} r={2.5} className="bus-hubcap" />
                <circle cx={13} cy={11} r={2.5} className="bus-hubcap" />
                {/* 車號標籤（公車中間，黑底白字） */}
                <rect x={-16} y={-9} width={32} height={18} rx={3} className="bus-number-bg" />
                <text x={0} y={2} className="bus-number" textAnchor="middle" dominantBaseline="middle">
                  {lane.busNumber}
                </text>
              </g>
            </g>
          </g>
        )
      })}

      {lanes.length === 0 ? (
        <text
          x={RIGHT_START_X}
          y={stationY[Math.floor(stationY.length / 2)]}
          className="station-label"
          fill="#7ecfdf"
          fontSize={23.4}
        >
          目前沒有 {appSettings.thresholdMinutes} 分鐘內到{appSettings.trips[trip].boardingStop}的車
        </text>
      ) : null}
      </g>
    </svg>
  )
}
