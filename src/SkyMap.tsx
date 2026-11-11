import { useEffect, useRef, useState } from 'react'
import type { Coordinates } from './studio-data'

type Atlas = {
  gotoRaDec: (ra: number, dec: number) => void
  getRaDec: () => [number, number]
}

type AladinApi = {
  init: Promise<void>
  aladin: (element: HTMLElement, options: {
    survey: string
    fov: number
    cooFrame: string
    showCooGridControl: boolean
  }) => Atlas
}

let loading: Promise<AladinApi> | undefined

const atlasModuleUrl = 'https://cdn.jsdelivr.net/npm/aladin-lite@3/dist/aladin.js'

function loadAladin() {
  loading ??= new Promise<AladinApi>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Sky map request timed out')), 20000)
    import(/* @vite-ignore */ atlasModuleUrl).then(async ({ default: api }: { default: AladinApi }) => {
      await api.init
      resolve(api)
    }).catch(reject).finally(() => window.clearTimeout(timeout))
  }).catch(error => {
    loading = undefined
    throw error
  })
  return loading
}

export function SkyMap({ coords, onSearch }: {
  coords: Coordinates
  onSearch: (coords: Coordinates) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const atlas = useRef<Atlas | null>(null)
  const [started, setStarted] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!started) return
    let active = true
    loadAladin().then(api => {
      if (!active || !container.current) return
      atlas.current = api.aladin(container.current, {
        survey: 'P/DSS2/color',
        fov: 0.5,
        cooFrame: 'ICRSd',
        showCooGridControl: true,
      })
      setStatus('ready')
    }).catch(() => {
      if (active) setStatus('error')
    })
    return () => { active = false }
  }, [attempt, started])

  const { ra, dec } = coords
  useEffect(() => {
    if (status === 'ready') atlas.current?.gotoRaDec(ra, dec)
  }, [status, ra, dec])

  return <section className="panel sky-map" aria-labelledby="sky-map-title">
    <div className="viewer-head">
      <h2 id="sky-map-title">Aladin Lite sky map</h2>
      {!started && <button onClick={() => setStarted(true)}>Open sky map</button>}
    </div>
    <p>DSS optical reference imagery via CDS. Pan or zoom, then search the observation catalog at the map center.</p>
    {started && <>
      <div ref={container} className="aladin-map" hidden={status === 'error'} aria-label="Interactive sky map" />
      {status === 'loading' && <p role="status">Loading sky map…</p>}
      {status === 'error' && <p role="status">The embedded sky map could not load. <button onClick={() => {
        container.current?.replaceChildren()
        setStatus('loading')
        setAttempt(value => value + 1)
      }}>Retry</button></p>}
      {status === 'ready' && <div className="sky-map-actions">
        <button onClick={() => {
          const center = atlas.current?.getRaDec()
          if (!center?.every(Number.isFinite)) return
          onSearch({ ra: ((center[0] % 360) + 360) % 360, dec: center[1] })
        }}>Search map center</button>
        <button onClick={() => atlas.current?.gotoRaDec(ra, dec)}>Return to target</button>
      </div>}
      <p><a href="https://aladin.cds.unistra.fr/AladinLite/" target="_blank" rel="noreferrer">Open Aladin Lite at CDS ↗</a></p>
    </>}
  </section>
}
