"""Prepare calibrated pixel samples for a target's light curve and spectrum."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from astropy import log, units as u
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS


def prepare(directory, inputs, ra, dec):
    frames = json.loads((directory / "frames.json").read_text(encoding="utf-8"))
    detectors = [sorted((f for f in frames if f["detector"] == d), key=lambda f: f["date"])
                 for d in range(1, 7)]
    if any(len(frames) != 3 for frames in detectors):
        raise ValueError("Expected three exposures per detector")

    size, scale = 41, 6.2
    grid = WCS(naxis=2)
    grid.wcs.crpix = [(size + 1) / 2] * 2
    grid.wcs.crval = [ra, dec]
    grid.wcs.cdelt = [-scale / 3600] * 2
    grid.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    yy, xx = np.indices((size, size))
    sky = grid.pixel_to_world(xx, yy)
    epochs = []
    # Match the flag exclusions used in the built-in Barnard’s Star cube.
    mask = np.uint32(0xFFFFFFFF ^ sum(1 << bit for bit in (0, 1, 2, 12, 21, 26)))
    for visit in zip(*detectors):
        observations, planes = [], []
        for frame in visit:
            path = inputs / Path(urlparse(frame["source"]).path).name
            if not path.exists():
                path = inputs / Path(frame["image"]).with_suffix(".fits").name
            with fits.open(path, memmap=False) as hdus:
                image = hdus["IMAGE"]
                date = Time(image.header["DATE-OBS"], scale="utc").isot + "Z"
                if image.header["DETECTOR"] != frame["detector"] or date[:10] != frame["date"][:10]:
                    raise ValueError(f"Unexpected detector or date in {path}")
                wcs = WCS(image.header, hdus).celestial
                x, y = wcs.world_to_pixel(sky)
                x, y = np.rint(x).astype(int), np.rint(y).astype(int)
                height, width = image.shape
                inside = (x >= 0) & (x < width) & (y >= 0) & (y < height)
                values = np.full((size, size), np.nan)
                values[inside] = image.data[y[inside], x[inside]] * u.Unit(image.header["BUNIT"]).to(u.MJy / u.sr)
                flags = hdus["FLAGS"].data[y[inside], x[inside]].astype(np.uint32)
                values[inside] = np.where((flags & mask) == 0, values[inside], np.nan)
                if not np.isfinite(values).any():
                    raise ValueError(f"No usable pixels in {path}")
                planes.append(np.where(np.isfinite(values), np.round(values, 6), None).ravel().tolist())

                spectral = WCS(image.header, hdus, key="W")
                spectral.sip = None
                wavelength, bandwidth = spectral.pixel_to_world(*wcs.world_to_pixel(sky[size // 2, size // 2]))
                observations.append(dict(date=date, source=frame["source"], cutout=frame["source"],
                                         wavelength=float(wavelength.to_value(u.um)), bandwidth=float(bandwidth.to_value(u.um))))
        epochs.append(dict(date=min(frame["date"] for frame in observations), observations=observations, planes=planes))
    bands = [dict(detector=i + 1, wavelength=float(np.median([e["observations"][i]["wavelength"] for e in epochs])))
             for i in range(6)]
    cube = dict(width=size, height=size, pixelScaleArcsec=scale, unit="MJy/sr", bands=bands, epochs=epochs)
    (directory / "pixel-graphs.json").write_text(json.dumps(cube, separators=(",", ":"), allow_nan=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Public target folder containing frames.json")
    parser.add_argument("inputs", type=Path, help="Local directory of the original FITS files")
    parser.add_argument("ra", type=float)
    parser.add_argument("dec", type=float)
    args = parser.parse_args()
    log.setLevel("WARNING")
    prepare(args.directory, args.inputs, args.ra, args.dec)
