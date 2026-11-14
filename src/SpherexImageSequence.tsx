import { useEffect, useRef, useState } from 'react'

const directory = '/data/barnards-star/spherex-images/'
const size = 840
type Frame = { image: string; detector: number; date: string; source: string; star: [number, number] }
type LoadedFrame = Frame & { imageElement: HTMLImageElement }

function loadFrame(frame: Frame): Promise<LoadedFrame> {
  const imageElement = new Image()
  imageElement.src = directory + frame.image
  return imageElement.decode().then(() => ({ ...frame, imageElement }))
}

export function SpherexImageSequence() {
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
  const baseline = frames[reference]

  useEffect(() => {
    const controller = new AbortController()
    fetch(directory + 'frames.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Manifest unavailable')
        return response.json()
      })
      .then(setManifest)
      .catch(() => { if (!controller.signal.aborted) setError('Could not load the SPHEREx archive index.') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!manifest.length) return
    let active = true
    Promise.all(manifest.filter(item => item.detector === detector).map(loadFrame))
      .then(items => { if (active) setFrames(items) })
      .catch(() => { if (active) setError('Could not load this detector’s images. Choose another detector or reload.') })
    return () => { active = false }
  }, [detector, manifest])

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
  }, [current, baseline, difference, zoom])

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
        {[1, 2, 3, 4, 5, 6].map(id => <option key={id} value={id}>Detector {id}</option>)}
      </select></label>
      <label>Field width <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        <option value={1}>1.45°</option><option value={2}>43′</option><option value={4}>22′</option><option value={8}>11′</option>
      </select></label>
      <button type="button" aria-pressed={!difference} onClick={() => setDifference(false)}>Blink</button>
      <button type="button" aria-pressed={difference} disabled={!frames.length} onClick={() => {
        setPlaying(false)
        if (frame === reference) setFrame((frame + 1) % frames.length)
        setDifference(true)
      }}>Difference</button>
      <label><input type="checkbox" checked={marker} onChange={event => setMarker(event.target.checked)} /> Mark Barnard’s Star</label>
    </div>
    <div className="wise-sequence-frame spherex-sequence-frame">
      {!current && <p role="status">{error || 'Loading SPHEREx images…'}</p>}
      {current && <canvas ref={canvas} width={size} height={size} role="img"
        aria-label={difference ? 'Difference between two aligned SPHEREx images' : 'SPHEREx image of the field around Barnard’s Star'} />}
      {current && marker && <span className="spherex-star-marker" style={{
        left: (50 + ((current.star[0] + .5) / size - .5) * zoom) + '%',
        top: (50 + ((current.star[1] + .5) / size - .5) * zoom) + '%',
      }}><span>Barnard’s Star</span></span>}
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
    {difference
      ? <p>Cyan shows brighter pixels in the comparison image and red shows brighter pixels in the reference. This view subtracts display brightness. Saturation, wavelength and exposure differences can also leave residuals.</p>
      : <p>Press Play to blink through the three dates. At 1.45° the shift is barely visible. Use the 11′ field to compare the marked star against its neighbors. The ring follows the position predicted from Gaia DR3.</p>}
    {current && <p>NASA / JPL-Caltech / SPHEREx, via NASA/IPAC IRSA · <a href={current.source}>Original FITS observation</a></p>}
  </div>
}
