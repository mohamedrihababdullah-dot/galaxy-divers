import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import { ObservationStudio, Studio } from './Studio'
import { SkyMap } from './SkyMap'
import { SkyGuide } from './SkyGuide'
import { ObservationUpload, saveObservation, type UploadedObservation } from './ObservationUpload'
import { demoCube, parseCoordinates } from './studio-data'

type Frame = { image: string; observedAt: string; wavelength: string; source: string }
type Sequence = { target: string; ra: number; dec: number; frames: Frame[]; cube?: string }

const targets = ['Barnard’s Star', 'Epsilon Indi B', 'WISE 0855', 'RW Aurigae', 'R Draconis']
const demo = { ra: 133.795129, dec: -7.245147 }
const query = new URLSearchParams(location.search)

const presets = [
  { target: 'WISE 0855', ...demo },
  { target: 'Barnard’s Star', ...parseCoordinates('17h57m48.498s', '+4d41m36.114s')! },
  { target: 'RW Aurigae', ...parseCoordinates('05h07m49.566s', '+30d24m05.177s')! },
]

function App() {
  const [upload, setUpload] = useState<UploadedObservation | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [ra, setRa] = useState(query.get('ra') ?? String(demo.ra))
  const [dec, setDec] = useState(query.get('dec') ?? String(demo.dec))
  const [position, setPosition] = useState(() => parseCoordinates(query.get('ra') ?? '', query.get('dec') ?? ''))
  const [demoTarget, setDemoTarget] = useState(() => presets.find(item => item.target === query.get('demo'))?.target ?? (query.has('ra') || query.has('dec') ? '' : presets[0].target))
  const [zoom, setZoom] = useState(() => /^[1-5]$/.test(query.get('zoom') ?? '') ? Number(query.get('zoom')) : 1)
  const [viewKey, setViewKey] = useState(0)
  const demoData = useMemo(() => demoTarget ? demoCube(demoTarget) : null, [demoTarget])
  const demoPreset = presets.find(item => item.target === demoTarget) ?? presets[0]
  const [error, setError] = useState('')
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const sequence = position && sequences.find((item) =>
    Math.abs(item.ra - position.ra) < 0.000001 && Math.abs(item.dec - position.dec) < 0.000001)
  const frames = sequence ? [...sequence.frames].sort((a, b) =>
    Date.parse(a.observedAt) - Date.parse(b.observedAt)) : []
  const count = frames.length
  const current = frames[frame]

  useEffect(() => {
    if (query.has('ra') || query.has('dec') || location.hash === '#explorer') {
      document.getElementById('explorer')?.scrollIntoView({ behavior: 'instant' })
    }
    fetch('/data/manifest.json')
      .then((response) => {
        if (!response.ok) throw new Error('Manifest unavailable')
        return response.json() as Promise<{ sequences: Sequence[] }>
      })
      .then(({ sequences }) => {
        if (!Array.isArray(sequences)) throw new Error('Invalid manifest')
        setSequences(sequences)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [])

  useEffect(() => {
    if (!playing || count < 2) return
    const timer = window.setInterval(() => setFrame((index) => (index + 1) % count), 650)
    return () => window.clearInterval(timer)
  }, [playing, count])

  function select(coords: typeof demo, target = '', mode?: 'blink' | 'difference') {
    setUpload(null)
    setDemoTarget(target)
    setViewKey(value => value + 1)
    setPosition(coords)
    setFrame(0)
    setPlaying(false)
    setError('')
    const url = new URL(location.href)
    url.search = new URLSearchParams({
      ra: String(coords.ra), dec: String(coords.dec), zoom: String(zoom), ...(target ? { demo: target } : {}),
    }).toString()
    if (mode) url.searchParams.set('mode', mode)
    url.hash = 'explorer'
    setRa(String(coords.ra))
    setDec(String(coords.dec))
    history.replaceState(null, '', url)
  }

  function changeZoom(value: number) {
    setZoom(value)
    if (upload) return
    const url = new URL(location.href)
    url.searchParams.set('zoom', String(value))
    history.replaceState(null, '', url)

  }

  return <>
    <header className="site-header">
      <a className="brand" href="#home">
        <span className="galaxy-mark" aria-hidden="true"><i /><i /><i /></span>
        <span className="brand-copy"><strong>Galaxy Divers</strong><small>Dive into · Discover · Explore</small></span>
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="nav-home" href="#home"><span aria-hidden="true">⌂</span> Home</a>
        <a href="#explorer"><span aria-hidden="true">♄</span> Explore</a>
        <a href="#spherex"><span aria-hidden="true">✧</span> SPHEREx</a>
        <a href="#planet-x"><span aria-hidden="true">ⓘ</span> Planet X</a>
        <a href="#about"><span aria-hidden="true">ⓘ</span> About</a>
      </nav>
      <a className="header-link" href="#explorer"><span aria-hidden="true">✦</span> Explore the Unknown</a>
    </header>
    <main id="home">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-art" aria-hidden="true">
          <div className="dive-trail" />
          <img className="diver" src="/hero/diver-pointing.png" alt="" fetchPriority="high" />
        </div>
        <a className="planet-label" href="#planet-x">Planet X <small>Hypothetical</small></a>
        <div className="hero-content">
          <p className="hero-kicker">Planet X &amp; SPHEREx</p>
          <h1 id="hero-title">Dive into the<br />unseen sky.</h1>
          <p>Explore the infrared sky and see how it changes over time with Galaxy Divers.</p>
          <a className="hero-action" href="#sky-guide"><span aria-hidden="true">▷</span> Spot what moves</a>
        </div>
      </section>
      <SkyGuide onDemo={target => {
        const preset = presets.find(item => item.target === target)
        if (!preset) return
        select(preset, target, target === 'WISE 0855' ? 'blink' : 'difference')
        requestAnimationFrame(() => document.getElementById('observation-viewer')?.scrollIntoView({ block: 'start' }))
      }} />
      <section id="explorer" className="explorer" aria-labelledby="explorer-title">
      <h2 id="explorer-title">SPHEREx Blink &amp; Shift Studio</h2>
      <p className="intro">Compare the same patch of infrared sky across observations.</p>
      <ObservationUpload onLoad={data => {
        select(data.coords)
        setZoom(1)
        setUpload(data)
        requestAnimationFrame(() => document.getElementById('observation-viewer')?.scrollIntoView({ block: 'start' }))
      }} />
      <div className="layout">
        <aside className="panel">
          <h2>Sky coordinates</h2>
          <form onSubmit={(event) => {
            event.preventDefault()
            const coords = parseCoordinates(ra, dec)
            if (!coords) {
              setError('Enter decimal degrees or coordinates like 08h55m and −7d14m.')
              return
            }
            select(coords)
          }}>
            <label>Right ascension (°)<input value={ra} onChange={(e) => setRa(e.target.value)} /></label>
            <label>Declination (°)<input value={dec} onChange={(e) => setDec(e.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit">Find observations</button>
          </form>
          <h2 className="targets">Challenge targets</h2>
          <label className="target-select">Quick-select target
            <select value={demoTarget || sequence && sequence.target || ''} onChange={event => {
              const target = event.target.value
              const available = sequences.find(item => item.target === target && (item.cube || item.frames.length))
              const preset = presets.find(item => item.target === target)
              if (available) select(available)
              else if (preset) select(preset, target)
            }}>
              <option value="" disabled>Choose a target</option>
              {targets.map(target => {
                const ready = sequences.some(item => item.target === target && (item.cube || item.frames.length))
                const hasDemo = presets.some(item => item.target === target)
                return <option key={target} value={target} disabled={!ready && !hasDemo}>
                  {target}{ready ? '' : hasDemo ? ' · simulated' : ' · awaiting data'}
                </option>
              })}
            </select>
          </label>
        </aside>
        <section id="observation-viewer" className="panel viewer" aria-label="Observation viewer">
          <div className="viewer-head">
            <h2>{upload?.target || demoTarget || (sequence ? sequence.target : 'Observation search')}</h2>
            {upload && <button onClick={() => saveObservation(upload)}>Save observation JSON</button>}
            {demoTarget && <span className="badge">Simulated data</span>}
            {!upload && !demoTarget && !sequence && <button onClick={() => select(presets[0], presets[0].target)}>Open demo</button>}
          </div>
          {upload ? <Studio key={viewKey} cube={upload.cube} target={upload.target} coords={upload.coords} zoom={zoom} onZoom={changeZoom} local />
            : demoData ? <Studio key={viewKey} cube={demoData} target={demoTarget} coords={demoPreset} zoom={zoom} onZoom={changeZoom} simulated />
            : sequence && sequence.cube ? <ObservationStudio key={viewKey} url={sequence.cube} target={sequence.target} coords={sequence} zoom={zoom} onZoom={changeZoom} />
            : <>
          <div className="sky">
            {current
              ? <img src={current.image} alt={`SPHEREx observation of ${sequence?.target ?? 'selected sky field'}`} />
              : <p role="status">{loadState === 'loading' ? 'Loading observations…'
                : loadState === 'error' ? 'Could not load the observation catalog. Reload to retry.'
                : 'No prepared observations at these coordinates. Live archive search is pending.'}</p>}
          </div>
          {count > 0 && <div className="playback">
            <button disabled={count < 2} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" aria-label="Observation frame" min="0" max={count - 1} value={frame}
              disabled={count < 2} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)) }} />
            <span>Frame {frame + 1} / {count}</span>
          </div>}
          <div className="details">
            {current && <><span>{current.observedAt} · {current.wavelength}</span>
                <a href={current.source}>Observation source</a></>}
          </div>
          </>}
        </section>
      </div>
      <SkyMap coords={position ?? demoPreset} onSearch={coords => select(coords)} />
      </section>
      <section className="mission-notes" aria-label="About the project">
        <div id="planet-x"><h2>Planet X</h2><p>Planet X is a hypothetical planet beyond Neptune. The red planet in the hero is an illustration.</p></div>
        <div id="about"><h2>About Galaxy Divers</h2><p>We’re building an infrared sky explorer for the NASA International Space Apps Challenge.</p></div>
      </section>
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
