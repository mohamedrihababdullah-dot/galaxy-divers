import { useEffect, useState } from 'react'

const frames = ['early', '8', '16', '24', 'late'].map(id => `/data/barnards-star/wise-${id}.webp`)

export function WiseImageSequence() {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState(false)
  const ready = loaded === frames.length && !error

  useEffect(() => {
    if (!playing || !ready) return
    const timer = window.setInterval(() => setFrame(index => (index + 1) % frames.length), 850)
    return () => window.clearInterval(timer)
  }, [playing, ready])

  return <div className="wise-sequence">
    <div className="wise-sequence-frame">
      {frames.map((src, index) => <img key={src} src={src} hidden={index !== frame || error}
        width="676" height="674" alt={`Barnard’s Star and surrounding stars in WISE frame ${index + 1}`}
        onLoad={() => setLoaded(value => value + 1)} onError={() => setError(true)} />)}
      {error && <p role="status">The WISE images could not load. Reload to try again.</p>}
    </div>
    <div className="studio-playback">
      <button type="button" className="primary" disabled={!ready} onClick={() => setPlaying(value => !value)}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" disabled={!ready} onClick={() => {
        setPlaying(false)
        setFrame(index => (index + 1) % frames.length)
      }}>Next frame</button>
      <input type="range" aria-label="WISE frame" min="0" max={frames.length - 1} value={frame} disabled={!ready}
        onChange={event => { setPlaying(false); setFrame(Number(event.target.value)) }} />
      <span>{frame + 1} / {frames.length}</span>
    </div>
    <p>NASA/JPL-Caltech WISE infrared observations · 2010–2022 · <a
      href="https://commons.wikimedia.org/wiki/File:Barnards_Pfeilstern-2010-2022.webm">Original sequence and credits</a></p>
  </div>
}
