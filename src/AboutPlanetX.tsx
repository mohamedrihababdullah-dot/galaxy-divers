const nasa = 'https://science.nasa.gov/solar-system/planet-x/'
const illustration = 'https://science.nasa.gov/image-detail/amf-ae4fd0c2-4b27-4b9a-9c07-3e908f62214e/'
const caltech = 'https://www.caltech.edu/about/news/caltech-researchers-find-evidence-real-ninth-planet-49523'

export function AboutPlanetX() {
  return <main className="spherex-about">
    <section className="spherex-overview" aria-labelledby="planet-x-title">
      <div>
        <h1 id="planet-x-title">About Planet X</h1>
        <p className="spherex-lead">Could another planet be circling the Sun far beyond Neptune? Astronomers are looking for a distant world that might explain why some icy objects there follow similar paths.</p>
        <p>Planet X is an older name used for proposed planets beyond Neptune. Planet Nine is the specific idea that Caltech astronomers Konstantin Batygin and Mike Brown put forward in 2016. It remains a hypothesis.</p>
        <a href={nasa}>Read NASA’s Planet X overview ↗</a>
      </div>
      <figure>
        <img src="/planet-x/planet-nine.jpg" width="1280" height="762" alt="Artist’s illustration of a dark blue planet against the Milky Way" />
        <figcaption>Artist’s concept of Planet Nine. <a href={illustration}>Caltech/R. Hurt (IPAC), via NASA</a></figcaption>
      </figure>
    </section>
    <section className="spherex-overview" aria-labelledby="planet-x-orbits">
      <div>
        <h2 id="planet-x-orbits">The clue is in the orbits</h2>
        <p>Some of the most distant objects beyond Neptune have stretched-out orbits that point in roughly the same direction. In computer models, the gravity of a distant planet can help keep those orbits aligned.</p>
        <p>Telescopes cover some parts of the sky more thoroughly than others. Astronomers have to account for where they looked and what their surveys were sensitive enough to find before drawing conclusions from that pattern.</p>
      </div>
      <figure>
        <img src="/planet-x/orbits.png" width="450" height="253" alt="Six observed outer solar system orbits in magenta and a proposed Planet Nine orbit in orange" loading="lazy" />
        <figcaption>Orbits from the 2016 Planet Nine study. <a href={caltech}>Caltech/R. Hurt (IPAC), using WorldWide Telescope</a></figcaption>
      </figure>
    </section>
    <section aria-labelledby="planet-x-search">
      <h2 id="planet-x-search">How astronomers search</h2>
      <p>A planet this far from the Sun would reflect very little sunlight. One way to look for it is to compare images of the same patch of sky taken on different nights and check whether a faint point shifts against the background stars. Follow-up observations would help pin down its orbit.</p>
      <p>You can try that comparison technique in our studio using images of known objects.</p>
      <a href="/#explorer">Open the Blink &amp; Shift Studio →</a>
    </section>
  </main>
}
