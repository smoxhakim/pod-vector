import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { PotraceVectorizerEngine, VectorizeError } from './engine';
import { inspectSvg, isTrueVector } from './validate';

// Ground truth: a flat 4-colour logo drawn as SVG, rasterized with anti-aliasing.
const logoSvg = (size: number, background: string | null) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 800 800">
  ${background ? `<rect width="800" height="800" fill="${background}"/>` : ''}
  <circle cx="400" cy="330" r="230" fill="#1d3557"/>
  <polygon points="400,150 445,280 580,280 470,360 510,490 400,410 290,490 330,360 220,280 355,280" fill="#e9c46a"/>
  <rect x="150" y="600" width="500" height="120" rx="30" fill="#e63946"/>
  <rect x="220" y="630" width="360" height="60" rx="10" fill="#ffffff"/>
</svg>`;

const png = (size: number, bg: string | null) => sharp(Buffer.from(logoSvg(size, bg))).png().toBuffer();
const jpeg = (size: number) => sharp(Buffer.from(logoSvg(size, '#ffffff'))).jpeg({ quality: 72 }).toBuffer();

/** Mean absolute per-channel error between the source and the rendered SVG, over white. */
async function renderError(source: Buffer, svg: string): Promise<number> {
  const ref = await sharp(source).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const out = await sharp(Buffer.from(svg))
    .resize(ref.info.width, ref.info.height)
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer();
  let sum = 0;
  for (let i = 0; i < ref.data.length; i++) sum += Math.abs(ref.data[i] - out[i]);
  return sum / ref.data.length;
}

const engine = new PotraceVectorizerEngine();

describe('PotraceVectorizerEngine (logo mode)', () => {
  it('traces a clean PNG into exactly its flat colours, accurately', async () => {
    const source = await png(800, '#ffffff');
    const result = await engine.vectorize(source, 'logo', {});
    assert.deepEqual([...result.colors].sort(), ['#1d3557', '#e63946', '#e9c46a', '#ffffff']);
    assert.equal(result.width, 800);
    assert.ok(isTrueVector(result.svg));
    assert.ok((await renderError(source, result.svg)) < 0.6, 'rendered SVG should match the source closely');
    assert.ok(result.svg.length < 15_000, `compact output (got ${result.svg.length} bytes)`);
  });

  it('keeps transparency: nothing is drawn where the source is transparent', async () => {
    const source = await png(800, null);
    const result = await engine.vectorize(source, 'logo', {});
    assert.equal(result.colors.length, 4);
    const { data } = await sharp(Buffer.from(result.svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0, 'top-left corner stays transparent');
  });

  it('does not turn JPEG artifacts into extra colours', async () => {
    const source = await jpeg(800);
    const result = await engine.vectorize(source, 'logo', {});
    assert.equal(result.colors.length, 4, `got ${result.colors.join(', ')}`);
    assert.ok((await renderError(source, result.svg)) < 1.5);
  });

  it('honours colorCount', async () => {
    const result = await engine.vectorize(await png(400, '#ffffff'), 'logo', { colorCount: 2 });
    assert.ok(result.colors.length <= 2);
  });

  it('downscales huge images for tracing but keeps source dimensions', async () => {
    const result = await engine.vectorize(await png(4000, '#ffffff'), 'logo', {});
    assert.match(result.svg, /width="4000" height="4000" viewBox="0 0 4000 4000"/);
    assert.equal(result.colors.length, 4);
  });

  it('rejects unsupported modes and fully transparent images', async () => {
    await assert.rejects(engine.vectorize(await png(100, '#fff'), 'illustration', {}), VectorizeError);
    const empty = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    await assert.rejects(engine.vectorize(empty, 'logo', {}), /fully transparent/);
  });
});

describe('true-vector validator', () => {
  it('accepts real geometry', () => {
    assert.ok(isTrueVector('<svg><path d="M0 0L10 10Z" fill="#000"/></svg>'));
  });

  it('rejects rasters wrapped in SVG, however they are smuggled in', () => {
    assert.equal(isTrueVector('<svg><image href="a.png" width="10" height="10"/></svg>'), false);
    assert.equal(isTrueVector('<svg><path d="M0 0L1 1Z"/><image href="data:image/png;base64,AAAA"/></svg>'), false);
    assert.equal(isTrueVector('<svg><rect style="fill:url(data:image/png;base64,AA)"/></svg>'), false);
    assert.equal(isTrueVector('<svg><foreignObject><img src="x.png"/></foreignObject></svg>'), false);
  });

  it('rejects SVGs with no geometry', () => {
    assert.equal(isTrueVector('<svg></svg>'), false);
    assert.equal(inspectSvg('<svg><path d=""/></svg>').shapeCount, 0);
  });
});
