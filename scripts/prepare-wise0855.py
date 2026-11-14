"""Render the WISE 0855 SPHEREx DR1 archive selection on a common sky grid."""

import argparse
import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image


def prepare(inputs, output):
    selection = json.loads((inputs / "selected.json").read_text())
    size = 350
    grid = WCS(naxis=2)
    grid.wcs.crpix = [size / 2 + 0.5] * 2
    grid.wcs.crval = [133.760, -7.242]
    grid.wcs.cdelt = [-6.2 / 3600, 6.2 / 3600]
    grid.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    yy, xx = np.indices((size, size))
    sky = grid.pixel_to_world(xx, size - 1 - yy)
    output.mkdir(parents=True, exist_ok=True)
    frames = []
    for item in selection:
        with fits.open(inputs / (item["stem"] + ".fits")) as hdus:
            image = hdus["IMAGE"]
            x, y = WCS(image.header).celestial.world_to_pixel(sky)
            height, width = image.shape
            if not ((x >= 0).all() and (x < width - 1).all()
                    and (y >= 0).all() and (y < height - 1).all()):
                raise ValueError(f"Partial coverage in {item['stem']}")
            i, j = np.floor(x).astype(int), np.floor(y).astype(int)
            dx, dy = x - i, y - j
            a = image.data
            values = (1 - dy) * ((1 - dx) * a[j, i] + dx * a[j, i + 1])
            values += dy * ((1 - dx) * a[j + 1, i] + dx * a[j + 1, i + 1])
            good = np.isfinite(values)
            low, high = np.percentile(values[good], [45, 99.9])
            if high <= low:
                raise ValueError(f"No usable brightness range in {item['stem']}")
            scaled = np.clip((values - low) / (high - low), 0, 1)
            pixels = np.where(good, np.arcsinh(8 * scaled) / np.arcsinh(8), 0)
            filename = item["stem"] + ".webp"
            Image.fromarray(np.rint(255 * pixels).astype(np.uint8)).save(
                output / filename, lossless=True
            )
            frames.append({
                "image": filename,
                "detector": item["detector"],
                "date": image.header["DATE-OBS"] + "Z",
                "source": item["source"],
                "archiveId": item["archiveId"],
            })
            print(filename, flush=True)
    (output / "frames.json").write_text(json.dumps(frames, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path, help="Directory with selected.json and FITS files")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    prepare(args.inputs, args.output)
