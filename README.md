# Galaxy Divers · SPHEREx Explorer

Run `npm ci` to install the dependencies and `npm run dev` to start the viewer locally. Use `npm run build` to type-check and build the static site.

On Cloudflare Pages, use the repository root, the `main` production branch, `npm run build` as the build command, and `dist` as the output directory.

## Adding observations

Put aligned, browser-ready image frames under `public/data/` and add their sequences to `public/data/manifest.json`. The included catalog is empty while the challenge resources are pending. The WISE 0855, Barnard’s Star, and RW Aurigae presets use simulated star fields and wavelength samples. RW Aurigae has a stationary source that changes brightness across four simulated dates.

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
