import { useState } from 'react'

const stars = [[9, 35], [17, 72], [23, 17], [29, 60], [37, 30], [42, 81],
  [48, 18], [53, 66], [60, 24], [67, 79], [75, 21], [81, 60], [91, 35], [93, 80]]

export function SkyGuide({ onDemo }: { onDemo: (target: 'WISE 0855' | 'RW Aurigae') => void }) {
  const [later, setLater] = useState(false)
  const [revealed, setRevealed] = useState(false)

  return <section id="sky-guide" className="sky-guide" aria-labelledby="sky-guide-title">
    <div className="guide-intro">
      <div>
        <h2 id="sky-guide-title">The sky is lying.</h2>
        <p>It looks still. Look again. These two simulated images show the same field at different times. Flip between them and see if you can spot the dot that jumps.</p>
        <p>Clyde Tombaugh used this same technique to spot Pluto against the background stars.</p>
        <button className="hero-action" onClick={() => onDemo('WISE 0855')}>Try Blink in the studio <span aria-hidden="true">→</span></button>
      </div>
      <div className="panel guide-demo">
        <div className="guide-sky" role="img" aria-label={revealed
          ? `Simulated sky, ${later ? 'later' : 'earlier'} image. The highlighted dot is ${later ? 'farther right and higher' : 'farther left and lower'}.`
          : `Simulated sky, ${later ? 'later' : 'earlier'} image. Compare it with the other image to find the moving dot.`}>
          {stars.map(([x, y], index) => <span key={x} className="guide-star" aria-hidden="true"
            style={{ left: `${x}%`, top: `${y}%`, opacity: .35 + (index % 4) * .17 }} />)}
          <span aria-hidden="true" className={`guide-star guide-mover${revealed ? ' guide-revealed' : ''}`}
            style={{ left: later ? '69%' : '58%', top: later ? '39%' : '48%' }} />
        </div>
        <div className="guide-controls">
          <button className="primary" onClick={() => setLater(value => !value)}>Flip image</button>
          <span role="status">{later ? 'Later image' : 'Earlier image'}</span>
          <button aria-pressed={revealed} onClick={() => setRevealed(value => !value)}>
            {revealed ? 'Hide highlight' : 'Reveal the mover'}
          </button>
        </div>
      </div>
    </div>
    <div className="guide-cards">
      <article id="spherex" className="panel">
        <h3>Meet SPHEREx</h3>
        <p>NASA’s infrared telescope launched on March 11, 2025. It surveys the whole sky roughly every six months across <strong>102 wavelengths</strong>, revealing details our eyes can’t see.</p>
        <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html">Browse SPHEREx data at NASA/IPAC IRSA ↗</a>
      </article>
      <article className="panel">
        <h3>The hunt</h3>
        <ol>
          <li>Align images of the same field taken on different dates at similar wavelengths.</li>
          <li>Use <strong>Blink</strong> to spot a shift and <strong>Difference</strong> to highlight what changed.</li>
          <li>Check nearby stars for similar shifts, compare the spectrum, and look for the candidate in additional observations.</li>
        </ol>
      </article>
      <article className="panel">
        <h3>What did you find?</h3>
        <p>A dot that changes position is a <strong>possible mover</strong>. A dot that brightens or fades in place could be a <strong>variable source</strong>. Similar shifts across many stars can point to an alignment issue.</p>
        <button onClick={() => onDemo('RW Aurigae')}>Compare a brightness change →</button>
      </article>
    </div>
  </section>
}
