import { useEffect, useRef, useState } from 'react'

type Frame = { image: string; detector: number; date: string; source: string; original?: string; star?: [number, number] }
type LoadedFrame = Frame & { imageElement: HTMLImageElement }

function loadFrame(directory: string, frame: Frame): Promise<LoadedFrame> {
  const imageElement = new Image()
  imageElement.src = directory + frame.image
  return imageElement.decode().then(() => ({ ...frame, imageElement }))
}

function RwAurigaeMotion() {
  const [year, setYear] = useState(2026)
  // Gaia DR3 source 156430822114424576. RA motion includes cos(dec).
  const elapsed = year - 2016
  const east = 2.640643 * elapsed
  const south = 27.397583 * elapsed
  const distance = Math.hypot(east, south)

  return <details className="rw-motion">
    <summary>RW Aurigae A proper motion · Gaia DR3</summary>
    <div className="rw-motion-plot" role="img" aria-label={`Projected motion in ${year}: ${east.toFixed(1)} milliarcseconds east and ${south.toFixed(1)} milliarcseconds south of 2016`}>
      <span className="rw-motion-origin" style={{ left: '50%', top: '14%' }} />
      <span className="rw-motion-point" style={{ left: `calc(50% - ${east * .24}px)`, top: `calc(14% + ${south * .24}px)` }} />
    </div>
    <label>Year {year} <input type="range" min={2016} max={2036} value={year}
      onChange={event => setYear(Number(event.target.value))} /></label>
    <p>Projected shift since 2016 · {distance.toFixed(1)} mas. The hollow circle marks 2016. North is up and east is left. This magnified view uses the measured proper motion. <a href="https://gea.esac.esa.int/archive/">Gaia DR3</a></p>
  </details>
}

export function SpherexImageSequence({ directory, target, overlayDirectory, hideMarker = false, gaiaOverlay = false, wiseOverlay = false }: { directory: string; target: string; overlayDirectory?: string; hideMarker?: boolean; gaiaOverlay?: boolean; wiseOverlay?: boolean }) {
  const [gaiaSources, setGaiaSources] = useState<[number, number, number][]>([])
  const [wiseImage, setWiseImage] = useState<HTMLImageElement>()
  const [gaiaError, setGaiaError] = useState(false)
  const [wiseError, setWiseError] = useState(false)
  const [manifest, setManifest] = useState<Frame[]>([])
  const [frames, setFrames] = useState<LoadedFrame[]>([])
  const [error, setError] = useState('')
  const [detector, setDetector] = useState(1)
  const [frame, setFrame] = useState(0)
  const [reference, setReference] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [difference, setDifference] = useState(false)
  const [marker, setMarker] = useState(true)
  const [zoom, setZoom] = useState(1)
  const canvas = useRef<HTMLCanvasElement>(null)
  const current = frames[frame]
  const markerPosition = hideMarker ? undefined : current?.star
  const baseline = frames[reference]
  const size = current?.imageElement.naturalWidth ?? 840

  useEffect(() => {
    if (!overlayDirectory || !gaiaOverlay || gaiaSources.length) return
    const controller = new AbortController()
    setGaiaError(false)
    fetch(overlayDirectory + 'gaia-overlay.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Gaia catalog unavailable')
        return response.json()
      })
      .then(setGaiaSources)
      .catch(() => { if (!controller.signal.aborted) setGaiaError(true) })
    return () => controller.abort()
  }, [overlayDirectory, gaiaOverlay, gaiaSources.length])

  useEffect(() => {
    if (!overlayDirectory || !wiseOverlay || wiseImage) return
    let active = true
    setWiseError(false)
    const image = new Image()
    image.src = overlayDirectory + 'allwise-w2.webp'
    image.decode().then(() => { if (active) setWiseImage(image) })
      .catch(() => { if (active) setWiseError(true) })
    return () => { active = false }
  }, [overlayDirectory, wiseOverlay, wiseImage])

  useEffect(() => {
    const controller = new AbortController()
    fetch(directory + 'frames.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Manifest unavailable')
        return response.json()
      })
      .then((items: Frame[]) => {
        setDetector(items[0].detector)
        setManifest(items)
      })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load the SPHEREx archive index.') })
    return () => controller.abort()
  }, [directory])

  useEffect(() => {
    if (!manifest.length) return
    let active = true
    Promise.all(manifest.filter(item => item.detector === detector).map(item => loadFrame(directory, item)))
      .then(items => { if (active) setFrames(items) })
      .catch(() => { if (active) setError('Could not load this detector’s images. Choose another detector or reload.') })
    return () => { active = false }
  }, [detector, directory, manifest])

  useEffect(() => {
    if (!playing || !frames.length) return
    const timer = window.setInterval(() => setFrame(index => (index + 1) % frames.length), 750)
    return () => window.clearInterval(timer)
  }, [playing, frames.length])

  useEffect(() => {
    const context = canvas.current?.getContext('2d', { willReadFrequently: true })
    if (!context || !current || !baseline) return
    const width = size / zoom
    const inset = (size - width) / 2
    const draw = (image: HTMLImageElement) => {
      context.drawImage(image, inset, inset, width, width, 0, 0, size, size)
    }
    if (difference) {
      draw(baseline.imageElement)
      const before = context.getImageData(0, 0, size, size)
      draw(current.imageElement)
      const after = context.getImageData(0, 0, size, size)
      for (let i = 0; i < after.data.length; i += 4) {
        const change = after.data[i] - before.data[i]
        after.data[i] = 20 + Math.max(0, -change) * 2
        after.data[i + 1] = 20 + Math.max(0, change) * 2
        after.data[i + 2] = 24 + Math.max(0, change) * 2
      }
      context.putImageData(after, 0, 0)
    } else {
      draw(current.imageElement)
    }
    if (wiseOverlay && wiseImage) {
      const offset = (wiseImage.naturalWidth - width) / 2
      context.globalAlpha = 0.55
      context.drawImage(wiseImage, offset, offset, width, width, 0, 0, size, size)
      context.globalAlpha = 1
    }
    if (gaiaOverlay) {
      context.strokeStyle = '#5de5ff'
      context.lineWidth = size / 650
      context.beginPath()
      for (const [east, south, magnitude] of gaiaSources) {
        const x = size / 2 + east * zoom
        const y = size / 2 + south * zoom
        if (x < 0 || x > size || y < 0 || y > size) continue
        const radius = Math.max(1.5, (16 - magnitude) / 2)
        context.moveTo(x + radius, y)
        context.arc(x, y, radius, 0, 2 * Math.PI)
      }
      context.stroke()
    }
  }, [current, baseline, difference, zoom, size, gaiaOverlay, gaiaSources, wiseOverlay, wiseImage])

  return <div className="wise-sequence">
    <div className="dataset-controls studio-modes">
      <label>Detector <select value={detector} onChange={event => {
        setPlaying(false)
        setFrames([])
        setFrame(0)
        setReference(0)
        setError('')
        setDetector(Number(event.target.value))
      }}>
        {[...new Set(manifest.map(item => item.detector))].map(id => <option key={id} value={id}>Detector {id}</option>)}
      </select></label>
      <label>Field width <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        {[1, 2, 4, 8].map(factor => <option key={factor} value={factor}>
          {Math.round(size * 6.2 / 60 / factor)}′
        </option>)}
      </select></label>
      <button type="button" aria-pressed={!difference} onClick={() => setDifference(false)}>Blink</button>
      <button type="button" aria-pressed={difference} disabled={!frames.length} onClick={() => {
        setPlaying(false)
        if (frame === reference) setFrame((frame + 1) % frames.length)
        setDifference(true)
      }}>Difference</button>
      {markerPosition && <label><input type="checkbox" checked={marker} onChange={event => setMarker(event.target.checked)} /> Mark {target}</label>}
    </div>
    <div className="wise-sequence-frame spherex-sequence-frame">
      {!current && <p role="status">{error || 'Loading SPHEREx images…'}</p>}
      {current && <canvas ref={canvas} width={size} height={size} role="img"
        aria-label={difference ? 'Difference between two aligned SPHEREx images' : `SPHEREx image of the field around ${target}`} />}
      {markerPosition && marker && <span className="spherex-star-marker" style={{
        left: (50 + ((markerPosition[0] + .5) / size - .5) * zoom) + '%',
        top: (50 + ((markerPosition[1] + .5) / size - .5) * zoom) + '%',
      }}><span>{target}</span></span>}
    </div>
    <div className="studio-playback">
      <button type="button" className="primary" disabled={!current || difference} onClick={() => setPlaying(value => !value)}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <label>{difference ? 'Compare with' : 'Observation'} <select value={frame} disabled={!current} onChange={event => {
        setPlaying(false)
        setFrame(Number(event.target.value))
      }}>
        {frames.map((item, index) => <option key={item.image} value={index}>{item.date.slice(0, 10)}</option>)}
      </select></label>
      {difference && <label>Reference <select value={reference} onChange={event => setReference(Number(event.target.value))}>
        {frames.map((item, index) => <option key={item.image} value={index}>{item.date.slice(0, 10)}</option>)}
      </select></label>}
    </div>
    {target === "RW Aurigae" && <>
      <p>Blink compares the observed brightness and appearance across visits. The expected motion over these dates is less than 0.005 SPHEREx pixels.</p>
      <RwAurigaeMotion />
    </>}
    {gaiaOverlay && <p role="status">{gaiaError ? 'Gaia DR3 could not load. Toggle Gaia to retry.' : gaiaSources.length ? 'Cyan circles show Gaia DR3 catalog sources at their published positions.' : 'Loading Gaia DR3 sources…'}</p>}
    {wiseOverlay && <p role="status">{wiseError ? 'WISE could not load. Toggle WISE to retry.' : wiseImage ? 'AllWISE W2 (4.6 µm) image blended over the SPHEREx view. NASA/IPAC, via CDS.' : 'Loading AllWISE W2…'}</p>}
    {difference
      ? <p>Cyan shows brighter pixels in the comparison image and red shows brighter pixels in the reference. This view subtracts display brightness. Saturation, wavelength and exposure differences can also leave residuals.</p>
      : <p>Press Play to blink through the observation dates. {markerPosition && target === "Barnard’s Star" && "Use a narrower field to compare the marked star against its neighbors. The ring follows the position predicted from Gaia DR3."}</p>}
    {current && <p>NASA / JPL-Caltech / SPHEREx, via NASA/IPAC IRSA · <a href={current.source}>Original FITS observation</a>{current.original && <> · <a href={directory + current.original}>Full detector image</a></>}</p>}
  </div>
}
