import json

import numpy as np
from astropy import units as u
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from scipy.ndimage import map_coordinates


def observation_date(image, primary):
    for header in (image, primary):
        for key in ("DATE-OBS", "DATE_OBS", "DATE-BEG", "MJD-OBS", "MJD_OBS", "MJD-BEG"):
            if key in header:
                value = header[key]
                date = Time(float(value), format="mjd", scale="utc") if key.startswith("MJD") else Time(value, scale="utc")
                return date.utc.isot + "Z"
    raise ValueError("Missing observation date (DATE-OBS or MJD-OBS).")


def prepare_fits(inputs, wavelength, detector):
    epochs = []
    footprint = None
    unit = None
    for path, name in inputs:
        try:
            with fits.open(path, memmap=False, lazy_load_hdus=True) as hdus:
                image = hdus["IMAGE"] if "IMAGE" in hdus else next(
                    (hdu for hdu in hdus if isinstance(hdu, (fits.PrimaryHDU, fits.ImageHDU, fits.CompImageHDU))
                     and hdu.header.get("NAXIS") == 2), None)
                if image is None or image.header.get("NAXIS") != 2:
                    raise ValueError("Expected a 2D FITS science image.")
                if image.header["NAXIS1"] * image.header["NAXIS2"] > 12_000_000:
                    raise ValueError("Image is too large. Use an archive cutout.")
                wcs = WCS(image.header, fobj=hdus).celestial
                if not wcs.has_celestial:
                    raise ValueError("A celestial WCS is required to align the images.")
                date = observation_date(image.header, hdus[0].header)
                image_unit = str(image.header.get("BUNIT", hdus[0].header.get("BUNIT", ""))).strip()
                if not image_unit:
                    raise ValueError("Missing BUNIT. Use calibrated images with documented units.")
                data = np.asarray(image.data, dtype=np.float64)
                if unit is None:
                    unit = image_unit
                elif image_unit != unit:
                    data *= u.Unit(image_unit).to(u.Unit(unit))
                if "FLAGS" in hdus:
                    flags = hdus["FLAGS"].data
                    if flags.shape != data.shape:
                        raise ValueError("The FLAGS extension does not match the science image.")
                    data[flags != 0] = np.nan
                data[~np.isfinite(data)] = np.nan

                if footprint is None:
                    ny, nx = data.shape
                    width, height = min(nx, 256), min(ny, 256)
                    left, top = (nx - width) // 2, (ny - height) // 2
                    yy, xx = np.indices((height, width), dtype=float)
                    sky = wcs.pixel_to_world(xx + left, yy + top)
                    center = wcs.pixel_to_world(left + (width - 1) / 2, top + (height - 1) / 2).icrs
                    aligned = data[top:top + height, left:left + width]
                else:
                    x, y = wcs.world_to_pixel(sky)
                    aligned = map_coordinates(data, [y, x], order=1, mode="constant", cval=np.nan)
                valid = np.isfinite(aligned)
                footprint = valid if footprint is None else footprint & valid
                epochs.append({"date": date, "source": name,
                               "planes": [[float(value) if np.isfinite(value) else None for value in aligned.flat]]})
        except Exception as error:
            raise ValueError(f"{name}: {error}") from error

    if not footprint.any():
        raise ValueError("The images have no usable overlap in the first image's central cutout.")
    epochs.sort(key=lambda epoch: epoch["date"])
    if len({epoch["date"] for epoch in epochs}) < 2:
        raise ValueError("Choose observations from at least two distinct dates.")
    return json.dumps({
        "target": "Uploaded FITS observations",
        "coords": {"ra": center.ra.deg, "dec": center.dec.deg},
        "cube": {"width": width, "height": height, "unit": unit,
                 "bands": [{"wavelength": wavelength, "detector": detector}], "epochs": epochs},
    }, allow_nan=False)
