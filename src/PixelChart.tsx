import { useId, useState } from 'react'

const descriptions = {
  lightCurve: ['Pixel Light Curve', 'Shows how bright the selected spot was on different dates. A change can come from a source brightening, fading, or moving through that spot.'],
  spectrum: ['Pixel Spectrum', 'Shows how bright the selected spot is at different infrared wavelengths. Each point measures a different part of the infrared spectrum.'],
}

export function PixelChartHeading({ kind }: { kind: keyof typeof descriptions }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const [title, description] = descriptions[kind]
  return <>
    <div className="pixel-chart-heading">
      <h3>{title}</h3>
      <button type="button" aria-label={`About the ${title}`} aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(value => !value)}>ⓘ</button>
    </div>
    <p id={id} hidden={!open}>{description}</p>
  </>
}

export function PixelChart({ samples, axis, unit }: {
  samples: { x: number; label: string; value: number }[]
  axis: string
  unit: string
}) {
  const [index, setIndex] = useState(0)
  if (!samples.length) return <p>No valid samples at this pixel.</p>
  const activeIndex = Math.min(index, samples.length - 1)
  const active = samples[activeIndex]
  const values = samples.map(item => item.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const start = samples[0].x
  const end = samples[samples.length - 1].x
  const points = samples.map(({ x, value }) => [
    12 + (end === start ? .5 : (x - start) / (end - start)) * 376,
    86 - (high === low ? .5 : (value - low) / (high - low)) * 74,
  ])
  return <figure className="spectrum">
    <svg viewBox="0 0 400 100" role="img" aria-label={`Brightness by ${axis.toLowerCase()}, ${samples.length} samples`}>
      <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.length <= 18 && points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="currentColor" />)}
      <circle cx={points[activeIndex][0]} cy={points[activeIndex][1]} r="4.5" fill="currentColor" stroke="#edf3fa" />
    </svg>
    {samples.length > 1 && <input type="range" aria-label={`${axis} sample`} min="0" max={samples.length - 1}
      value={activeIndex} onChange={event => setIndex(Number(event.target.value))} />}
    <figcaption>Horizontal · {axis} / Vertical · Brightness ({unit})<br />
      {active.label} · {active.value.toPrecision(4)} {unit} · {samples.length} {samples.length === 1 ? 'sample' : 'samples'}</figcaption>
  </figure>
}
