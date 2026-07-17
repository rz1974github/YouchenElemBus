import type { BusLane, Direction } from '../types'

interface RouteDiagramProps {
  stationNames: string[]
  stationY: number[]
  lanes: BusLane[]
  direction: Direction
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 600
const MAIN_LINE_X = 220
const RIGHT_START_X = 300
const RIGHT_GAP = 78

function formatEta(eta: number | null): string {
  if (eta == null) {
    return '--'
  }

  return `${eta}分`
}

export function RouteDiagram({ stationNames, stationY, lanes, direction }: RouteDiagramProps) {
  const titleY = direction === 'outbound'
    ? stationY[0] + 48
    : 36
  return (
    <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="route-svg" role="img" aria-label="公車動態路線圖">
      <line
        x1={MAIN_LINE_X}
        y1={stationY[0]}
        x2={MAIN_LINE_X}
        y2={stationY[stationY.length - 1]}
        className="main-line"
      />

      {stationNames.map((name, idx) => (
        <g key={name}>
          <circle cx={MAIN_LINE_X} cy={stationY[idx]} r={12} className="station-dot" />
          <text x={MAIN_LINE_X - 20} y={stationY[idx] + 6} className="station-label" textAnchor="end">
            {name}
          </text>
        </g>
      ))}

      {lanes.map((lane, laneIdx) => {
        const x = RIGHT_START_X + laneIdx * RIGHT_GAP
        const firstActiveIdx = lane.etas.findIndex((eta) => eta != null)
        
        // 计算下一個即將到達的站（最小非負 ETA）以找出公車所在的區間
        let minEta = Number.POSITIVE_INFINITY
        let approachIdx = -1
        lane.etas.forEach((eta, index) => {
          if (eta != null && eta >= 0 && eta < minEta) {
            minEta = eta
            approachIdx = index
          }
        })
        const prevIdx = approachIdx - 1
        const isBusBetween = lane.busY != null && prevIdx >= 0 && approachIdx !== -1

        // 计算车号和公车的显示Y位置
        let displayY: number | null = null
        if (lane.busY != null) {
          // 已进入路线，显示在busY（两站间或圆圈上）
          displayY = lane.busY
        } else if (firstActiveIdx !== -1) {
          // 还没进入路线（没有busY），但有站有eta，显示在初始外侧
          displayY = direction === 'outbound'
            ? stationY[0] + 48  // 去程：松山車站（下方）
            : stationY[0] - 48  // 回程：玉成國小（上方）
        }
        // 否则完全过站，displayY = null（不显示）

        return (
          <g key={`${lane.busNumber}-${laneIdx}`}>
            {displayY != null && firstActiveIdx !== -1 && (
              <g>
                {Array.from({ length: stationY.length - 1 }).map((_, sIdx) => {
                  // 如果這一段剛好是車子正在行駛的區間，就不畫虛線
                  const isThisSegmentBusBetween = isBusBetween && sIdx === prevIdx
                  if (sIdx < firstActiveIdx || isThisSegmentBusBetween) {
                    return null
                  }
                  return (
                    <line
                      key={sIdx}
                      x1={x}
                      y1={stationY[sIdx]}
                      x2={x}
                      y2={stationY[sIdx + 1]}
                      className="lane-line"
                    />
                  )
                })}
              </g>
            )}

            {lane.etas.map((eta, etaIdx) => eta == null || eta < 0 ? null : (
              <g key={`${lane.busNumber}-${etaIdx}`}>
                <circle cx={x} cy={stationY[etaIdx]} r={15} className="eta-dot" />
                <text x={x} y={stationY[etaIdx] + 5} className="eta-text" textAnchor="middle">
                  {formatEta(eta)}
                </text>
              </g>
            ))}

            {displayY != null ? (
              <g transform={`translate(${x}, ${displayY + 8})`}>
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
            ) : null}
          </g>
        )
      })}

      {lanes.length === 0 ? (
        <text
          x={RIGHT_START_X}
          y={stationY[Math.floor(stationY.length / 2)]}
          className="station-label"
          fill="#7ecfdf"
          fontSize={18}
        >
          目前沒有 10 分鐘內到站的車
        </text>
      ) : null}
    </svg>
  )
}
