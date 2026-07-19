import type { BusLane, Direction } from '../types'

interface RouteDiagramProps {
  stationNames: string[]
  stationY: number[]
  lanes: BusLane[]
  direction: Direction
  selectedPlate: string | null
  onSelectBus: (plateNumb: string) => void
}

const SVG_WIDTH = 900
// 將 SVG_HEIGHT 配合內容放大 1.3 倍而調高至 870
// 提供無比寬敞的底部安全空間，徹底根除被圓角外框裁切消失的問題。
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
  direction,
  selectedPlate,
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
        const laneIdx = lane.laneIndex ?? 0
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
        const isBetweenStops = minEta > 0 && prevIdx >= 0

        // 如果 minEta 為 0，代表公車已抵達 approachIdx，則 approachIdx 之前的路段（sIdx < approachIdx）皆已通過
        // 如果 minEta 大於 0，代表公車還在往 approachIdx 途中的區間（sIdx < approachIdx - 1）皆已通過
        const startSegmentIdx = minEta === 0 ? approachIdx : prevIdx

        // 计算车号 and 公车的显示Y位置
        let displayY: number | null = null
        if (lane.busY != null) {
          // 已進入或準備進入路線，顯示在busY
          displayY = lane.busY
        } else if (firstActiveIdx !== -1) {
          // 还没進入路線，顯示在初始外側
          displayY = direction === 'outbound'
            ? stationY[0] + 62  // 去程：松山車站（下方）
            : stationY[0] - 62  // 回程：玉成國小（上方）
        }

        return (
          <g key={lane.plateNumb}>
            {displayY != null && firstActiveIdx !== -1 && (
              <g>
                {Array.from({ length: stationY.length - 1 }).map((_, sIdx) => {
                  // 如果這一段已經被公車完全通過了（sIdx < startSegmentIdx），就不畫虛線
                  if (sIdx < startSegmentIdx) {
                    return null
                  }
                  // 公車在兩站中間時，公車所在的那一段虛線不畫。
                  if (isBetweenStops && sIdx === prevIdx) {
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
                <circle cx={x} cy={stationY[etaIdx]} r={19.5} className="eta-dot" />
                <text x={x} y={stationY[etaIdx] + 6.5} className="eta-text" textAnchor="middle">
                  {formatEta(eta)}
                </text>
              </g>
            ))}

            {displayY != null ? (
              <g
                transform={`translate(${x}, ${displayY - 3}) scale(0.975)`}
                onClick={() => onSelectBus(lane.plateNumb)}
                style={{ cursor: 'pointer' }}
                className={selectedPlate === lane.plateNumb ? 'selected-bus-g' : ''}
              >
                <g className="bus-wiggle">
                {/* 選中發光圈 */}
                {selectedPlate === lane.plateNumb && (
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
          fontSize={23.4}
        >
          目前沒有 10 分鐘內到站的車
        </text>
      ) : null}
      </g>
    </svg>
  )
}
