import { useEffect, useMemo, useRef, useState } from 'react'
import { stack, validateCube, type Coordinates, type Cube } from './studio-data'

type Point = { x: number; y: number }
type Mode = 'wipe' | 'blink' | 'difference'
const tag = 'Unidentified Moving Object'

function integerParam(name: string, limit: number, fallback: number) {
  const value = new URLSearchParams(location.search).get(name)
  return value !== null && /^\d+$/.test(value) && Number(value) < limit ? Number(value) : fallback
}

function download(content: string, format: 'json' | 'csv') {
  const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `spherex-candidate.${format}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ObservationStudio({ url, target, coords, zoom, onZoom }: {
  url: string; target: string; coords: Coordinates; zoom: number; onZoom: (zoom: number) => void
}) {
  const [cube, setCube] = useState<Cube>()
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Cube unavailable')
      return response.json()
    }).then(validateCube).then(setCube).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [url])
  if (!cube) return <p className="details" role="status">{error ? 'The observation cube could not be loaded.' : 'Loading observation cube…'}</p>
  return <Studio cube={cube} target={target} coords={coords} zoom={zoom} onZoom={onZoom} />
}

export function Studio({ cube, target, coords, zoom, onZoom, simulated = false }: {
  cube: Cube; target: string; coords: Coordinates; zoom: number; onZoom: (zoom: number) => void; simulated?: boolean
}) {
  const { width, height, bands, epochs, unit } = cube
  const query = new URLSearchParams(location.search)
  const [first, setFirst] = useState(integerParam('a', epochs.length, 0))
  const [second, setSecond] = useState(integerParam('b', epochs.length, 1))
  const [mode, setMode] = useState<Mode>(() => query.get('mode') === 'difference' ? 'difference' : query.get('mode') === 'blink' ? 'blink' : 'wipe')
  const [band, setBand] = useState(() => {
    const value = query.get('band') ?? 'detector-4'
    return /^detector-[1-6]$/.test(value) || /^band-\d+$/.test(value) && Number(value.slice(5)) < bands.length ? value : 'detector-4'
  })
  const [wipe, setWipe] = useState(integerParam('wipe', 101, 50))
  const [alternateBand, setAlternateBand] = useState(integerParam('bandB', bands.length, -1))
  const [blink, setBlink] = useState(false)
  const [point, setPoint] = useState<Point | null>(() => {
    const x = integerParam('x', width, -1)
    const y = integerParam('y', height, -1)
    return x >= 0 && y >= 0 ? { x, y } : null
  })
  const [tagged, setTagged] = useState(query.get('candidate') === '1')
  const [share, setShare] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const indices = useMemo(() => bands.flatMap((item, index) =>
    band === `detector-${item.detector}` || band === `band-${index}` ? [index] : []), [band, bands])
  const selected = indices.length ? indices : [0]
  const selectedKey = selected.join(',')
  const pixels = useMemo(() => {
    const indices = selectedKey.split(',').map(Number)
    const a = stack(epochs[first].planes, indices, width * height)
    const b = stack(epochs[second].planes, alternateBand < 0 ? indices : [alternateBand], width * height)
    const delta = Float32Array.from(a, (value, pixel) => {
      if (alternateBand >= 0) return b[pixel] - value
      let sum = 0
      let count = 0
      for (const index of indices) {
        const before = epochs[first].planes[index][pixel]
        const after = epochs[second].planes[index][pixel]
        if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after)) continue
        sum += after - before
        count++
      }
      return count ? sum / count : NaN
    })
    let low = Infinity
    let high = -Infinity
    let differenceScale = 0
    for (let i = 0; i < a.length; i++) {
      for (const value of [a[i], b[i]]) {
        if (!Number.isFinite(value)) continue
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
      if (Number.isFinite(delta[i])) differenceScale = Math.max(differenceScale, Math.abs(delta[i]))
    }
    return { a, b, delta, low, range: high - low || 1, differenceScale: differenceScale || 1 }
  }, [epochs, first, second, selectedKey, alternateBand, width, height])

  useEffect(() => {
    if (mode !== 'blink') return
    const timer = window.setInterval(() => setBlink(value => !value), 750)
    return () => window.clearInterval(timer)
  }, [mode])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sourceX = Math.floor(width / 2 + (x - width / 2) / zoom)
        const sourceY = Math.floor(height / 2 + (y - height / 2) / zoom)
        const source = sourceY * width + sourceX
        const offset = (y * width + x) * 4
        const showSecond = mode === 'blink' ? blink : x >= width * wipe / 100
        const value = mode === 'difference' ? pixels.delta[source] : (showSecond ? pixels.b : pixels.a)[source]
        if (Number.isFinite(value)) {
          const level = mode === 'difference' ? Math.abs(value) / pixels.differenceScale : (value - pixels.low) / pixels.range
          const brightness = Math.round(255 * (mode === 'difference' ? level : Math.sqrt(level)))
          image.data[offset] = mode === 'difference' && value < 0 ? brightness * .2 : brightness
          image.data[offset + 1] = mode === 'difference' ? brightness * .63 : brightness
          image.data[offset + 2] = mode === 'difference' && value > 0 ? brightness * .22 : brightness
        } else {
          image.data[offset + 2] = 28
        }
        image.data[offset + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
    if (point) {
      const x = width / 2 + (point.x + .5 - width / 2) * zoom
      const y = height / 2 + (point.y + .5 - height / 2) * zoom
      ctx.strokeStyle = tagged ? '#ffb859' : '#a0e8de'
      ctx.strokeRect(x - 3, y - 3, 6, 6)
    }
  }, [blink, height, mode, pixels, point, tagged, width, wipe, zoom])

  const activeEpoch = mode === 'blink' && !blink ? first : second
  const samples = point ? bands.flatMap(({ wavelength }, index) => {
    const value = epochs[activeEpoch].planes[index][point.y * width + point.x]
    return value === null || !Number.isFinite(value) ? [] : [{ wavelength, value }]
  }).sort((a, b) => a.wavelength - b.wavelength) : []

  function candidateUrl() {
    const url = new URL(location.href)
    url.search = new URLSearchParams({
      ra: String(coords.ra), dec: String(coords.dec), zoom: String(zoom), a: String(first), b: String(second),
      band: indices.length ? band : 'band-0', mode, wipe: String(wipe),
      ...(alternateBand >= 0 ? { bandB: String(alternateBand) } : {}),
      ...(simulated ? { demo: target } : {}),
      ...(point ? { x: String(point.x), y: String(point.y), candidate: '1' } : {}),
    }).toString()
    url.hash = 'explorer'
    return url.href
  }

  function exportCandidate(format: 'json' | 'csv') {
    if (!point || !tagged) return
    const report = {
      label: tag, target, simulated, fieldRa: coords.ra, fieldDec: coords.dec, pixelX: point.x, pixelY: point.y,
      epochA: epochs[first].date, epochB: epochs[second].date, sourceA: epochs[first].source ?? '',
      sourceB: epochs[second].source ?? '', wavelengthsMicrons: selected.map(index => bands[index].wavelength).join(';'),
      wavelengthBMicrons: alternateBand < 0 ? 'same as A' : bands[alternateBand].wavelength,
      url: candidateUrl(),
    }
    const csv = (value: string) => '"' + value.replace(/"/g, '""') + '"'
    download(format === 'json' ? JSON.stringify(report, null, 2) : [
      Object.keys(report).join(','), Object.values(report).map(value => csv(String(value))).join(','),
    ].join('\n'), format)
  }

  function selectPoint(next: Point) {
    setPoint(next)
    setTagged(false)
    setShare(false)
  }

  return <div className="studio">
    <div className="studio-controls">
      <label>Epoch A<select value={first} onChange={event => setFirst(Number(event.target.value))}>
        {epochs.map(({ date }, index) => <option key={index} value={index}>{date}</option>)}
      </select></label>
      <label>Epoch B<select value={second} onChange={event => setSecond(Number(event.target.value))}>
        {epochs.map(({ date }, index) => <option key={index} value={index}>{date}</option>)}
      </select></label>
      <label>Infrared bands<select value={indices.length ? band : 'band-0'} onChange={event => setBand(event.target.value)}>
        <optgroup label="Detector averages">{[1, 2, 3, 4, 5, 6].filter(detector => bands.some(item => item.detector === detector)).map(detector =>
          <option key={detector} value={`detector-${detector}`}>Detector {detector} stack</option>)}</optgroup>
        <optgroup label="Individual bands">{bands.map(({ wavelength }, index) =>
          <option key={index} value={`band-${index}`}>Band {index + 1} · {wavelength.toFixed(3)} µm</option>)}</optgroup>
      </select></label>
      <label>Epoch B band<select value={alternateBand} onChange={event => setAlternateBand(Number(event.target.value))}>
        <option value={-1}>Match Epoch A</option>
        {bands.map(({ wavelength }, index) =>
          <option key={index} value={index}>Band {index + 1} · {wavelength.toFixed(3)} µm</option>)}
      </select></label>
      <label>Zoom<select value={zoom} onChange={event => onZoom(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}×</option>)}
      </select></label>
    </div>
    <div className="studio-modes" aria-label="Comparison mode">
      {([['wipe', 'Split view'], ['blink', 'Blink'], ['difference', 'Difference']] as const).map(([value, label]) =>
        <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setBlink(false) }}>{label}</button>)}
    </div>
    <canvas ref={canvas} className="studio-sky" width={width} height={height} tabIndex={0}
      aria-label="Sky comparison. Click to sample a pixel, or use arrow keys to move the selection."
      onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        selectPoint({
          x: Math.max(0, Math.min(width - 1, Math.floor(width / 2 + ((event.clientX - rect.left) / rect.width - .5) * width / zoom))),
          y: Math.max(0, Math.min(height - 1, Math.floor(height / 2 + ((event.clientY - rect.top) / rect.height - .5) * height / zoom))),
        })
      }}
      onKeyDown={event => {
        const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], Enter: [0, 0] }
        const step = steps[event.key]
        if (!step) return
        event.preventDefault()
        selectPoint({
          x: Math.max(0, Math.min(width - 1, (point?.x ?? Math.floor(width / 2)) + step[0])),
          y: Math.max(0, Math.min(height - 1, (point?.y ?? Math.floor(height / 2)) + step[1])),
        })
      }} />
    {mode === 'wipe' && <label className="studio-wipe">Split between Epoch A and B
      <input type="range" min="0" max="100" value={wipe} onChange={event => setWipe(Number(event.target.value))} />
    </label>}
    <p className="studio-help">{mode === 'difference' ? 'Epoch B − A. Amber brightened, blue faded, and black shows near-zero change. Dark navy marks missing samples.'
      : mode === 'blink' ? `Showing epoch ${blink ? 'B' : 'A'}` : 'Epoch A on the left, Epoch B on the right.'} Click the image to sample a pixel.</p>
    {alternateBand >= 0 && <p className="studio-help">Different wavelengths can leave residuals around stationary stars. Match bands to investigate motion.</p>}
    {point && <div className="studio-report">
      <h3>Pixel spectrum · ({point.x}, {point.y})</h3>
      <p>Epoch {activeEpoch === first && mode === 'blink' && !blink ? 'A' : 'B'} · {unit}</p>
      {samples.length ? <Spectrum samples={samples} /> : <p>No valid samples at this pixel.</p>}
      <div className="studio-modes">
        <button aria-pressed={tagged} onClick={() => { setTagged(!tagged); setShare(false) }}>{tagged ? 'Remove candidate tag' : `Tag as ${tag}`}</button>
        {tagged && <>
          <button onClick={() => exportCandidate('json')}>Download JSON</button>
          <button onClick={() => exportCandidate('csv')}>Download CSV</button>
          <button onClick={() => setShare(true)}>Share candidate</button>
        </>}
      </div>
      {tagged && <p>{simulated ? 'Simulated candidate' : 'Candidate awaiting review'}</p>}
      {share && <label>Candidate link<input value={candidateUrl()} readOnly onFocus={event => event.currentTarget.select()} /></label>}
    </div>}
  </div>
}

function Spectrum({ samples }: { samples: { wavelength: number; value: number }[] }) {
  const values = samples.map(item => item.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const start = samples[0].wavelength
  const end = samples[samples.length - 1].wavelength
  const points = samples.map(({ wavelength, value }) => [
    12 + (end === start ? .5 : (wavelength - start) / (end - start)) * 376,
    86 - (high === low ? .5 : (value - low) / (high - low)) * 74,
  ])
  return <figure className="spectrum">
    <svg viewBox="0 0 400 100" role="img" aria-label={`Pixel brightness from ${low.toPrecision(3)} to ${high.toPrecision(3)} across ${samples.length} wavelength samples`}>
      <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.length === 1 && <circle cx={points[0][0]} cy={points[0][1]} r="3" fill="currentColor" />}
    </svg>
    <figcaption>{start.toFixed(2)}–{end.toFixed(2)} µm · {samples.length} samples · {low.toPrecision(3)} to {high.toPrecision(3)}</figcaption>
  </figure>
}
