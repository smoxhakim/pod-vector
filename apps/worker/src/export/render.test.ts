import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { prepareSvg, renderPng } from './render';

const vector = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<path fill="#e63946" d="M${w * 0.25} ${h * 0.25}L${w * 0.75} ${h * 0.25}L${w * 0.75} ${h * 0.75}L${w * 0.25} ${h * 0.75}Z"/></svg>`;

describe('prepareSvg', () => {
  it('adds an XML declaration once', () => {
    const out = prepareSvg(vector(10, 10));
    assert.match(out, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg/);
    assert.equal(prepareSvg(out).match(/<\?xml/g)?.length, 1);
  });

  it('refuses anything that is not a true vector', () => {
    assert.throws(() => prepareSvg('<svg><image href="x.png"/></svg>'), /true-vector/);
  });
});

describe('renderPng', () => {
  it('renders at exactly the source resolution', async () => {
    const { png, width, height } = await renderPng(vector(1200, 900));
    const meta = await sharp(png).metadata();
    assert.deepEqual([width, height, meta.width, meta.height], [1200, 900, 1200, 900]);
  });

  it('keeps unpainted areas transparent and painted areas opaque', async () => {
    const { png } = await renderPng(vector(400, 400));
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [...data.subarray((y * 400 + x) * 4, (y * 400 + x) * 4 + 4)];
    assert.equal(px(10, 10)[3], 0, 'corner transparent');
    assert.deepEqual(px(200, 200), [230, 57, 70, 255], 'centre is the exact fill colour');
  });

  it('refuses oversized renders with a clear message', async () => {
    await assert.rejects(renderPng(vector(10_000, 10_000)), /limited to 50 MP/);
  });
});
