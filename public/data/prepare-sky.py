"""Project live IRSA cutouts onto a fixed north-up ICRS field."""
from itertools import product
from astropy.coordinates import SkyCoord


def sky_grid(coords):
    size = 59
    grid = WCS(naxis=2)
    grid.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    grid.wcs.crval = [coords["ra"], coords["dec"]]
    grid.wcs.crpix = [(size + 1) / 2] * 2
    # Array rows increase down the browser canvas: north is up, east is left.
    grid.wcs.cdelt = [-6.2 / 3600, -6.2 / 3600]
    yy, xx = np.indices((size, size), dtype=float)
    return grid, grid.pixel_to_world(xx, yy)


def read_sky_candidate(path, entry, coords, visit):
    center = SkyCoord(coords["ra"], coords["dec"], unit="deg", frame="icrs")
    grid, sky = sky_grid(coords)
    with fits.open(path, memmap=False) as hdus:
        image = hdus["IMAGE"]
        wcs = WCS(image.header, hdus).celestial
        cx, cy = wcs.world_to_pixel(center)
        ny, nx = image.data.shape
        if not (np.isfinite(cx) and np.isfinite(cy) and -.5 <= cx < nx - .5 and -.5 <= cy < ny - .5):
            raise ValueError("The FITS image does not cover the requested coordinates.")
        metadata = observation_metadata(image, hdus, wcs, center)
        if str(metadata["detector"]) != str(entry["detector"]):
            raise ValueError("The FITS detector does not match the archive record.")
        date = observation_date(image.header, hdus[0].header)
        if abs(Time(date.rstrip("Z")).mjd - entry["mjd"]) > 1:
            raise ValueError("The FITS observation date does not match the archive record.")
        data = np.asarray(image.data, dtype=float) * u.Unit(image.header["BUNIT"]).to(u.MJy / u.sr)
        flags = hdus["FLAGS"].data.astype(np.uint32)
        if flags.shape != data.shape:
            raise ValueError("Invalid FITS quality flag dimensions.")
        # Preserve finite bright-source samples for inspection, as in the saved viewer.
        # Every native quality flag is also returned for the pixel readout.
        display_bits = (0, 1, 2, 12, 21, 26)
        mask = np.uint32(0xFFFFFFFF ^ sum(1 << bit for bit in display_bits))
        valid = np.isfinite(data) & ((flags & mask) == 0)
        x, y = wcs.world_to_pixel(sky)
        covered = np.isfinite(x) & np.isfinite(y) & (x >= 0) & (x <= nx - 1) & (y >= 0) & (y <= ny - 1)
        x = np.nan_to_num(x, nan=-1000)
        y = np.nan_to_num(y, nan=-1000)
        nearest = map_coordinates(valid, [y, x], order=0, mode="constant", cval=0)
        weight = map_coordinates(valid.astype(float), [y, x], order=1, mode="constant", cval=0)
        values = map_coordinates(np.where(valid, data, 0), [y, x], order=1, mode="constant", cval=0)
        aligned = np.divide(values, weight, out=np.full_like(values, np.nan), where=covered & nearest & (weight > 0))
        coverage = float(np.isfinite(aligned).mean())
        if coverage < .25:
            raise ValueError("Less than a quarter of this sky patch has usable pixels in this exposure.")
        projected_flags = map_coordinates(flags, [y, x], order=0, mode="constant", cval=0)
        flag_names = {str(int(key[4:])): value for key, value in hdus["FLAGS"].header.items()
                      if key.startswith("MSKD") and key[4:].isdigit()}
        return {"date": date, "source": entry["source"], "id": entry["id"], "visit": visit,
                "label": date[:10], "fitsMetadata": metadata, "coverage": coverage,
                "planes": [[float(value) if np.isfinite(value) else None for value in aligned.flat]],
                "flags": [[int(value) if inside else None for value, inside in zip(projected_flags.flat, covered.flat)]],
                "flagNames": flag_names}


def finish_sky(candidates, coords):
    if not candidates:
        raise ValueError("No usable cutouts could be verified at these coordinates. Retry or choose another infrared view.")
    groups = [[item for item in candidates if item["visit"] == visit]
              for visit in sorted(set(item["visit"] for item in candidates))]

    def score(combination):
        waves = [item["fitsMetadata"]["wavelength"] for item in combination]
        widths = [item["fitsMetadata"]["bandwidth"] for item in combination]
        if any(value is None for value in waves + widths):
            return (float("inf"), -sum(item["coverage"] for item in combination))
        spread = (max(waves) - min(waves)) / max(min(widths), 1e-8)
        return (spread, -sum(item["coverage"] for item in combination))

    epochs = list(min(product(*groups), key=score))
    epochs.sort(key=lambda item: item["date"])
    grid, sky = sky_grid(coords)
    size = sky.shape[0]
    corners = grid.pixel_to_world([-.5, size - .5, size - .5, -.5, -.5],
                                 [-.5, -.5, size - .5, size - .5, -.5])
    matched = len(epochs) > 1 and score(epochs)[0] <= 1
    note = "Images share a fixed north-up sky grid and brightness scale. Dark pixels have no usable measurement."
    if len(epochs) > 1 and not matched:
        note += " Wavelengths differ between visits, so brightness differences can include spectral effects."
    note += " Some flagged bright-source pixels are retained for visual inspection. Check FITS flags before measuring changes."
    return json.dumps({"coords": coords, "matchedWavelengths": matched,
                       "footprint": [[float(ra), float(dec)] for ra, dec in zip(corners.ra.deg, corners.dec.deg)],
                       "images": [{key: epoch[key] for key in ("date", "source", "id", "coverage", "fitsMetadata")} for epoch in epochs],
                       "cube": {"width": size, "height": size, "pixelScaleArcsec": 6.2, "unit": "MJy/sr",
                                "bands": [{"wavelength": None, "detector": None}], "epochs": epochs,
                                "flagNames": epochs[0]["flagNames"], "note": note}}, allow_nan=False)
