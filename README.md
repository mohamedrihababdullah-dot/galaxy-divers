# Galaxy Divers · SPHEREx Explorer

Run `npm ci` to install the dependencies and `npm run dev` to start the viewer locally. Use `npm run build` to type-check and build the static site.

On Cloudflare Pages, use the repository root, the `main` production branch, `npm run build` as the build command, and `dist` as the output directory.

## Explorer links and archive search

Open `/?ra=269.444&dec=4.768&mode=blink#explorer` to jump to Barnard’s Star. Add `field=wide` to load the wider time-series cutout, `product=spectrum` to open the DR1 mosaic, or `embed=1` for an iframe-friendly Studio view. Any valid coordinates center the Aladin map and the IRSA query. Prepared observations load at registered coordinates.

**Search the latest SPHEREx releases** queries IRSA SIA2 on demand through the Cloudflare Pages function in `functions/api/spherex.js`. Choose a collection and field width to find calibrated FITS products and obtain spectral-image cutouts. The direct IRSA link also works with the static Vite build. Larger cutouts can take longer to download. When IRSA publishes another collection, update the list in the search UI and the function allowlist.

In the Aladin Lite map, choose a field width and turn on Gaia DR3 or AllWISE to overlay source positions. These catalog positions refer to the published coordinates and may differ from positions in later SPHEREx observations.

## Adding observations

The **Compare telescopes** buttons for Barnard’s Star open independently. WISE blinks two display frames extracted from the [published 2010–2022 NASA WISE sequence](https://commons.wikimedia.org/wiki/File:Barnards_Pfeilstern-2010-2022.webm) at 0.5 and 32 seconds. The Gaia plot uses the 1,000 brightest Gaia DR3 sources returned by an ESA Archive cone search at RA 269.446°, Dec 4.747°, radius 0.07°. It projects the catalog positions from J2016.0 to J2010.0 and J2022.0 using linear proper motion. The teal ring identifies Gaia source 4472832130942575872.

Select **Barnard’s Star** in the Studio to compare 18 calibrated NASA/IPAC IRSA SPHEREx exposures, one per detector in each of three survey periods. The archive links and losslessly gzip-compressed FITS cutouts are available under **NASA/IPAC IRSA observations**. The Studio loads a prepared cube on demand. Each plane was decoded with Astropy and reprojected onto the same north-up 2-arcsecond grid. The finer display grid retains the instrument's original resolution.

To rebuild the cube from the bundled cutouts, install Astropy and SciPy and run `python scripts/prepare-barnards-star.py`. The detector views use exposures selected for similar passbands near the star. The source dates and measured wavelengths are listed for each exposure because the six detectors did not all observe the field at the same instant.

To add a survey period, download six FITS cutouts at the same sky center, one per detector, and record each local filename and original archive URL in `public/data/barnards-star/observations.json`. Choose exposures with comparable wavelengths across survey periods. Rerun the preparation script for each field. The wide field uses `--field-arcmin 3.1 --output public/data/barnards-star/cube-wide.json`.

Barnard’s Star opens in **Surrounding stars**, a roughly 8-arcminute field. To rebuild it, download the 18 source URLs with `?center=269.444,4.768&size=0.14` and save them under their filenames from `observations.json` without the `.gz` suffix. Run `python scripts/prepare-barnards-star.py --field-arcmin 7.97 --archive-cutouts DIRECTORY --cutout-degrees 0.14 --output public/data/barnards-star/cube-surroundings.json.gz`. **Boost faint stars** applies the same display stretch to all frames in a blink sequence. **Play** below the image cycles through all three survey epochs by default.

The **DR1 · 102-channel mosaic** uses the [IRSA all-sky cube](https://doi.org/10.26131/IRSA679) around Barnard’s Star. Select an individual wavelength or average the available channels by detector. Click a pixel to generate its spectrum and export CSV with the FITS flag values. Pixels and channels with no usable measurements stay blank. The mosaic combines survey data across dates, so temporal comparisons use the separate multi-epoch product. Rebuild the mosaic browser asset with `python scripts/prepare-spectral-tile.py TILE.fits IRSA_FITS_URL 269.444 4.768 public/data/barnards-star/dr1-spectrum.json`.

The star saturates the detector. For visual comparison the time-series cube retains finite samples around the bright source, including some flagged pixels. Blank pixels mark missing or masked data. The pixel readout reports the nearest native FITS flag per band, or the bitwise union across a detector stack. Use the original FITS quality flags for quantitative work. The spectral images are from [IRSA DR1](https://doi.org/10.26131/IRSA678) and QR3.

Open **Upload observations** in the dashboard to compare 2–8 calibrated FITS cutouts from different dates, or reopen a prepared observation JSON. The browser runs Astropy and SciPy in a worker through Pyodide. FITS inputs need a 2D science image, celestial WCS, observation date, and brightness unit. Supply the shared wavelength and detector from the product metadata. The importer uses the first image’s central grid (up to 256 × 256 pixels), interpolates subsequent images onto it, and masks nonzero FLAGS and missing pixels. For SPHEREx products with a spatially varying bandpass, choose cutouts with comparable wavelength coverage before comparing epochs.

**Save observation JSON** exports the prepared dataset for sharing or reopening. To publish a team dataset, place that JSON under `public/data/` and register its target, coordinates, and URL in the manifest as described below. The public catalog accepts the saved JSON wrapper as well as a plain cube.

Put aligned, browser-ready image frames under `public/data/` and add their sequences to `public/data/manifest.json`. The WISE 0855 and RW Aurigae presets use simulated star fields and wavelength samples. RW Aurigae has a stationary source that changes brightness across four simulated dates.

Each entry in `sequences` follows this structure. The paths and metadata below illustrate the format.

```json
{
  "target": "WISE 0855",
  "ra": 133.795129,
  "dec": -7.245147,
  "frames": [
    {
      "image": "/data/wise-0855/frame-1.png",
      "observedAt": "2026-01-01T00:00:00Z",
      "wavelength": "3.4 µm",
      "source": "https://irsa.ipac.caltech.edu/Missions/spherex.html"
    }
  ]
}
```

Use decimal degrees and UTC observation timestamps. Record the original observation URL for each frame. Align frames to a common sky grid and match their wavelength range and display settings before publishing. The viewer sorts frames by observation time and matches searches against prepared coordinates in the catalog.

To enable Blink & Shift tools for an observation sequence, add a `cube` URL to the manifest entry. The JSON cube contains `width`, `height`, `unit`, `bands` (each with `wavelength` in microns and `detector` from 1 to 6), and `epochs` (each with a UTC `date`, a provenance `source` URL, and `planes` in band order). Each plane is a row-major array of linear pixel values on the same registered sky grid. Use `null` for masked or uncovered pixels, including entirely missing bands. Match calibration and point spread functions before interpreting difference images. Detector stacks are equal-weight means of available samples. Candidate exports include the field center and pixel index within the cube.
