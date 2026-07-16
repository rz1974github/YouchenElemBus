import type { BusLane } from '../types'

interface RouteDiagramProps {
  stationNames: string[]
  stationY: number[]
  lanes: BusLane[]
}

const SVG_WIDTH = 900
const SVG_HEIGHT = 560
const MAIN_LINE_X = 220
const RIGHT_START_X = 390
const RIGHT_GAP = 78

function formatEta(eta: number | null): string {
  if (eta == null) {
    return '--'
  }

  return `${eta}分`
}

export function RouteDiagram({ stationNames, stationY, lanes }: RouteDiagramProps) {
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
          <text x={30} y={stationY[idx] + 6} className="station-label">
            {name}
          </text>
        </g>
      ))}

      {lanes.map((lane, laneIdx) => {
        const x = RIGHT_START_X + laneIdx * RIGHT_GAP

        return (
          <g key={`${lane.busNumber}-${laneIdx}`}>
            <text x={x} y={36} className="lane-title" textAnchor="middle">
              {lane.busNumber}
            </text>

            <line
              x1={x}
              y1={stationY[0]}
              x2={x}
              y2={stationY[stationY.length - 1]}
              className="lane-line"
            />

            {lane.etas.map((eta, etaIdx) => (
              <g key={`${lane.busNumber}-${etaIdx}`}>
                <circle cx={x} cy={stationY[etaIdx]} r={15} className="eta-dot" />
                <text x={x} y={stationY[etaIdx] + 5} className="eta-text" textAnchor="middle">
                  {formatEta(eta)}
                </text>
              </g>
            ))}

            {lane.busY != null ? (
              <g transform={`translate(${x}, ${lane.busY})`}>
                <rect x={-14} y={-13} width={28} height={22} rx={6} className="bus-icon" />
                <circle cx={-8} cy={11} r={3} className="bus-wheel" />
                <circle cx={8} cy={11} r={3} className="bus-wheel" />
              </g>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
