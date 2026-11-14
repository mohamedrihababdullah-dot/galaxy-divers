import { useEffect, useState } from 'react'

export type Telescope = 'gaia' | 'wise'
type GaiaSource = [ra: number, dec: number, pmRa: number, pmDec: number, magnitude: number, isBarnard: boolean]

const wiseSource = 'https://commons.wikimedia.org/wiki/File:Barnards_Pfeilstern-2010-2022.webm'
const wiseFrames = ['early', 'late'].map(epoch => `/data/barnards-star/wise-${epoch}.webp`)
const gaiaYears = [2010, 2022]

function GaiaField({ sources, year }: { sources: GaiaSource[]; year: number }) {
  const years = year - 2016
  const pixelsPerDegree = 4800
  return <svg viewBox="0 0 480 480" role="img" aria-label={`Gaia DR3 source positions projected to ${year}`}>
    <title>Gaia DR3 star field. The teal ring marks Barnard’s Star.</title>
    <rect width="480" height="480" fill="#060a12" />
    {sources.map(([ra, dec, pmRa, pmDec, magnitude, isBarnard], index) => {
      const cosDec = Math.cos(dec * Math.PI / 180)
      const east = (ra - 269.446) * cosDec + pmRa * years / 3_600_000
      const north = dec - 4.747 + pmDec * years / 3_600_000
      const x = 240 - east * pixelsPerDegree
      const y = 240 - north * pixelsPerDegree
      return <g key={index}>
        <circle cx={x} cy={y} r={Math.max(0.7, (21 - magnitude) / 3)} fill="#e8f2fc"
          opacity={Math.min(1, Math.max(.3, (23 - magnitude) / 10))} />
        {isBarnard && <circle cx={x} cy={y} r="13" fill="none" stroke="#a0e8de" strokeWidth="2" />}
      </g>
    })}
  </svg>
}

export function TelescopeComparison({ telescope }: { telescope: Telescope }) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [sources, setSources] = useState<GaiaSource[]>()
  const [imagesLoaded, setImagesLoaded] = useState(0)
  const [error, setError] = useState(false)
  const wise = telescope === 'wise'
  const ready = wise ? imagesLoaded === wiseFrames.length : !!sources

  useEffect(() => {
    if (wise) return
    const controller = new AbortController()
    fetch('/data/barnards-star/gaia-dr3.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Gaia catalog unavailable')
      return response.json() as Promise<GaiaSource[]>
    }).then(setSources).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [wise])

  useEffect(() => {
    if (!ready || !playing || error) return
    const timer = window.setInterval(() => setFrame(value => 1 - value), 800)
    return () => window.clearInterval(timer)
  }, [ready, playing, error])

  return <article className="telescope-view">
    <h3>{wise ? 'WISE infrared images' : 'Gaia DR3 motion plot'}</h3>
    <div className="telescope-image">
      {wise ? wiseFrames.map((src, index) => <img key={src} src={src} hidden={index !== frame || error}
        width="676" height="674" alt={`Barnard’s Star in the ${index ? 'later' : 'earlier'} WISE frame`}
        onLoad={() => setImagesLoaded(value => value + 1)} onError={() => setError(true)} />)
        : sources && <GaiaField sources={sources} year={gaiaYears[frame]} />}
      {!ready && <p role="status">{error ? 'Could not load this comparison.' : 'Loading comparison…'}</p>}
    </div>
    <div className="studio-modes">
      <button disabled={!ready || error} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play blink'}</button>
      <button disabled={!ready || error} onClick={() => { setPlaying(false); setFrame(value => 1 - value) }}>Switch frame</button>
    </div>
    <p>{wise ? `${frame ? 'Later' : 'Earlier'} frame · WISE sequence from 2010–2022` : `Projected position · J${gaiaYears[frame]}.0`}</p>
    {wise
      ? <p>Frames from infrared observations by NASA/JPL-Caltech WISE, extracted from the published sequence. <a href={wiseSource}>Original sequence and credits</a></p>
      : <p>The teal ring marks Barnard’s Star. Positions use Gaia DR3 astrometry and linear proper motion from J2016.0. Sources without measured motion stay at their catalog positions. <a href="https://gea.esac.esa.int/archive/documentation/GDR3/">Gaia DR3 documentation</a></p>}
  </article>
}
