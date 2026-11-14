export function SkyGuide({ onDemo }: { onDemo: (target: 'WISE 0855' | 'RW Aurigae') => void }) {
  return <section id="sky-guide" className="sky-guide" aria-labelledby="sky-guide-title">
    <div className="guide-intro">
      <div>
        <h2 id="sky-guide-title">The sky is lying.</h2>
        <p>It looks still. Look again. Blink through SPHEREx observations of the WISE 0855 field to see what changes between visits.</p>
        <p>Clyde Tombaugh used this same technique to spot Pluto against the background stars.</p>
        <button className="hero-action" onClick={() => onDemo('WISE 0855')}>Try Blink in the studio <span aria-hidden="true">→</span></button>
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
