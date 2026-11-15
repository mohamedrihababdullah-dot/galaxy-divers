import { useEffect, useRef, useState } from 'react'
import { PixelChart, PixelChartHeading } from './PixelChart'
import { validateCube, type Cube } from './studio-data'

export function TargetPixelGraphs({ url, target }: { url: string; target: string }) {
  const [cube, setCube] = useState<Cube>()
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Pixel observations unavailable')
      return response.json()
    }).then(validateCube).then(setCube).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [url])

  return <section className="panel target-pixel-graphs" aria-labelledby="target-pixel-title">
    <h2 id="target-pixel-title">Pixel graphs for {target}</h2>
    {cube ? <TargetSamples cube={cube} /> : <p role="status">{error ? 'Could not load pixel observations.' : 'Loading pixel observations…'}</p>}
  </section>
}

function startingSample({ width, height, epochs, bands }: Cube) {
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  let best = { x: centerX, y: centerY, band: 0, visit: 0 }
  let distance = Infinity
  for (let pixel = 0; pixel < width * height; pixel++) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const offset = (x - centerX) ** 2 + (y - centerY) ** 2
    if (offset >= distance) continue
    const band = bands.findIndex((_, index) => epochs.filter(epoch => epoch.planes[index][pixel] !== null).length >= 2)
    const visit = epochs.findIndex(epoch => epoch.planes.filter(plane => plane[pixel] !== null).length >= 2)
    if (band < 0 || visit < 0) continue
    best = { x, y, band, visit }
    distance = offset
  }
  return best
}

function TargetSamples({ cube }: { cube: Cube }) {
  const { bands, epochs, width, height, unit } = cube
  const [initial] = useState(() => startingSample(cube))
  const [point, setPoint] = useState({ x: initial.x, y: initial.y })
  const [band, setBand] = useState(initial.band)
  const [visit, setVisit] = useState(initial.visit)
  const canvas = useRef<HTMLCanvasElement>(null)
  const reference = epochs[0].planes[band]
  const referenceDate = (epochs[0].observations?.[band].date ?? epochs[0].date).slice(0, 10)
  const pixel = point.y * width + point.x
  const lightCurve = epochs.flatMap(epoch => {
    const value = epoch.planes[band][pixel]
    const observation = epoch.observations?.[band]
    const date = observation?.date ?? epoch.date
    return value === null ? [] : [{
      x: Date.parse(date), value, label: date.slice(0, 10) + (observation ? ` · ≈${observation.wavelength.toFixed(3)} µm` : ''),
    }]
  }).sort((a, b) => a.x - b.x)
  const spectrum = bands.flatMap((item, index) => {
    const epoch = epochs[visit]
    const value = epoch.planes[index][pixel]
    const observation = epoch.observations?.[index]
    const wavelength = observation?.wavelength ?? item.wavelength
    return value === null || wavelength === null ? [] : [{
      x: wavelength, value, label: `≈${wavelength.toFixed(3)} µm · Detector ${item.detector} · ${(observation?.date ?? epoch.date).slice(0, 10)}`,
    }]
  }).sort((a, b) => a.x - b.x)

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const samples = Array.from(reference).filter((value): value is number => value !== null).sort((a, b) => a - b)
    const low = samples[Math.floor(samples.length * .45)] ?? 0
    const high = samples[Math.floor(samples.length * .99)] ?? 1
    const image = context.createImageData(width, height)
    Array.from(reference).forEach((value, i) => {
      const shade = value === null ? 0 : 255 * Math.sqrt(Math.max(0, Math.min(1, (value - low) / (high - low || 1))))
      image.data.set([shade, shade, shade, 255], i * 4)
    })
    context.putImageData(image, 0, 0)
  }, [reference, width, height])

  function selectPixel(x: number, y: number) {
    setPoint({ x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) })
  }

  return <>
    <p>Choose a spot in the reference image to update both graphs. The square marks the pixel being measured.</p>
    <div className="target-pixel-layout">
      <figure className="pixel-reference">
        <div>
          <canvas ref={canvas} width={width} height={height} tabIndex={0}
            aria-label="Reference sky image. Click or use the arrow keys to select a pixel."
            onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect()
              selectPixel(Math.floor((event.clientX - rect.left) / rect.width * width),
                Math.floor((event.clientY - rect.top) / rect.height * height))
            }}
            onKeyDown={event => {
              const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
              const step = steps[event.key]
              if (!step) return
              event.preventDefault()
              selectPixel(point.x + step[0], point.y + step[1])
            }} />
          <span aria-hidden="true" style={{ left: `${(point.x + .5) / width * 100}%`, top: `${(point.y + .5) / height * 100}%` }} />
        </div>
        <figcaption>Selected pixel ({point.x + 1}, {point.y + 1}) · {referenceDate}
          {cube.pixelScaleArcsec ? ` · ${(width * cube.pixelScaleArcsec / 60).toFixed(1)}′ field` : ''}</figcaption>
        {(initial.x !== Math.floor(width / 2) || initial.y !== Math.floor(height / 2)) &&
          <p>The center pixel has too few usable readings. The graphs start at a nearby pixel.</p>}
      </figure>
      <div className="target-pixel-plots">
        <div>
          <PixelChartHeading kind="lightCurve" />
          <label>Detector<select value={band} onChange={event => setBand(Number(event.target.value))}>
            {bands.map((item, i) => <option key={i} value={i}>Detector {item.detector}</option>)}
          </select></label>
          <PixelChart samples={lightCurve} axis="Observation date" unit={unit} />
        </div>
        <div>
          <PixelChartHeading kind="spectrum" />
          <label>Observation period<select value={visit} onChange={event => setVisit(Number(event.target.value))}>
            {epochs.map((epoch, i) => {
              const dates = epoch.observations?.map(item => item.date.slice(0, 10)).sort() ?? [epoch.date.slice(0, 10)]
              return <option key={i} value={i}>{dates[0]} to {dates.at(-1)}</option>
            })}
          </select></label>
          <PixelChart samples={spectrum} axis="Wavelength (µm)" unit={unit} />
        </div>
      </div>
    </div>
    <p>Points show calibrated surface brightness at a fixed sky position using NASA/IPAC IRSA SPHEREx observations. Wavelengths are estimates at the field center. The spectrum can combine exposures from different dates, and the wavelength can vary between visits on the same detector.</p>
  </>
}
