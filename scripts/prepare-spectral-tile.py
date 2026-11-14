import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from scipy.ndimage import map_coordinates


def prepare(path, source, ra, dec, field, output):
    # Resample a small common field at approximately the native angular scale.
    pixel_scale = 6.15
    size = 2 * round((field * 60 / pixel_scale - 1) / 2) + 1
    if not 3 <= size <= 95:
        raise ValueError("Choose a field between about 0.3 and 9.7 arcminutes")
    grid = WCS(naxis=2)
    grid.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    grid.wcs.crval = [ra, dec]
    grid.wcs.crpix = [(size + 1) / 2] * 2
    grid.wcs.cdelt = [-pixel_scale / 3600] * 2
    yy, xx = np.indices((size, size), dtype=float)
    sky = grid.pixel_to_world(xx, yy)

    with fits.open(path, memmap=True) as hdus:
        image = hdus["IMAGE"]
        flags = hdus["FLAGS"]
        channels = hdus["SPECTRAL_CHANNELS"].data
        x, y = WCS(image.header, hdus).celestial.world_to_pixel(sky)
        if not np.isfinite([x, y]).all():
            raise ValueError("The requested field lies outside this tile")
        width, height = image.header["NAXIS1"], image.header["NAXIS2"]
        left, right = max(0, int(np.floor(x.min()))), min(width, int(np.ceil(x.max())) + 1)
        top, bottom = max(0, int(np.floor(y.min()))), min(height, int(np.ceil(y.max())) + 1)
        if left >= right or top >= bottom:
            raise ValueError("The requested field lies outside this tile")
        coords = [y - top, x - left]
        bands = []
        planes = []
        flag_planes = []
        for index, channel in enumerate(channels):
            native = image.section[index, top:bottom, left:right].astype(float)
            hits = hdus["NHITS"].section[index, top:bottom, left:right]
            valid = np.isfinite(native) & (hits > 0)
            nearest = map_coordinates(valid, coords, order=0, mode="constant", cval=0)
            weight = map_coordinates(valid.astype(float), coords, order=1, mode="constant", cval=0)
            values = map_coordinates(np.where(valid, native, 0), coords, order=1, mode="constant", cval=0)
            aligned = np.divide(values, weight, out=np.full_like(values, np.nan), where=nearest & (weight > 0))
            bitmask = flags.section[index, top:bottom, left:right].astype(np.uint32)
            projected = map_coordinates(bitmask, coords, order=0, mode="constant", cval=0)
            covered = map_coordinates(hits > 0, coords, order=0, mode="constant", cval=0)
            planes.append([float(value) if np.isfinite(value) else None for value in aligned.flat])
            flag_planes.append([int(value) if hit else None for value, hit in zip(projected.flat, covered.flat)])
            bands.append({"wavelength": float(channel["WAVELENGTH"]), "detector": int(channel["DETECTOR"])})
        if len(bands) != 102 or not any(value is not None for plane in planes for value in plane):
            raise ValueError("Expected a covered SPHEREx tile with 102 channels")
        flag_names = {str(int(key[4:])): value for key, value in flags.header.items() if re.fullmatch(r"MSKD\d{4}", key)}
        epoch = {"date": Time(hdus[0].header["DATE-BEG"], scale="utc").isot + "Z",
                 "label": "DR1 all-sky mosaic", "source": source, "planes": planes, "flags": flag_planes}
        cube = {"width": size, "height": size, "unit": image.header["BUNIT"], "bands": bands,
                "pixelScaleArcsec": pixel_scale, "flagNames": flag_names, "epochs": [epoch]}
        output.write_text(json.dumps(cube, allow_nan=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare a browser cutout from a SPHEREx all-sky FITS tile")
    parser.add_argument("fits", type=Path)
    parser.add_argument("source", help="Original IRSA FITS URL")
    parser.add_argument("ra", type=float)
    parser.add_argument("dec", type=float)
    parser.add_argument("output", type=Path)
    parser.add_argument("--field-arcmin", type=float, default=4)
    args = parser.parse_args()
    if urlparse(args.source).scheme != "https":
        parser.error("the source must be an HTTPS URL")
    prepare(args.fits, args.source, args.ra, args.dec, args.field_arcmin, args.output)
