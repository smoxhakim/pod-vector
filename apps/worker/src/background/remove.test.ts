import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { decode, detectBackground, removeColor } from './remove';

// Flat logo whose white inner bar sits inside a red pill (must survive "edges only").
const logo = (bg: string | null) => `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  ${bg ? `<rect width="400" height="400" fill="${bg}"/>` : ''}
  <circle cx="200" cy="160" r="110" fill="#1d3557"/>
  <rect x="80" y="300" width="240" height="60" rx="15" fill="#e63946"/>
  <rect x="120" y="315" width="160" height="30" fill="#ffffff"/>
</svg>`;
const png = (bg: string | null) => sharp(Buffer.from(logo(bg))).png().toBuffer();
const alphaAt = async (img: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
};
const overBlack = (img: Buffer) => sharp(img).flatten({ background: '#000' }).raw().toBuffer();

describe('detectBackground', () => {
  it('finds a solid white background', async () => {
    assert.deepEqual(detectBackground(await decode(await png('#ffffff'))), { kind: 'solid', color: [255, 255, 255] });
  });

  it('finds a solid non-white background', async () => {
    const d = detectBackground(await decode(await png('#2a9d8f')));
    assert.equal(d.kind, 'solid');
    assert.deepEqual(d.kind === 'solid' && d.color, [42, 157, 143]);
  });

  it('reports already-transparent images', async () => {
    assert.deepEqual(detectBackground(await decode(await png(null))), { kind: 'transparent' });
  });

  it('gives up on busy borders (no uniform background)', async () => {
    const gradient = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g">
      <stop offset="0" stop-color="#ff0000"/><stop offset="0.5" stop-color="#00ff00"/><stop offset="1" stop-color="#0000ff"/>
      </linearGradient></defs><rect width="200" height="200" fill="url(#g)"/></svg>`;
    const img = await sharp(Buffer.from(gradient)).png().toBuffer();
    assert.deepEqual(detectBackground(await decode(img)), { kind: 'none' });
  });
});

describe('removeColor', () => {
  it('matches a natively transparent render, with no halo on dark shirts', async () => {
    const result = await removeColor(await decode(await png('#ffffff')), { color: [255, 255, 255], tolerance: 20, contiguous: true });
    const [out, truth] = await Promise.all([overBlack(result.png), overBlack(await png(null))]);
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += Math.abs(out[i] - truth[i]);
    assert.ok(sum / out.length < 0.05, `mean error ${sum / out.length}`);
  });

  it('edges only: keeps enclosed white; everywhere: removes it', async () => {
    const raw = await decode(await png('#ffffff'));
    const edges = await removeColor(raw, { color: [255, 255, 255], tolerance: 20, contiguous: true });
    const all = await removeColor(raw, { color: [255, 255, 255], tolerance: 20, contiguous: false });
    assert.equal(await alphaAt(edges.png, 5, 5), 0, 'border background removed');
    assert.equal(await alphaAt(edges.png, 200, 330), 255, 'white bar inside the pill kept');
    assert.equal(await alphaAt(all.png, 200, 330), 0, 'white bar removed in "everywhere" mode');
    assert.ok(all.removedShare > edges.removedShare);
  });

  it('keeps design colours that are far from the key', async () => {
    const result = await removeColor(await decode(await png('#ffffff')), { color: [255, 255, 255], tolerance: 100, contiguous: true });
    assert.equal(await alphaAt(result.png, 200, 160), 255, 'navy circle untouched even at max tolerance');
  });
});
