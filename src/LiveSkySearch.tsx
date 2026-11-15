import { useEffect, useRef, useState } from 'react'
import { Studio } from './Studio'
import { validateCube, type Coordinates, type Cube } from './studio-data'

export type Footprint = [number, number][]
type Product = { id: string; date: string; mjd: number; detector: number; source: string }
type Visit = { date: string; candidates: Product[] }
type Inventory = { count: number; detector: number; visits: Visit[]; truncated: boolean; notice?: string }
type SkyResult = {
  cube: Cube
  coords: Coordinates
  footprint: Footprint
  matchedWavelengths: boolean
  images: { date: string; id: string; source: string; coverage: number;
    fitsMetadata: { wavelength: number | null; detector: string | null } }[]
  failures: { source: string; error: string }[]
}

function SkyThumbnail({ plane, low, high, selected, onClick, date }: {
  plane: ArrayLike<number | null>; low: number; high: number; selected: boolean; onClick: () => void; date: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const size = Math.sqrt(plane.length)
    const image = context.createImageData(size, size)
    for (let i = 0; i < plane.length; i++) {
      const value = plane[i]
      const intensity = value == null ? 0 : Math.round(255 * Math.asinh(12 * Math.max(0, Math.min(1, (value - low) / (high - low)))) / Math.asinh(12))
      image.data.set(value == null ? [8, 16, 27, 255] : [intensity, intensity, intensity, 255], i * 4)
    }
    context.putImageData(image, 0, 0)
  }, [plane, low, high])
  return <button className="live-thumbnail" aria-pressed={selected} onClick={onClick} aria-label={`Inspect observation from ${date}`}>
    <canvas ref={canvas} width={Math.sqrt(plane.length)} height={Math.sqrt(plane.length)} />
    <span>{date}</span>
  </button>
}

export function LiveSkySearch({ coords, onFootprint }: { coords: Coordinates; onFootprint: (footprint: Footprint | null) => void }) {
  const [detector, setDetector] = useState(2)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Searching NASA/IPAC IRSA…')
  const [error, setError] = useState('')
  const [inventory, setInventory] = useState<Inventory>()
  const [result, setResult] = useState<SkyResult>()
  const [busy, setBusy] = useState(true)
  const [selected, setSelected] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState<'all' | 'single'>('all')
  const cancel = useRef<() => void>(() => {})

  useEffect(() => {
    const controller = new AbortController()
    let worker: Worker | undefined
    let active = true
    setBusy(true); setError(''); setResult(undefined); setInventory(undefined)
    setSelected(0); setView('all'); onFootprint(null)
    setStatus('Searching NASA/IPAC IRSA for observations covering this position…')
    function stop() { active = false; controller.abort(); worker?.terminate() }
    cancel.current = () => { stop(); setBusy(false); setStatus('Search canceled. Select Retry to start again.') }
    async function search() {
      try {
        const params = new URLSearchParams({ ra: String(coords.ra), dec: String(coords.dec), detector: String(detector) })
        const response = await fetch(`/api/sky-observations?${params}`, { signal: controller.signal })
        if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('The live archive API is unavailable. Please open the deployed website or retry.')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'The archive search failed.')
        if (!active) return
        setInventory(data)
        if (!data.visits.length) {
          setBusy(false)
          setStatus('No published spectral images were found for this infrared view at these coordinates. Try another detector below.')
          return
        }
        setStatus(`Found ${data.count} exposures. Preparing ${data.visits.length} separated visits…`)
        worker = new Worker('/data/sky-worker.mjs', { type: 'module' })
        worker.onerror = () => {
          if (!active) return
          setStatus('Image preparation stopped.'); setError('The FITS processor could not start. Please retry.'); setBusy(false); worker?.terminate()
        }
        worker.onmessage = ({ data }) => {
          if (!active) return
          if (data.progress) setStatus(data.progress)
          else if (data.error) { setStatus('Image preparation stopped.'); setError(data.error); setBusy(false); worker?.terminate() }
          else if (data.result) {
            try {
              const ready = { ...data.result, cube: validateCube(data.result.cube) } as SkyResult
              setResult(ready); onFootprint(ready.footprint)
              setStatus(`${ready.images.length} verified ${ready.images.length === 1 ? 'observation' : 'observations'} ready.`)
            } catch { setError('The prepared observations could not be read. Please retry.') }
            setBusy(false); worker?.terminate()
          }
        }
        worker.postMessage({ visits: data.visits, coords })
      } catch (error) {
        if (!active) return
        setStatus('Search could not complete.'); setError(error instanceof Error ? error.message : 'The archive search failed.'); setBusy(false)
      }
    }
    void search()
    return stop
  }, [coords.ra, coords.dec, detector, attempt, onFootprint])

  const samples = result?.cube.epochs.flatMap(epoch => Array.from(epoch.planes[0]).filter((value): value is number => value !== null && Number.isFinite(value))).sort((a, b) => a - b) ?? []
  const low = samples[Math.floor(samples.length * .02)] ?? 0
  const high = Math.max(low + 1e-8, samples[Math.floor(samples.length * .995)] ?? 1)
  const archive = `https://irsa.ipac.caltech.edu/applications/spherex/?api=spectral-images&worldPt=${coords.ra};${coords.dec};EQ_J2000`

  return <div className="live-sky-search">
    <p>Live SPHEREx observations at RA {coords.ra.toFixed(6)}°, Dec {coords.dec.toFixed(6)}° · ICRS</p>
    <div className="live-search-actions">
      <label>Infrared view<select value={detector} onChange={event => setDetector(Number(event.target.value))}>
        {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>Detector {value}{value === 2 ? ' · default' : ''}</option>)}
      </select></label>
      {busy ? <button onClick={() => cancel.current()}>Cancel</button>
        : <button onClick={() => setAttempt(value => value + 1)}>{result ? 'Refresh observations' : 'Retry'}</button>}
      <a href={archive} target="_blank" rel="noreferrer">Check this position at IRSA ↗</a>
    </div>
    <p role="status" aria-live="polite">{status}</p>
    {busy && <progress aria-label="Loading sky observations" />}
    {error && <p className="error" role="alert">{error}</p>}
    {inventory?.notice && <p role="note">{inventory.notice}</p>}
    {inventory?.truncated && <p>The archive reached its result limit. The dates below cover the returned observations.</p>}
    {result && <>
      {result.images.length < 3 && <p>{result.images.length} usable separated {result.images.length === 1 ? 'visit was' : 'visits were'} retrieved. Three visits could not be verified in this search.</p>}
      <div className="live-thumbnails">
        {result.images.map((item, index) => <div key={item.id}>
          <SkyThumbnail plane={result.cube.epochs[index].planes[0]} low={low} high={high} date={item.date.slice(0, 10)}
            selected={view === 'single' && selected === index} onClick={() => { setSelected(index); setView('single') }} />
          <p>{item.fitsMetadata.wavelength == null ? 'Wavelength unavailable' : `${item.fitsMetadata.wavelength.toFixed(3)} µm`}
            {' · '}{Math.round(item.coverage * 100)}% usable field</p>
          <a href={`${item.source}?center=${coords.ra},${coords.dec}&size=0.15`} target="_blank" rel="noreferrer">Original FITS cutout ↗</a>
        </div>)}
      </div>
      <div className="live-search-actions">
        <button className="primary" aria-pressed={view === 'all'} onClick={() => setView('all')}>Compare all visits</button>
        <span>North up · east left · 6.1′ field · common brightness scale</span>
      </div>
      <Studio key={`${attempt}:${detector}:${view}:${selected}`} cube={view === 'all' ? result.cube : { ...result.cube, epochs: [result.cube.epochs[selected]] }}
        target="Live SPHEREx sky field" coords={coords} zoom={zoom} onZoom={setZoom} local />
      <p>FITS sky coordinates and observation dates were checked against this search. The outline in Aladin marks the displayed field.</p>
      {result.failures.length > 0 && <details><summary>{result.failures.length} exposures could not be used</summary>
        {result.failures.map((failure, index) => <p key={index}>{failure.error} <a href={failure.source}>Archive file ↗</a></p>)}
      </details>}
    </>}
  </div>
}
