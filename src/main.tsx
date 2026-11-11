import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type Frame = { image: string; observedAt: string; wavelength: string; source: string }
type Sequence = { target: string; ra: number; dec: number; frames: Frame[] }

const targets = ['Barnard’s Star', 'Epsilon Indi B', 'WISE 0855', 'RW Aurigae', 'R Draconis']
const demo = { ra: 133.795129, dec: -7.245147 }
const query = new URLSearchParams(location.search)

function DemoSky({ frame }: { frame: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const backdrop = ctx.createRadialGradient(420, 220, 30, 420, 220, 510)
    backdrop.addColorStop(0, '#15263a')
    backdrop.addColorStop(1, '#060a12')
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, 900, 480)
    let seed = 638
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < 440; i++) {
      ctx.fillStyle = `rgba(211,227,241,${0.12 + random() * 0.74})`
      const x = random() * 900
      const y = random() * 480
      const radius = 0.35 + random() ** 6 * 2.1
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#ffd78d'
    ctx.shadowBlur = 16
    ctx.shadowColor = '#fdb55f'
    ctx.beginPath()
    ctx.arc(412 + frame * 12, 253 - frame * 5, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }, [frame])
  return <canvas ref={canvas} width={900} height={480} role="img"
    aria-label={`Simulated sky, frame ${frame + 1}. A bright point moves across the fixed star field.`} />
}

function App() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [ra, setRa] = useState(query.get('ra') ?? String(demo.ra))
  const [dec, setDec] = useState(query.get('dec') ?? String(demo.dec))
  const [position, setPosition] = useState(() => {
    const initialRa = query.get('ra')
    const initialDec = query.get('dec')
    if (initialRa === null || initialDec === null || !initialRa.trim() || !initialDec.trim()) return null
    const coords = { ra: Number(initialRa), dec: Number(initialDec) }
    return coords.ra >= 0 && coords.ra < 360 && coords.dec >= -90 && coords.dec <= 90 ? coords : null
  })
  const [error, setError] = useState('')
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const sequence = position && sequences.find((item) =>
    Math.abs(item.ra - position.ra) < 0.000001 && Math.abs(item.dec - position.dec) < 0.000001)
  const frames = sequence ? [...sequence.frames].sort((a, b) =>
    Date.parse(a.observedAt) - Date.parse(b.observedAt)) : []
  const count = position ? frames.length : 6
  const current = frames[frame]

  useEffect(() => {
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

  function select(coords: typeof demo | null) {
    setPosition(coords)
    setFrame(0)
    setPlaying(false)
    setError('')
    const url = new URL(location.href)
    if (coords) {
      url.searchParams.set('ra', String(coords.ra))
      url.searchParams.set('dec', String(coords.dec))
      setRa(String(coords.ra))
      setDec(String(coords.dec))
    } else {
      url.searchParams.delete('ra')
      url.searchParams.delete('dec')
    }
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
          <a className="hero-action" href="#explorer"><span aria-hidden="true">▷</span> Explore the sky</a>
        </div>
      </section>
      <section id="explorer" className="explorer" aria-labelledby="explorer-title">
      <h2 id="explorer-title">SPHEREx Explorer</h2>
      <p className="intro">Compare the same patch of infrared sky across observations.</p>
      <div className="layout">
        <aside className="panel">
          <h2>Sky coordinates</h2>
          <form onSubmit={(event) => {
            event.preventDefault()
            const coords = { ra: Number(ra), dec: Number(dec) }
            if (!ra.trim() || !dec.trim() || !(coords.ra >= 0 && coords.ra < 360) ||
                !(coords.dec >= -90 && coords.dec <= 90)) {
              setError('Enter RA from 0 to under 360°, and Dec from −90° to 90°.')
              return
            }
            select(coords)
          }}>
            <label>Right ascension (°)<input inputMode="decimal" value={ra} onChange={(e) => setRa(e.target.value)} /></label>
            <label>Declination (°)<input inputMode="decimal" value={dec} onChange={(e) => setDec(e.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit">Find observations</button>
          </form>
          <h2 className="targets">Challenge targets</h2>
          <ul>
            {targets.map((target) => {
              const available = sequences.find((item) => item.target === target && item.frames.length)
              return <li key={target}>{available
                ? <button onClick={() => select(available)}>{target}</button>
                : <><span>{target}</span><small>Pending</small></>}</li>
            })}
          </ul>
        </aside>
        <section className="panel viewer" aria-label="Observation viewer">
          <div className="viewer-head">
            <h2>{position ? sequence?.target ?? 'Observation search' : 'Motion preview'}</h2>
            {!position && <span className="badge">Simulated data</span>}
            {position && <button onClick={() => select(null)}>Open demo</button>}
          </div>
          <div className="sky">
            {!position ? <DemoSky frame={frame} /> : current
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
            {!position ? 'Watch the amber point move while the background stars stay fixed.'
              : current && <><span>{current.observedAt} · {current.wavelength}</span>
                <a href={current.source}>Observation source</a></>}
          </div>
        </section>
      </div>
      </section>
      <section className="mission-notes" aria-label="About the project">
        <div id="spherex"><h2>SPHEREx</h2><p>NASA’s SPHEREx mission surveys the sky in near-infrared light. Repeat observations let us compare the same patch of sky over time.</p></div>
        <div id="planet-x"><h2>Planet X</h2><p>Planet X is a hypothetical planet beyond Neptune. The red planet in the hero is an illustration.</p></div>
        <div id="about"><h2>About Galaxy Divers</h2><p>We’re building an infrared sky explorer for the NASA International Space Apps Challenge.</p></div>
      </section>
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
