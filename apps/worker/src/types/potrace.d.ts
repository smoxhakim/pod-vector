// Minimal typings for the parts of potrace@2 / jimp@0.14 we use.
declare module 'potrace' {
  import type Jimp from 'jimp';
  interface PotraceOptions {
    threshold?: number;
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    blackOnWhite?: boolean;
  }
  export class Potrace {
    constructor(options?: PotraceOptions);
    loadImage(target: Jimp, callback: (err: Error | null) => void): void;
    getPathTag(fillColor?: string, scale?: { x: number; y: number }): string;
  }
}

declare module 'jimp' {
  export default class Jimp {
    constructor(bitmap: { data: Buffer; width: number; height: number });
    bitmap: { data: Buffer; width: number; height: number };
  }
}
