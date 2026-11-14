import { useEffect, useMemo, useRef, useState } from 'react'
import { stack, validateCube, type Coordinates, type Cube } from './studio-data'

type Point = { x: number; y: number }
type Mode = 'wipe' | 'blink' | 'difference' | 'sum'
const modes = [['wipe', 'Split view'], ['blink', 'Blink'], ['difference', 'Difference'], ['sum', 'Add epochs']] as const
const tag = 'Unidentified Moving Object'

function integerParam(name: string, limit: number, fallback: number) {
  const value = new URLSearchParams(location.search).get(name)
  return value !== null && /^\d+$/.test(value) && Number(value) < limit ? Number(value) : fallback
}

function download(content: string, format: 'json' | 'csv', name = 'spherex-candidate') {
  const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.${format}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ObservationStudio({ url, target, coords, zoom, onZoom, field }: {
  url: string; target: string; coords: Coordinates; zoom: number; onZoom: (zoom: number) => void; field?: string
}) {
  const [cube, setCube] = useState<Cube>()
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Cube unavailable')
      if (url.endsWith('.gz') && response.body) {
        return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json()
      }
      return response.json()
    }).then(data => validateCube(data?.cube ?? data)).then(setCube).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [url])
  if (!cube) return <p className="details" role="status">{error ? 'The observation cube could not be loaded.' : 'Loading observation cube…'}</p>
  return <Studio cube={cube} target={target} coords={coords} zoom={zoom} onZoom={onZoom} field={field} />
}

export function Studio({ cube, target, coords, zoom, onZoom, field, simulated = false, local = false }: {
  cube: Cube; target: string; coords: Coordinates; zoom: number; onZoom: (zoom: number) => void; field?: string; simulated?: boolean; local?: boolean
}) {
  const { width, height, bands, epochs, unit } = cube
  const query = new URLSearchParams(location.search)
  const [first, setFirst] = useState(integerParam('a', epochs.length, 0))
  const canCompare = epochs.length > 1
  const [second, setSecond] = useState(integerParam('b', epochs.length, epochs[0].observations ? epochs.length - 1 : Math.min(1, epochs.length - 1)))
  const [mode, setMode] = useState<Mode>(() => canCompare
    ? modes.find(([value]) => value === query.get('mode'))?.[0] ?? (local ? 'difference' : 'wipe')
    : 'wipe')
  const [band, setBand] = useState(() => {
    const fallback = epochs[0].observations ? 'detector-6' : 'detector-4'
    const value = query.get('band') ?? fallback
    return /^detector-[1-6]$/.test(value) || /^band-\d+$/.test(value) && Number(value.slice(5)) < bands.length ? value : fallback
  })
  const [wipe, setWipe] = useState(integerParam('wipe', 101, 50))
  const [alternateBand, setAlternateBand] = useState(integerParam('bandB', bands.length, -1))
  const [blink, setBlink] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [blinkAll, setBlinkAll] = useState(query.get('playback') !== 'pair' && epochs.length > 2 && alternateBand < 0)
  const [faintStars, setFaintStars] = useState(query.get('stretch') !== 'original' && !simulated && !!cube.pixelScaleArcsec)
  const playAll = blinkAll && alternateBand < 0
  const frameCount = playAll ? epochs.length : 2
  const [point, setPoint] = useState<Point | null>(() => {
    const x = integerParam('x', width, -1)
    const y = integerParam('y', height, -1)
    return x >= 0 && y >= 0 ? { x, y } : null
  })
  const [tagged, setTagged] = useState(query.get('candidate') === '1')
  const [share, setShare] = useState(false)
  const [copied, setCopied] = useState(false)
  const [spectrumEpoch, setSpectrumEpoch] = useState(() => canCompare && query.get('spectrum') !== 'a' ? 'b' : 'a')
  const canvas = useRef<HTMLCanvasElement>(null)
  const indices = useMemo(() => bands.flatMap((item, index) =>
    band === `detector-${item.detector}` || band === `band-${index}` ? [index] : []), [band, bands])
  const selected = indices.length ? indices : [0]
  const selectedKey = selected.join(',')
  const pixels = useMemo(() => {
    const indices = selectedKey.split(',').map(Number)
    const a = stack(epochs[first].planes, indices, width * height)
    const b = stack(epochs[second].planes, alternateBand < 0 ? indices : [alternateBand], width * height)
    const frames = mode === 'blink' && playAll
      ? epochs.map(epoch => stack(epoch.planes, indices, width * height))
      : [a, b]
    const signA = mode === 'sum' ? 1 : -1
    const combined = Float32Array.from(a, (value, pixel) => {
      if (alternateBand >= 0) return b[pixel] + signA * value
      let sum = 0
      let count = 0
      for (const index of indices) {
        const before = epochs[first].planes[index][pixel]
        const after = epochs[second].planes[index][pixel]
        if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after)) continue
        sum += after + signA * before
        count++
      }
      return count ? sum / count : NaN
    })
    const displayFrames = mode === 'sum' ? [combined] : frames
    let low = Infinity
    let high = -Infinity
    const samples: number[] = []
    for (const frame of displayFrames) {
      for (const value of frame) {
        if (!Number.isFinite(value)) continue
        low = Math.min(low, value)
        high = Math.max(high, value)
        if (faintStars) samples.push(value)
      }
    }
    if (samples.length) {
      samples.sort((a, b) => a - b)
      const lower = samples[Math.floor((samples.length - 1) * .45)]
      const upper = samples[Math.floor((samples.length - 1) * .997)]
      if (upper > lower) {
        low = lower
        high = upper
      }
    }
    let differenceScale = 0
    for (let i = 0; i < a.length; i++) {
      if (Number.isFinite(combined[i])) differenceScale = Math.max(differenceScale, Math.abs(combined[i]))
    }
    return { a, b, frames, combined, low, range: high - low || 1, differenceScale: differenceScale || 1 }
  }, [epochs, first, second, selectedKey, alternateBand, width, height, mode, playAll, faintStars])

  useEffect(() => {
    if (!canCompare || mode !== 'blink' || !playing) return
    const timer = window.setInterval(() => setBlink(value => (value + 1) % frameCount), 750)
    return () => window.clearInterval(timer)
  }, [mode, canCompare, playing, frameCount])

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
        const value = mode === 'blink' ? pixels.frames[blink % frameCount][source]
          : mode === 'difference' || mode === 'sum' ? pixels.combined[source]
          : (x >= width * wipe / 100 ? pixels.b : pixels.a)[source]
        if (Number.isFinite(value)) {
          const difference = canCompare && mode === 'difference'
          const level = difference ? Math.abs(value) / pixels.differenceScale : Math.max(0, Math.min(1, (value - pixels.low) / pixels.range))
          const brightness = Math.round(255 * (difference ? level : faintStars ? Math.asinh(12 * level) / Math.asinh(12) : Math.sqrt(level)))
          image.data[offset] = difference && value < 0 ? brightness * .2 : brightness
          image.data[offset + 1] = difference ? brightness * .63 : brightness
          image.data[offset + 2] = difference && value > 0 ? brightness * .22 : brightness
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
  }, [blink, height, mode, pixels, point, tagged, width, wipe, zoom, canCompare, frameCount, faintStars])

  const blinkEpoch = playAll ? blink % frameCount : blink % frameCount === 0 ? first : second
  const activeEpoch = mode === 'blink' ? blinkEpoch : spectrumEpoch === 'a' ? first : second
  const pixelIndex = point ? point.y * width + point.x : -1
  const spectrum = point ? bands.flatMap((band, index) => {
    const wavelength = epochs[activeEpoch].observations?.[index].wavelength ?? band.wavelength
    const value = epochs[activeEpoch].planes[index][pixelIndex]
    const flags = epochs[activeEpoch].flags?.[index][pixelIndex]
    return value === null || !Number.isFinite(value) ? [] : [{
      x: wavelength, label: `${wavelength.toFixed(3)} µm · D${band.detector}`, value, detector: band.detector, flags,
    }]
  }).sort((a, b) => a.x - b.x) : []
  const curveBand = selected[Math.floor(selected.length / 2)]
  const lightCurve = point ? epochs.flatMap(epoch => {
    const date = epoch.observations?.[curveBand].date ?? epoch.date
    const value = epoch.planes[curveBand][pixelIndex]
    return value === null || !Number.isFinite(value) ? [] : [{ x: Date.parse(date), label: date, value }]
  }).sort((a, b) => a.x - b.x) : []
  const observationsA = epochs[first].observations
  const observationsB = epochs[second].observations
  const observationA = observationsA?.[selected[0]]
  const observationB = observationsB?.[alternateBand < 0 ? selected[0] : alternateBand]
  const displayedObservation = epochs[blinkEpoch].observations?.[!playAll && blink % frameCount === 1 && alternateBand >= 0
    ? alternateBand : selected[0]]

  function viewUrl() {
    const url = new URL(location.href)
    const embed = url.searchParams.get('embed')
    url.search = new URLSearchParams({
      ra: String(coords.ra), dec: String(coords.dec), zoom: String(zoom), a: String(first), b: String(second),
      band: indices.length ? band : 'band-0', mode, wipe: String(wipe), spectrum: spectrumEpoch,
      ...(alternateBand >= 0 ? { bandB: String(alternateBand) } : {}),
      ...(simulated ? { demo: target } : {}),
      ...(point ? { x: String(point.x), y: String(point.y) } : {}),
      ...(point && tagged ? { candidate: '1' } : {}),
      ...(mode === 'blink' && !playAll ? { playback: 'pair' } : {}),
      ...(!faintStars ? { stretch: 'original' } : {}),
      ...(!canCompare ? { product: 'spectrum' } : {}),
      ...(field ? { field } : {}),
      ...(embed === '1' ? { embed } : {}),
    }).toString()
    url.hash = 'explorer'
    return url.href
  }

  const currentViewUrl = viewUrl()
  useEffect(() => {
    if (local) return
    const url = new URL(currentViewUrl)
    url.hash = location.hash
    history.replaceState(null, '', url)
    setCopied(false)
  }, [currentViewUrl, local])

  async function copyView() {
    setShare(true)
    try {
      await navigator.clipboard.writeText(currentViewUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function exportCandidate(format: 'json' | 'csv') {
    if (!point || !tagged) return
    const report = {
      label: tag, target, simulated, fieldRa: coords.ra, fieldDec: coords.dec, pixelX: point.x, pixelY: point.y,
      epochA: observationA?.date ?? epochs[first].date, epochB: observationB?.date ?? epochs[second].date,
      sourceA: observationA?.source ?? epochs[first].source ?? '',
      sourceB: observationB?.source ?? epochs[second].source ?? '',
      wavelengthsMicrons: selected.map(index => observationsA?.[index].wavelength ?? bands[index].wavelength).join(';'),
      wavelengthBMicrons: observationB?.wavelength ?? (alternateBand < 0 ? 'same as A' : bands[alternateBand].wavelength),
      ...(local ? {} : { url: viewUrl() }),
    }
    const csv = (value: unknown) => {
      const text = String(value)
      const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(text) ? "'" + text : text
      return '"' + safe.replace(/"/g, '""') + '"'
    }
    download(format === 'json' ? JSON.stringify(report, null, 2) : [
      Object.keys(report).join(','), Object.values(report).map(csv).join(','),
    ].join('\n'), format)
  }

  function selectPoint(next: Point) {
    setPoint(next)
    setTagged(false)
    setShare(false)
  }

  return <div className="studio">
    <div className="studio-controls">
      {canCompare && <><label>Epoch A<select value={first} onChange={event => setFirst(Number(event.target.value))}>
        {epochs.map(({ date, label }, index) => <option key={index} value={index}>{label ?? date}</option>)}
      </select></label>
      <label>Epoch B<select value={second} onChange={event => setSecond(Number(event.target.value))}>
        {epochs.map(({ date, label }, index) => <option key={index} value={index}>{label ?? date}</option>)}
      </select></label></>}
      <label>Infrared bands<select value={indices.length ? band : 'band-0'} onChange={event => setBand(event.target.value)}>
        <optgroup label="Detector averages">{[1, 2, 3, 4, 5, 6].filter(detector => bands.some(item => item.detector === detector)).map(detector => {
          const count = bands.filter(item => item.detector === detector).length
          return <option key={detector} value={`detector-${detector}`}>Detector {detector}{count > 1 ? ` · ${count} channels` : ''}</option>
        })}</optgroup>
        {[1, 2, 3, 4, 5, 6].filter(detector => bands.some(item => item.detector === detector)).map(detector =>
          <optgroup key={detector} label={`Detector ${detector} channels`}>{bands.map(({ wavelength, detector: sourceDetector }, index) =>
            sourceDetector === detector && <option key={index} value={`band-${index}`}>Band {index + 1} · {wavelength.toFixed(3)} µm</option>)}</optgroup>)}
      </select></label>
      {canCompare && <label>Epoch B band<select value={alternateBand} onChange={event => setAlternateBand(Number(event.target.value))}>
        <option value={-1}>{observationsB ? 'Same detector' : 'Match Epoch A'}</option>
        {bands.map(({ wavelength }, index) =>
          <option key={index} value={index}>Band {index + 1} · {wavelength.toFixed(3)} µm</option>)}
      </select></label>}
      <label>{cube.pixelScaleArcsec ? 'Field width' : 'Zoom'}<select value={zoom} onChange={event => onZoom(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{cube.pixelScaleArcsec
          ? `${(width * cube.pixelScaleArcsec / (60 * value)).toFixed(2)}′` : `${value}×`}</option>)}
      </select></label>
    </div>
    <div className="studio-modes" aria-label="Comparison mode">
      {canCompare && modes.map(([value, label]) =>
        <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setBlink(0); setPlaying(false) }}>{label}</button>)}
      {!simulated && mode !== 'difference' && <button aria-pressed={faintStars} onClick={() => setFaintStars(value => !value)}>Boost faint stars</button>}
      {!local && <button onClick={copyView}>{copied ? 'Link copied' : 'Copy view link'}</button>}
    </div>
    {share && <label className="studio-link">View link<input value={currentViewUrl} readOnly onFocus={event => event.currentTarget.select()} /></label>}
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
    {canCompare && <div className="studio-playback">
      <button className="primary" onClick={() => {
        if (mode !== 'blink') {
          setMode('blink')
          setBlink(0)
          setPlaying(true)
        } else setPlaying(value => !value)
      }}>{mode === 'blink' && playing ? 'Pause' : 'Play'}</button>
      {mode === 'blink' && <>
        <button onClick={() => { setPlaying(false); setBlink(value => (value + 1) % frameCount) }}>Next frame</button>
        {epochs.length > 2 && alternateBand < 0 && <label className="playback-scope">
          <input type="checkbox" checked={blinkAll} onChange={event => { setBlinkAll(event.target.checked); setBlink(0) }} /> All epochs
        </label>}
        <span>{blink % frameCount + 1} / {frameCount} · {displayedObservation?.date.slice(0, 10) ?? epochs[blinkEpoch].label ?? epochs[blinkEpoch].date}</span>
        {displayedObservation && <a href={displayedObservation.cutout}>Frame FITS</a>}
      </>}
    </div>}
    {canCompare && mode === 'wipe' && <label className="studio-wipe">Split between Epoch A and B
      <input type="range" min="0" max="100" value={wipe} onChange={event => setWipe(Number(event.target.value))} />
    </label>}
    <p className="studio-help">{!canCompare ? 'DR1 survey mosaic. Dark navy marks missing samples.'
      : mode === 'sum' ? 'Epoch A + B using pixels with paired measurements. Stationary sources reinforce across epochs.'
      : mode === 'difference' ? 'Epoch B − A. Amber brightened, blue faded, and black shows near-zero change. Dark navy marks missing samples.'
      : mode === 'blink' ? 'Compare the same field across dates.' : 'Epoch A on the left, Epoch B on the right.'} Click the image to sample a pixel.</p>
    {alternateBand >= 0 && <p className="studio-help">Different wavelengths can leave residuals around stationary stars. Match bands to investigate motion.</p>}
    {cube.note && <p className="studio-help">{cube.note}</p>}
    {!canCompare && epochs[0].source && <p><a href={epochs[0].source}>Original IRSA FITS cube</a></p>}
    {observationA && observationB && <details className="details">
      <summary>NASA/IPAC IRSA observations</summary>
      {[observationA, observationB].map((item, index) => <p key={index}>
        Epoch {index === 0 ? 'A' : 'B'} · {item.date} · {item.wavelength.toFixed(4)} µm
        {' · '}<a href={item.source}>Original FITS</a>
        {' · '}<a href={item.cutout} download>FITS cutout</a>
      </p>)}
      <p>Each epoch groups six exposures from the same survey period. Passband and point-spread function differences can leave residuals in the difference image.</p>
    </details>}
    {point && <div className="studio-report">
      <h3>Pixel spectrum · ({point.x}, {point.y})</h3>
      <p>{spectrum.length} of {bands.length} channels have a measured sample at this pixel.</p>
      {canCompare && mode !== 'blink' && <label className="spectrum-epoch">Spectrum epoch<select value={spectrumEpoch} onChange={event => setSpectrumEpoch(event.target.value)}>
        <option value="a">Epoch A · {epochs[first].date}</option>
        <option value="b">Epoch B · {epochs[second].date}</option>
      </select></label>}
      <PixelChart samples={spectrum} axis="Wavelength" unit={unit} />
      {spectrum.length > 0 && <button onClick={() => download([
        'wavelength_um,detector,brightness,flags',
        ...spectrum.map(sample => [sample.x, sample.detector, sample.value, sample.flags ?? ''].join(',')),
      ].join('\n'), 'csv', 'spherex-spectrum')}>Download spectrum CSV</button>}
      {epochs[first].flags && <PixelFlags cube={cube} epoch={first} indices={selected} pixel={pixelIndex} />}
      {canCompare && epochs[second].flags && <PixelFlags cube={cube} epoch={second}
        indices={alternateBand < 0 ? selected : [alternateBand]} pixel={pixelIndex} />}
      {canCompare && <>
      <h3>Pixel light curve</h3>
      <p>Band {curveBand + 1} · {bands[curveBand].wavelength.toFixed(3)} µm across observation dates</p>
      <PixelChart samples={lightCurve} axis="Observation date" unit={unit} />
      <div className="studio-modes">
        <button aria-pressed={tagged} onClick={() => { setTagged(!tagged); setShare(false) }}>{tagged ? 'Remove candidate tag' : `Tag as ${tag}`}</button>
        {tagged && <>
          <button onClick={() => exportCandidate('json')}>Download JSON</button>
          <button onClick={() => exportCandidate('csv')}>Download CSV</button>
          {!local && <button onClick={copyView}>Copy candidate link</button>}
        </>}
      </div>
      {tagged && <p>{simulated ? 'Simulated candidate' : 'Candidate awaiting review'}</p>}
      </>}
    </div>}
  </div>
}

function PixelFlags({ cube, epoch, indices, pixel }: { cube: Cube; epoch: number; indices: number[]; pixel: number }) {
  const values = indices.map(index => cube.epochs[epoch].flags?.[index][pixel])
    .filter((value): value is number => value !== undefined && value !== null)
  if (!values.length) return <p>Quality flags unavailable at the selected pixel.</p>
  const mask = values.reduce((combined, value) => (combined | value) >>> 0, 0)
  const flags = Array.from({ length: 32 }, (_, bit) => bit).filter(bit => (mask >>> bit) & 1)
  return <p>Quality flags · {cube.epochs[epoch].label ?? cube.epochs[epoch].date} · {flags.length
    ? flags.map(bit => cube.flagNames?.[bit] ?? `Bit ${bit}`).join(', ')
    : 'No bits set'} · 0x{mask.toString(16).padStart(8, '0')}</p>
}

function PixelChart({ samples, axis, unit }: {
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
      <circle cx={points[activeIndex][0]} cy={points[activeIndex][1]} r="4" fill="currentColor" />
    </svg>
    {samples.length > 1 && <input type="range" aria-label={`${axis} sample`} min="0" max={samples.length - 1}
      value={activeIndex} onChange={event => setIndex(Number(event.target.value))} />}
    <figcaption>{active.label} · {active.value.toPrecision(4)} {unit} · {samples.length} samples</figcaption>
  </figure>
}
