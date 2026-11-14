const firstLight = 'https://www.nasa.gov/missions/spherex/nasas-spherex-takes-first-images-preps-to-study-millions-of-galaxies/'
const archive = 'https://irsa.ipac.caltech.edu/Missions/spherex.html'

export function AboutSpherex() {
  return <main className="spherex-about">
    <section className="spherex-overview" aria-labelledby="spherex-title">
      <div>
        <h1 id="spherex-title">About SPHEREx</h1>
        <p className="spherex-lead">NASA’s SPHEREx observatory is mapping the entire sky in infrared light. By looking at the same patch of sky across 102 wavelengths, it can pick up details that a single image would miss.</p>
        <p>Launched in March 2025, SPHEREx uses six detectors with filters that change gradually across their surfaces. As the spacecraft shifts its pointing, the same stars and galaxies fall on different parts of the filters. Those overlapping exposures show how each object’s brightness changes with wavelength.</p>
        <a href={archive}>Explore the NASA/IPAC data archive ↗</a>
      </div>
      <figure>
        <img src="/hero/PIA26536.jpg" alt="The SPHEREx observatory and its nested cone-shaped shields in a clean room" />
        <figcaption>SPHEREx after environmental testing in Boulder, Colorado. <a href="https://www.jpl.nasa.gov/images/pia26536-spherex-after-environmental-testing/">NASA/JPL-Caltech/BAE Systems</a></figcaption>
      </figure>
    </section>
    <section aria-labelledby="first-light-title">
      <h2 id="first-light-title">SPHEREx’s first look at the sky</h2>
      <p>On March 27, 2025, SPHEREx took these images during its early checks in orbit. The six panels show what its detectors saw. NASA assigned visible colors to the infrared wavelengths so we can see how the signal changes across each panel.</p>
      <figure>
        <img src="/hero/PIA26280.jpg" alt="Six early SPHEREx infrared images showing dense star fields in different color gradients" loading="lazy" />
        <figcaption>First-light observations, March 27, 2025. Credit NASA/JPL-Caltech. <a href={firstLight}>Read NASA’s first-images story ↗</a></figcaption>
      </figure>
    </section>
    <section aria-labelledby="science-title">
      <h2 id="science-title">What the survey can tell us</h2>
      <p>The spectra help astronomers estimate distances to galaxies and map how they are spread through space. That pattern carries clues about the early universe. Closer to home, SPHEREx searches for the spectral signatures of water ice and other frozen molecules in clouds where stars and planets form.</p>
      <p>Caltech’s Infrared Science Archive publishes the mission’s observations, including calibrated images and spectral cubes. In Galaxy Divers, you can compare visits to Barnard’s Star and see how the field changes over time.</p>
      <a href="/?ra=269.444&dec=4.768&product=epochs#explorer">Open the SPHEREx Studio →</a>
    </section>
  </main>
}
