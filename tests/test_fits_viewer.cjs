"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const htmlPath = path.join(__dirname, "..", "fits_viewer.html");
const html = fs.readFileSync(htmlPath, "utf8");
const scriptMatch = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
if (!scriptMatch) throw new Error("No inline script found in fits_viewer.html");
const sandbox = { module: { exports: {} }, TextDecoder };
vm.runInNewContext(scriptMatch[1], sandbox, { filename: "fits_viewer.inline.js" });
const viewer = sandbox.module.exports;

const FITS_BLOCK = 2880;
const FITS_CARD = 80;

function assertClose(actual, expected, tolerance = 1e-9, message = "") {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function fitsCard(key, value) {
  let rendered;
  if (typeof value === "string") rendered = `'${value.replace(/'/g, "''")}'`;
  else if (value === true) rendered = "T";
  else if (value === false) rendered = "F";
  else if (typeof value === "number" && Number.isFinite(value)) rendered = String(value);
  else throw new TypeError(`Unsupported FITS card value for ${key}`);
  return `${key.padEnd(8, " ")}= ${rendered}`.padEnd(FITS_CARD, " ").slice(0, FITS_CARD);
}

function fitsHeader(cards) {
  const content = cards.map(([key, value]) => fitsCard(key, value)).join("") + "END".padEnd(FITS_CARD, " ");
  return Buffer.from(content.padEnd(Math.ceil(content.length / FITS_BLOCK) * FITS_BLOCK, " "), "ascii");
}

function primaryHdu() {
  return fitsHeader([
    ["SIMPLE", true],
    ["BITPIX", 8],
    ["NAXIS", 0],
    ["EXTEND", true]
  ]);
}

function imageHdu({ axes, bitpix = -32, values, header = {} }) {
  const count = axes.reduce((product, length) => product * length, 1);
  if (values.length !== count) throw new Error(`Expected ${count} values, received ${values.length}`);
  const bytesPerValue = Math.abs(bitpix) / 8;
  const cards = [
    ["XTENSION", "IMAGE"],
    ["BITPIX", bitpix],
    ["NAXIS", axes.length],
    ...axes.map((length, index) => [`NAXIS${index + 1}`, length]),
    ["PCOUNT", 0],
    ["GCOUNT", 1],
    ...Object.entries(header)
  ];
  const data = Buffer.alloc(Math.ceil(count * bytesPerValue / FITS_BLOCK) * FITS_BLOCK);
  for (let index = 0; index < count; index++) {
    const offset = index * bytesPerValue;
    const value = values[index];
    if (bitpix === 8) data.writeUInt8(value, offset);
    else if (bitpix === 16) data.writeInt16BE(value, offset);
    else if (bitpix === 32) data.writeInt32BE(value, offset);
    else if (bitpix === 64) data.writeBigInt64BE(BigInt(value), offset);
    else if (bitpix === -32) data.writeFloatBE(value, offset);
    else if (bitpix === -64) data.writeDoubleBE(value, offset);
    else throw new TypeError(`Unsupported BITPIX=${bitpix}`);
  }
  return Buffer.concat([fitsHeader(cards), data]);
}

function fitsFile(...hdus) {
  const buffer = Buffer.concat(hdus);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function tanHeader(overrides = {}) {
  return {
    CTYPE1: "RA---TAN",
    CTYPE2: "DEC--TAN",
    CUNIT1: "deg",
    CUNIT2: "deg",
    CRPIX1: 41,
    CRPIX2: 31,
    CRVAL1: 150,
    CRVAL2: 60,
    CD1_1: -0.1 / 3600,
    CD1_2: 0,
    CD2_1: 0,
    CD2_2: 0.1 / 3600,
    ...overrides
  };
}

test("big-endian FITS integers honor BSCALE and BZERO", () => {
  const buffer = fitsFile(
    primaryHdu(),
    imageHdu({
      axes: [3, 2],
      bitpix: 16,
      values: [-4, -2, 0, 2, 4, 100],
      header: { BSCALE: 0.25, BZERO: 100 }
    })
  );
  const fits = viewer.parseFits(buffer);
  const image = viewer.readImage(fits, 1);
  assert.equal(image.width, 3);
  assert.equal(image.height, 2);
  assert.deepEqual(Array.from(image.data), [99, 99.5, 100, 100.5, 101, 125]);
});

test("multiple HDUs retain alignment and cube plane selection uses plane data", () => {
  const buffer = fitsFile(
    primaryHdu(),
    imageHdu({ axes: [2, 2], values: [-1, 2, -3, 4], header: { EXTNAME: "SCI" } }),
    imageHdu({ axes: [2, 2, 2], values: [1, 2, 3, 4, 10, 20, 30, 40], header: { EXTNAME: "CUBE" } })
  );
  const fits = viewer.parseFits(buffer);
  assert.equal(fits.hdus.length, 3);
  assert.deepEqual(Array.from(fits.hdus, hdu => viewer.isImageHdu(hdu)), [false, true, true]);
  assert.deepEqual(Array.from(viewer.readImage(fits, 1).data), [-1, 2, -3, 4]);

  const firstPlane = viewer.readImage(fits, 2, 0);
  const secondPlane = viewer.readImage(fits, 2, 1);
  assert.equal(firstPlane.planeCount, 2);
  assert.equal(secondPlane.plane, 1);
  assert.deepEqual(Array.from(firstPlane.data), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(secondPlane.data), [10, 20, 30, 40]);
  assert.throws(() => viewer.readImage(fits, 2, 2), /Cube 平面/);
  assert.throws(() => viewer.readImage(fits, 0), /不是可直接读取的图像/);
});

test("synthetic FITS dimensions and CRPIX/CRVAL define the reference pixel", () => {
  const header = tanHeader({ CRPIX1: 4, CRPIX2: 3, CRVAL1: 123.456, CRVAL2: -45.25 });
  const buffer = fitsFile(primaryHdu(), imageHdu({ axes: [7, 5], values: new Array(35).fill(0), header }));
  const image = viewer.readImage(viewer.parseFits(buffer), 1);
  assert.equal(image.width, 7);
  assert.equal(image.height, 5);
  assert.equal(image.planeCount, 1);

  const wcs = viewer.createWCS(image.header);
  assert.deepEqual(Array.from(wcs.crpix), [4, 3]);
  assert.deepEqual(Array.from(wcs.crval), [123.456, -45.25]);
  const reference = viewer.pixelToSky(wcs, 3, 2); // Exported pixel coordinates are zero-based.
  assertClose(reference.ra, 123.456, 1e-12);
  assertClose(reference.dec, -45.25, 1e-12);
});

test("TAN WCS local East and North follow the CD matrix at Dec = 60 deg", () => {
  const wcs = viewer.createWCS(tanHeader());
  const x = 40;
  const y = 30;
  const reference = viewer.pixelToSky(wcs, x, y);
  assertClose(reference.ra, 150, 1e-12);
  assertClose(reference.dec, 60, 1e-12);

  const directions = viewer.localSkyDirections(wcs, x, y);
  assertClose(directions.east[0], -1, 1e-7); // CD1_1 < 0: increasing x points West.
  assertClose(directions.east[1], 0, 1e-7);
  assertClose(directions.north[0], 0, 1e-6); // One-pixel TAN finite differences have a small cross-term.
  assertClose(directions.north[1], 1, 1e-7);

  const onePixelRight = viewer.skyOffsets(reference, viewer.pixelToSky(wcs, x + 1, y));
  assertClose(onePixelRight.east, -0.1, 1e-7); // Raw delta RA is -0.2 arcsec at Dec = 60 deg.
  assertClose(onePixelRight.north, 0, 1e-7);
});

test("skyDeltas reports raw delta RA without a cos(Dec) factor", () => {
  const reference = { ra: 150, dec: 60 };
  const sky = { ra: 150 + 1 / 3600, dec: 60 + 2 / 3600 };
  const delta = viewer.skyDeltas(reference, sky);
  assertClose(delta.ra, 1, 1e-10);
  assertClose(delta.dec, 2, 1e-10);

  const offset = viewer.skyOffsets(reference, sky);
  assertClose(offset.east, 0.5, 1e-10);
  assertClose(offset.north, 2, 1e-10);
});

test("GalfitS position angle is North through East and modulo 180 deg", () => {
  const wcs = viewer.createWCS(tanHeader({ CRVAL2: 0 }));
  const x = 40;
  const y = 30;
  assertClose(viewer.positionAngleFromVector(wcs, x, y, 0, 1), 0, 1e-7);
  assertClose(viewer.positionAngleFromVector(wcs, x, y, 1, 0), 90, 1e-7);
  assertClose(viewer.positionAngleFromVector(wcs, x, y, 1, -1), 45, 1e-7); // Southwest, modulo 180.
  assertClose(viewer.positionAngleFromVector(wcs, x, y, -1, -1), 135, 1e-7); // Southeast.
});

test("arcsinh normalization matches anchors and both extended branches", () => {
  const min = 2;
  const max = 200;
  const frac = 0.4;
  assertClose(viewer.normalizeImageValue(0, min, max, frac), 0);
  assertClose(viewer.normalizeImageValue(min, min, max, frac), frac);
  assertClose(viewer.normalizeImageValue(max, min, max, frac), 1);
  assertClose(viewer.normalizeImageValue(-min, min, max, frac), -frac);
  assertClose(viewer.normalizeImageValue(-max, min, max, frac), -1);

  const middle = 20;
  const expected = frac + (1 - frac) * (Math.asinh(middle) - Math.asinh(min)) / (Math.asinh(max) - Math.asinh(min));
  assertClose(viewer.normalizeImageValue(middle, min, max, frac), expected, 1e-12);
  assertClose(viewer.normalizeImageValue(middle + 7, min, max, frac, 7), expected, 1e-12);
  assert.ok(Number.isNaN(viewer.normalizeImageValue(NaN, min, max, frac)));
});

test("Sersic concentration inversion recovers n and reports search limits", () => {
  for (const expected of [0.75, 1, 2, 4, 5.5]) {
    const concentration = viewer.sersicConcentration(expected);
    const result = viewer.estimateSersicIndex(concentration);
    assertClose(result.n, expected, 1e-7, `failed to recover Sersic n=${expected}`);
    assert.equal(result.limit, 0);
  }

  const lower = viewer.estimateSersicIndex(viewer.sersicConcentration(0.5));
  const upper = viewer.estimateSersicIndex(viewer.sersicConcentration(6));
  assert.equal(lower.n, 0.5);
  assert.equal(lower.limit, -1);
  assert.equal(upper.n, 6);
  assert.equal(upper.limit, 1);
  assert.ok(Number.isNaN(viewer.estimateSersicIndex(1).n));
});

test("synthetic elliptical Gaussian recovers Re, q, and Gaussian Sersic n", () => {
  const width = 181;
  const height = 181;
  const cx = 90;
  const cy = 90;
  const sigmaMajor = 12;
  const sigmaMinor = 6;
  const theta = 25 * Math.PI / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const data = new Float32Array(width * height);
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const major = cos * dx + sin * dy;
      const minor = -sin * dx + cos * dy;
      const exponent = -0.5 * ((major / sigmaMajor) ** 2 + (minor / sigmaMinor) ** 2);
      const noise = (2 * random() - 1) * 0.01;
      data[y * width + x] = 5 + 200 * Math.exp(exponent) + noise;
    }
  }

  const result = viewer.estimateGeometry({ data, width, height }, cx, cy, 60);
  const expectedRe = sigmaMajor * Math.sqrt(2 * Math.LN2);
  assertClose(result.cx, cx, 0.03);
  assertClose(result.cy, cy, 0.03);
  assertClose(result.re, expectedRe, 0.35, `expected Re near ${expectedRe}, received ${result.re}`);
  assertClose(result.q, sigmaMinor / sigmaMajor, 0.025, `expected q near 0.5, received ${result.q}`);
  assertClose(result.n, 0.5, 0.08, `expected Gaussian n near 0.5, received ${result.n}`);
});
