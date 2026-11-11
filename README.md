# Galaxy Divers · SPHEREx Explorer

Run `npm ci` to install the dependencies and `npm run dev` to start the viewer locally. Use `npm run build` to type-check and build the static site.

On Cloudflare Pages, use the repository root, the `main` production branch, `npm run build` as the build command, and `dist` as the output directory.

## Adding observations

Put aligned, browser-ready image frames under `public/data/` and add their sequences to `public/data/manifest.json`. The included catalog is empty while the challenge resources are pending. The built-in motion preview uses a simulated star field.

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
