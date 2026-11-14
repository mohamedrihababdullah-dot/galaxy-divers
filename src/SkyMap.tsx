import { useEffect, useRef, useState } from 'react'
import type { Coordinates } from './studio-data'

type Atlas = {
  gotoRaDec: (ra: number, dec: number) => void
  getRaDec: () => [number, number]
  setFoV: (degrees: number) => void
  getFov: () => [number, number]
  addCatalog: (catalog: Catalog) => void
  removeOverlay: (catalog: Catalog) => void
}
type Catalog = { hide: () => void }

const catalogs = {
  gaia: { id: 'I/355/gaiadr3', name: 'Gaia DR3', color: '#5de5ff' },
  wise: { id: 'II/328/allwise', name: 'AllWISE', color: '#ffb859' },
}
type CatalogKey = keyof typeof catalogs

type AladinApi = {
  init: Promise<void>
  aladin: (element: HTMLElement, options: {
    survey: string
    fov: number
    cooFrame: string
    showCooGridControl: boolean
  }) => Atlas
  catalogFromVizieR: (id: string, target: Coordinates, radius: number,
    options: { name: string; color: string; sourceSize: number; limit: number; onClick: string },
    callback: (sources: unknown[]) => void, onError: () => void) => Catalog
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
  const api = useRef<AladinApi | null>(null)
  const layers = useRef<Partial<Record<CatalogKey, Catalog>>>({})
  const [messages, setMessages] = useState<Partial<Record<CatalogKey, string>>>({})
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    loadAladin().then(aladin => {
      if (!active || !container.current) return
      api.current = aladin
      atlas.current = aladin.aladin(container.current, {
        survey: 'https://skies.esac.esa.int/DSSColor/',
        fov: 0.5,
        cooFrame: 'ICRSd',
        showCooGridControl: true,
      })
      setStatus('ready')
    }).catch(() => {
      if (active) setStatus('error')
    })
    return () => { active = false }
  }, [attempt])

  const { ra, dec } = coords
  useEffect(() => {
    if (status !== 'ready') return
    atlas.current?.gotoRaDec(ra, dec)
    for (const layer of Object.values(layers.current)) {
      layer.hide()
      atlas.current?.removeOverlay(layer)
    }
    layers.current = {}
    setMessages({})
  }, [status, ra, dec])

  function toggleCatalog(key: CatalogKey) {
    const view = atlas.current
    if (!view || !api.current) return
    const existing = layers.current[key]
    if (existing) {
      existing.hide()
      view.removeOverlay(existing)
      delete layers.current[key]
      setMessages(value => ({ ...value, [key]: undefined }))
      return
    }
    const { id, name, color } = catalogs[key]
    const radius = Math.min(0.5, Math.hypot(...view.getFov()) / 2)
    const [ra, dec] = view.getRaDec()
    setMessages(value => ({ ...value, [key]: `Loading ${name}…` }))
    const catalog = api.current.catalogFromVizieR(id, { ra, dec }, radius,
      { name, color, sourceSize: 9, limit: 500, onClick: 'showTable' }, sources => {
        if (layers.current[key] !== catalog) return
        setMessages(value => ({ ...value, [key]: `${name} · ${sources.length} sources within ${(radius * 60).toFixed(1)}′` }))
      }, () => {
        if (layers.current[key] === catalog) setMessages(value => ({ ...value, [key]: `${name} could not load. Toggle the layer to retry.` }))
      })
    layers.current[key] = catalog
    view.addCatalog(catalog)
    window.setTimeout(() => {
      if (layers.current[key] !== catalog) return
      setMessages(value => value[key] === `Loading ${name}…`
        ? { ...value, [key]: `${name} is taking longer than expected. Toggle the layer to retry.` } : value)
    }, 15000)
  }

  return <section className="panel sky-map" aria-labelledby="sky-map-title">
    <div className="viewer-head">
      <h2 id="sky-map-title">Aladin Lite sky map</h2>
    </div>
    <p>DSS optical imagery with optional Gaia DR3 and AllWISE source markers. Load overlays after choosing a map field. Catalog positions are shown at their published coordinates.</p>
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
        <label>Set map field
          <select defaultValue="" onChange={event => {
            if (event.target.value) atlas.current?.setFoV(Number(event.target.value) / 60)
            event.target.value = ''
          }}>
            <option value="" disabled>Choose width</option>
            {[3, 10, 30, 60].map(width => <option key={width} value={width}>{width}′</option>)}
          </select>
        </label>
        {(Object.keys(catalogs) as CatalogKey[]).map(key =>
          <button key={key} aria-pressed={!!messages[key]} onClick={() => toggleCatalog(key)}>{catalogs[key].name}</button>)}
        {Object.entries(messages).filter(([, value]) => value).map(([key, value]) => <span key={key} role="status">{value}</span>)}
      </div>}
      <p><a href="https://aladin.cds.unistra.fr/AladinLite/" target="_blank" rel="noreferrer">Open Aladin Lite at CDS ↗</a></p>
  </section>
}
