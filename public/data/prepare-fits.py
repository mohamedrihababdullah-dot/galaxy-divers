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


def observation_metadata(image, hdus, wcs, center):
    detector = None
    wavelength = None
    bandwidth = None
    for header in (image.header, hdus[0].header):
        for key in ("DETECTOR", "ARRAY"):
            value = str(header.get(key, "")).strip()
            if value and detector is None:
                detector = value

    if "WCS-WAVE" in hdus:
        try:
            spectral = WCS(image.header, hdus, key="W")
            spectral.sip = None
            wave, band = spectral.pixel_to_world(*wcs.world_to_pixel(center))
            wavelength = float(wave.to_value(u.um))
            bandwidth = float(band.to_value(u.um))
        except (ValueError, TypeError, AttributeError, KeyError, IndexError):
            pass

    def positive(value):
        return value if value is not None and np.isfinite(value) and value > 0 else None

    return {"detector": detector, "wavelength": positive(wavelength), "bandwidth": positive(bandwidth)}


def prepare_fits(inputs):
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
                    if "WCS-WAVE" in hdus:
                        # Keep the same display flags as the built-in SPHEREx sequences.
                        display_bits = (0, 1, 2, 12, 21, 26)
                        mask = np.uint32(0xFFFFFFFF ^ sum(1 << bit for bit in display_bits))
                        data[(flags.astype(np.uint32) & mask) != 0] = np.nan
                    else:
                        data[flags != 0] = np.nan
                data[~np.isfinite(data)] = np.nan

                if footprint is None:
                    ny, nx = data.shape
                    stride = max(1, (max(nx, ny) + 511) // 512)
                    xx, yy = np.meshgrid(np.arange(0, nx, stride), np.arange(ny - 1, -1, -stride))
                    height, width = xx.shape
                    sky = wcs.pixel_to_world(xx, yy)
                    center = wcs.pixel_to_world((nx - 1) / 2, (ny - 1) / 2).icrs
                    aligned = data[yy, xx]
                else:
                    x, y = wcs.world_to_pixel(sky)
                    valid = np.isfinite(data)
                    nearest = map_coordinates(valid, [y, x], order=0, mode="constant", cval=0)
                    weight = map_coordinates(valid.astype(np.float32), [y, x], order=1, mode="constant", cval=0)
                    values = map_coordinates(np.where(valid, data, 0), [y, x], order=1, mode="constant", cval=0)
                    aligned = np.divide(values, weight, out=np.full_like(values, np.nan), where=nearest & (weight > 0))
                valid = np.isfinite(aligned)
                footprint = valid if footprint is None else footprint & valid
                epochs.append({"date": date, "source": name, "label": f"{date[:10]} · {name}",
                               "fitsMetadata": observation_metadata(image, hdus, wcs, center),
                               "planes": [np.where(valid, aligned, None).ravel().tolist()]})
        except Exception as error:
            raise ValueError(f"{name}: {error}") from error
        yield None

    if not footprint.any():
        raise ValueError("The images have no usable overlap on the first image’s sky grid.")
    epochs.sort(key=lambda epoch: epoch["date"])
    yield json.dumps({
        "target": "Uploaded FITS observations",
        "coords": {"ra": center.ra.deg, "dec": center.dec.deg},
        "cube": {"width": width, "height": height, "unit": unit,
                 "bands": [{"wavelength": None, "detector": None}], "epochs": epochs},
    }, allow_nan=False)
