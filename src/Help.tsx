const imageDirectory = '/data/barnards-star/spherex-images/'

export function Help() {
  return <main className="spherex-about help-page">
    <h1>How to use Galaxy Divers</h1>
    <p className="spherex-lead">Compare pictures of the same patch of sky taken on different dates. Start with a saved target, look for a change, and check what might have caused it.</p>
    <a className="primary help-link" href="/#explorer">Open the studio</a>

    <section className="spherex-overview" aria-labelledby="help-target">
      <div>
        <h2 id="help-target">Pick a place to look</h2>
        <p>Open <strong>Quick-select target</strong> and choose <strong>Barnard’s Star</strong>. Under <strong>View</strong>, choose <strong>SPHEREx · 18 wide-field images</strong>. Turn on <strong>Mark Barnard’s Star</strong> to see a ring at its expected position.</p>
        <p>To explore any other place, enter its right ascension and declination in degrees and select <strong>Load SPHEREx observations</strong>. We look for real NASA archive images at that position and line up up to three visits from different dates. The teal circle on the map marks your coordinates, and the outline shows the area in the images.</p>
        <p>When the dated images appear, choose <strong>Compare all visits</strong> and press <strong>Play</strong>. Click a dated image to inspect it alone. If fewer visits are available, we show the ones we can verify. If the archive is temporarily unavailable, select <strong>Retry</strong> later. Each image includes a link to its original FITS data.</p>
      </div>
      <figure>
        <div className="help-star-image">
          <img src={imageDirectory + 'Barnards_Star_Detector_1_2025-09-05.webp'} width="840" height="840"
            alt="SPHEREx star field with an arrow pointing to Barnard’s Star near the center" />
          <span className="help-star-label" aria-hidden="true">↖ Barnard’s Star</span>
        </div>
        <figcaption>SPHEREx image from September 5, 2025. Source credit NASA/JPL-Caltech, via NASA/IPAC IRSA.</figcaption>
      </figure>
    </section>

    <section className="spherex-overview" aria-labelledby="help-blink">
      <div>
        <h2 id="help-blink">Flip between dates with Blink</h2>
        <p>Choose <strong>Blink</strong>, then press <strong>Play</strong> below the image. The studio cycles through the dates for the detector you selected. Press <strong>Pause</strong> and use <strong>Observation</strong> to check a date closely. Choose a smaller <strong>Field width</strong> to zoom in.</p>
        <p>Watch the target against two or three nearby stars. A target that shifts relative to its neighbors may be moving. Barnard’s Star shifts only slightly in these SPHEREx frames. Select <strong>WISE</strong> for a longer sequence, or <strong>Gaia</strong> for the star’s motion plot.</p>
      </div>
      <figure>
        <div className="help-image-pair">
          <div>
            <img src="/data/barnards-star/wise-early.webp" width="676" height="674" loading="lazy"
              alt="Earlier WISE image of the field around Barnard’s Star" />
            <span>Earlier frame</span>
          </div>
          <div>
            <img src="/data/barnards-star/wise-late.webp" width="676" height="674" loading="lazy"
              alt="Later WISE image of the same star field" />
            <span>Later frame</span>
          </div>
        </div>
        <figcaption>Two frames from the Barnard’s Star WISE sequence, which spans 2010–2022. Source credit NASA/JPL-Caltech.</figcaption>
      </figure>
    </section>

    <section aria-labelledby="help-difference">
      <h2 id="help-difference">See what changed</h2>
      <p>In the SPHEREx wide-field view, choose <strong>Difference</strong>. Pick the earlier date under <strong>Reference</strong> and a later date under <strong>Compare with</strong>. The studio subtracts the brightness shown in the earlier picture from the brightness shown in the later one.</p>
      <ul className="help-difference-key">
        <li><span style={{ background: '#e44949' }} /> Red marks where the image got darker.</li>
        <li><span style={{ background: '#49dbe4' }} /> Cyan marks where it got brighter.</li>
      </ul>
      <p>Look for two nearby marks where a source may have shifted. Brightness changes, image noise, and slight alignment errors can also leave marks. Use Blink to check how the source looks in the original frames.</p>
    </section>

    <section aria-labelledby="help-fits">
      <h2 id="help-fits">Preview your own FITS files</h2>
      <p>FITS is a file format that stores a telescope image alongside details about the observation. Open <strong>Upload observations</strong> in the studio. Choose one calibrated FITS file and select <strong>Preview in studio</strong>, or choose two to eight files and select <strong>Compare in studio</strong>.</p>
      <p>For a motion comparison, pick images that cover the same sky area at different dates and similar wavelengths. The studio aligns them using their sky coordinates. Open <strong>FITS metadata</strong> to see which detector and wavelength the studio could read. The files are processed in your browser.</p>
      <a href="/#explorer">Try it in the studio →</a>
    </section>
  </main>
}
