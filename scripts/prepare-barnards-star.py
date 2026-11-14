"""Build the browser cube from the 18 archived IRSA FITS cutouts.

Run from the repository root with Astropy and SciPy installed.
"""

import argparse
import json
import re
from pathlib import Path

import numpy as np
from astropy import log, units as u
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from scipy.ndimage import map_coordinates


DATA = Path(__file__).resolve().parents[1] / "public/data/barnards-star"
SIZE = 81
PIXEL_SCALE = 2 / 3600


def prepare(size, output):
    log.setLevel("WARNING")
    metadata = json.loads((DATA / "observations.json").read_text(encoding="utf-8"))
    coords = metadata["coords"]
    grid = WCS(naxis=2)
    grid.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    grid.wcs.crval = [coords["ra"], coords["dec"]]
    grid.wcs.crpix = [(size + 1) / 2] * 2
    # Browser rows run from top to bottom. North is up and east is left.
    grid.wcs.cdelt = [-PIXEL_SCALE, -PIXEL_SCALE]
    yy, xx = np.indices((size, size), dtype=float)
    sky = grid.pixel_to_world(xx, yy)
    epochs = []
    flag_names = {}
    for survey in metadata["surveys"]:
        observations = []
        planes = []
        flag_planes = []
        for entry in survey["observations"]:
            with fits.open(DATA / entry["file"], memmap=False) as hdus:
                image = hdus["IMAGE"]
                detector = int(image.header["DETECTOR"])
                if detector != len(planes) + 1:
                    raise ValueError(f"{entry['file']}: unexpected detector {detector}")
                wcs = WCS(image.header, hdus).celestial
                spectral = WCS(image.header, hdus, key="W")
                spectral.sip = None
                wavelength, bandwidth = spectral.pixel_to_world(*wcs.world_to_pixel(sky[size // 2, size // 2]))
                data = np.asarray(image.data, dtype=float) * u.Unit(image.header["BUNIT"]).to(u.MJy / u.sr)
                flags = hdus["FLAGS"].data.astype(np.uint32)
                for key, value in hdus["FLAGS"].header.items():
                    if re.fullmatch(r"MSKD\d{4}", key):
                        flag_names[str(int(key[4:]))] = value
                # Keep finite bright-source samples for visual inspection, including
                # pixels marked transient, overflow, onboard-error, or bloom. The
                # saturated core can contain NaNs, which remain missing.
                display_bits = (0, 1, 2, 12, 21, 26)
                mask = np.uint32(0xFFFFFFFF ^ sum(1 << bit for bit in display_bits))
                data[(flags & mask) != 0] = np.nan
                x, y = wcs.world_to_pixel(sky)
                footprint = map_coordinates(np.ones(flags.shape, dtype=bool), [y, x], order=0, mode="constant", cval=0)
                projected_flags = map_coordinates(flags, [y, x], order=0, mode="constant", cval=0)
                flag_planes.append([int(value) if covered else None
                                    for value, covered in zip(projected_flags.flat, footprint.flat)])
                # Keep a hole centered on missing native pixels without letting a
                # missing neighbor erase all four bilinear interpolation samples.
                valid = np.isfinite(data)
                nearest = map_coordinates(valid, [y, x], order=0, mode="constant", cval=0)
                weight = map_coordinates(valid.astype(float), [y, x], order=1, mode="constant", cval=0)
                values = map_coordinates(np.where(valid, data, 0), [y, x], order=1, mode="constant", cval=0)
                aligned = np.divide(values, weight, out=np.full_like(values, np.nan), where=nearest & (weight > 0))
                if np.isfinite(aligned).mean() < 0.5:
                    raise ValueError(f"{entry['file']}: less than half of the Studio field is usable")
                planes.append([float(value) if np.isfinite(value) else None for value in aligned.flat])
                observations.append({
                    "date": Time(image.header["DATE-OBS"], scale="utc").isot + "Z",
                    "source": entry["source"],
                    "cutout": f"/data/barnards-star/{entry['file']}",
                    "wavelength": float(wavelength.to_value(u.um)),
                    "bandwidth": float(bandwidth.to_value(u.um)),
                })
        if len(planes) != 6:
            raise ValueError("Each survey must contain all six detectors")
        epochs.append({"date": min(item["date"] for item in observations), "label": survey["label"],
                       "observations": observations, "planes": planes, "flags": flag_planes})
    if len(epochs) < 2 or len({item["source"] for epoch in epochs for item in epoch["observations"]}) != 6 * len(epochs):
        raise ValueError("Expected at least two surveys with six distinct products each")
    epochs.sort(key=lambda epoch: epoch["date"])
    bands = [{"detector": i + 1, "wavelength": float(np.median([
        epoch["observations"][i]["wavelength"] for epoch in epochs
    ]))} for i in range(6)]
    cube = {
        "width": size, "height": size, "unit": "MJy/sr", "bands": bands, "epochs": epochs,
        "pixelScaleArcsec": PIXEL_SCALE * 3600, "flagNames": flag_names,
        "note": "Barnard’s Star is saturated in these exposures. Bright-source artifacts affect pixel values and the difference image.",
    }
    output.write_text(json.dumps(cube, separators=(",", ":"), allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--field-arcmin", type=float, default=SIZE * PIXEL_SCALE * 60)
    parser.add_argument("--output", type=Path, default=DATA / "cube.json")
    args = parser.parse_args()
    size = 2 * round((args.field_arcmin / (PIXEL_SCALE * 60) - 1) / 2) + 1
    if not 3 <= size <= 255:
        parser.error("field width must give between 3 and 255 output pixels")
    prepare(size, args.output)
