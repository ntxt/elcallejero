/** The same local metric frame the pipeline uses, so metres agree end to end. */
export const R_LAT_M = 111132;

export class Frame {
  readonly mx: number;
  constructor(readonly lon0: number, readonly lat0: number) {
    this.mx = R_LAT_M * Math.cos((lat0 * Math.PI) / 180);
  }
  x(lon: number) { return (lon - this.lon0) * this.mx; }
  y(lat: number) { return (lat - this.lat0) * R_LAT_M; }
}

/** Bilinear sampler over the baked heightfield, in lon/lat. */
export class HeightField {
  constructor(
    readonly data: Float32Array,
    readonly w: number,
    readonly h: number,
    readonly bbox: [number, number, number, number],
  ) {}

  /** Rows run north to south, matching how the tiles were assembled. */
  at(lon: number, lat: number): number {
    const [x0, y0, x1, y1] = this.bbox;
    const fx = ((lon - x0) / (x1 - x0)) * (this.w - 1);
    const fy = ((y1 - lat) / (y1 - y0)) * (this.h - 1);
    const cx = Math.min(Math.max(fx, 0), this.w - 1);
    const cy = Math.min(Math.max(fy, 0), this.h - 1);
    const ix = Math.floor(cx), iy = Math.floor(cy);
    const jx = Math.min(ix + 1, this.w - 1), jy = Math.min(iy + 1, this.h - 1);
    const tx = cx - ix, ty = cy - iy;
    const a = this.data[iy * this.w + ix], b = this.data[iy * this.w + jx];
    const c = this.data[jy * this.w + ix], d = this.data[jy * this.w + jx];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}
