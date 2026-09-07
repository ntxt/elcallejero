import { Frame, HeightField } from "./frame";
import { identity, lookAt, multiply, perspective, type Mat4, type Vec3 } from "./mat";
import {
  PICK_FS, PICK_VS, SEA_FS, SEA_VS, STREET_FS, STREET_VS, TERRAIN_FS, TERRAIN_VS,
} from "./shaders";
import type { Geometry, Terrain } from "../types";

const FOG: Vec3 = [0.043, 0.051, 0.067];

export interface CameraState {
  /** Look-at point, metres east/north of the city centre. */
  target: [number, number];
  distance: number;
  /** Radians. */
  azimuth: number;
  elevation: number;
}

export interface SceneOptions {
  exaggeration: number;
  liftScale: number;
  lineWidth: number;
}

/** Per-vía appearance, rewritten whenever a filter or a grouping changes. */
export interface StreetStyle {
  colour: Uint8Array;   // rgb triplets
  alpha: Uint8Array;    // 0-255 visibility
  lift: Uint8Array;     // 0-255, scaled by options.liftScale
  weight: Uint8Array;   // 0-255 line width scale
  flag: Uint8Array;     // 0-255 highlight (hover / selection)
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export class Scene {
  private gl: WebGL2RenderingContext;
  private terrainProg: WebGLProgram;
  private streetProg: WebGLProgram;
  private pickProg: WebGLProgram;
  private seaProg: WebGLProgram;

  private terrainVAO: WebGLVertexArrayObject;
  private terrainCount = 0;
  private streetVAO: WebGLVertexArrayObject;
  private pickVAO: WebGLVertexArrayObject;
  private streetCount = 0;
  private seaVAO: WebGLVertexArrayObject;

  private styleTex: WebGLTexture;
  private paramTex: WebGLTexture;
  private styleW = 256;
  private styleH = 1;
  private styleData: Uint8Array;
  private paramData: Uint8Array;

  private pickFBO: WebGLFramebuffer | null = null;
  private pickTex: WebGLTexture | null = null;
  private pickDepth: WebGLRenderbuffer | null = null;
  private pickSize: [number, number] = [0, 0];

  private maxHeight: number;
  private extent: number;
  private dirty = true;
  private raf = 0;

  camera: CameraState;
  options: SceneOptions = { exaggeration: 2.2, liftScale: 0, lineWidth: 1.7 };

  constructor(
    private canvas: HTMLCanvasElement,
    terrain: Terrain,
    heights: Float32Array,
    geometry: Geometry[],
    streetCountTotal: number,
    centre: [number, number],
  ) {
    const gl = canvas.getContext("webgl2", {
      antialias: true, alpha: false, powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    this.terrainProg = link(gl, TERRAIN_VS, TERRAIN_FS);
    this.streetProg = link(gl, STREET_VS, STREET_FS);
    this.pickProg = link(gl, PICK_VS, PICK_FS);
    this.seaProg = link(gl, SEA_VS, SEA_FS);

    const frame = new Frame(centre[0], centre[1]);
    const field = new HeightField(heights, terrain.w, terrain.h, terrain.bbox);
    this.maxHeight = terrain.max;

    const [bx0, by0, bx1, by1] = terrain.bbox;
    this.extent = Math.max(
      Math.abs(frame.x(bx1) - frame.x(bx0)), Math.abs(frame.y(by1) - frame.y(by0)),
    );

    this.terrainVAO = this.buildTerrain(terrain, heights, frame);
    const built = this.buildStreets(geometry, frame, field);
    this.streetVAO = built.vao;
    this.pickVAO = built.pickVao;
    this.streetCount = built.count;
    this.seaVAO = this.buildSea(frame, terrain);

    this.styleH = Math.ceil(streetCountTotal / this.styleW);
    this.styleData = new Uint8Array(this.styleW * this.styleH * 4);
    this.paramData = new Uint8Array(this.styleW * this.styleH * 4);
    this.styleTex = this.makeDataTexture();
    this.paramTex = this.makeDataTexture();

    this.camera = {
      target: [0, 0],
      distance: this.extent * 1.15,
      azimuth: -0.35,
      elevation: 0.62,
    };

    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // --- buffers -------------------------------------------------------

  private makeDataTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.styleW, this.styleH, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
  }

  private buildTerrain(t: Terrain, heights: Float32Array, frame: Frame) {
    const gl = this.gl;
    const { w, h } = t;
    const [x0, y0, x1, y1] = t.bbox;
    const pos = new Float32Array(w * h * 3);
    const nor = new Float32Array(w * h * 3);
    const dx = (frame.x(x1) - frame.x(x0)) / (w - 1);
    const dy = (frame.y(y0) - frame.y(y1)) / (h - 1);   // rows run north to south

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 3;
        pos[k] = frame.x(x0) + i * dx;
        pos[k + 1] = frame.y(y1) + j * dy;
        pos[k + 2] = heights[j * w + i];
      }
    }
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const l = heights[j * w + Math.max(i - 1, 0)];
        const r = heights[j * w + Math.min(i + 1, w - 1)];
        const u = heights[Math.max(j - 1, 0) * w + i];
        const d = heights[Math.min(j + 1, h - 1) * w + i];
        const nx = (l - r) / (2 * dx);
        const ny = (d - u) / (2 * Math.abs(dy));
        const len = Math.hypot(nx, ny, 1) || 1;
        const k = (j * w + i) * 3;
        nor[k] = nx / len; nor[k + 1] = ny / len; nor[k + 2] = 1 / len;
      }
    }

    const idx = new Uint32Array((w - 1) * (h - 1) * 6);
    let o = 0;
    for (let j = 0; j < h - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    this.terrainCount = idx.length;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    this.attrib(this.terrainProg, "aPos", pos, 3);
    this.attrib(this.terrainProg, "aNormal", nor, 3);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return vao;
  }

  private buildStreets(geometry: Geometry[], frame: Frame, field: HeightField) {
    const gl = this.gl;
    let segments = 0;
    for (const f of geometry) for (const line of f.l) segments += line.length - 1;

    const pos = new Float32Array(segments * 4 * 3);
    const next = new Float32Array(segments * 4 * 3);
    const side = new Float32Array(segments * 4);
    const id = new Float32Array(segments * 4);
    const idx = new Uint32Array(segments * 6);

    let v = 0, q = 0;
    for (const f of geometry) {
      for (const line of f.l) {
        for (let i = 0; i < line.length - 1; i++) {
          const [alon, alat] = line[i];
          const [blon, blat] = line[i + 1];
          const ax = frame.x(alon), ay = frame.y(alat), az = field.at(alon, alat);
          const bx = frame.x(blon), by = frame.y(blat), bz = field.at(blon, blat);
          for (let c = 0; c < 4; c++) {
            const atA = c < 2;
            const o = (v + c) * 3;
            pos[o] = atA ? ax : bx; pos[o + 1] = atA ? ay : by; pos[o + 2] = atA ? az : bz;
            next[o] = atA ? bx : ax; next[o + 1] = atA ? by : ay; next[o + 2] = atA ? bz : az;
            side[v + c] = c % 2 === 0 ? -1 : 1;
            id[v + c] = f.i;
          }
          idx[q++] = v; idx[q++] = v + 1; idx[q++] = v + 2;
          idx[q++] = v + 2; idx[q++] = v + 1; idx[q++] = v + 3;
          v += 4;
        }
      }
    }

    const make = (prog: WebGLProgram) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      this.attrib(prog, "aPos", pos, 3);
      this.attrib(prog, "aNext", next, 3);
      this.attrib(prog, "aSide", side, 1);
      this.attrib(prog, "aId", id, 1);
      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return vao;
    };
    return { vao: make(this.streetProg), pickVao: make(this.pickProg), count: idx.length };
  }

  private buildSea(frame: Frame, t: Terrain) {
    const gl = this.gl;
    const [x0, y0, x1, y1] = t.bbox;
    const pad = this.extent * 1.6;
    const ax = frame.x(x0) - pad, bx = frame.x(x1) + pad;
    const ay = frame.y(y0) - pad, by = frame.y(y1) + pad;
    const quad = new Float32Array([ax, ay, bx, ay, ax, by, bx, ay, bx, by, ax, by]);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    this.attrib(this.seaProg, "aPos", quad, 2);
    gl.bindVertexArray(null);
    return vao;
  }

  private attrib(prog: WebGLProgram, name: string, data: Float32Array, size: number) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  // --- state ---------------------------------------------------------

  setStyle(style: StreetStyle) {
    const gl = this.gl;
    const n = style.alpha.length;
    for (let i = 0; i < n; i++) {
      this.styleData[i * 4] = style.colour[i * 3];
      this.styleData[i * 4 + 1] = style.colour[i * 3 + 1];
      this.styleData[i * 4 + 2] = style.colour[i * 3 + 2];
      this.styleData[i * 4 + 3] = style.alpha[i];
      this.paramData[i * 4] = style.lift[i];
      this.paramData[i * 4 + 1] = style.weight[i];
      this.paramData[i * 4 + 2] = style.flag[i];
    }
    gl.bindTexture(gl.TEXTURE_2D, this.styleTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.styleW, this.styleH,
      gl.RGBA, gl.UNSIGNED_BYTE, this.styleData);
    gl.bindTexture(gl.TEXTURE_2D, this.paramTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.styleW, this.styleH,
      gl.RGBA, gl.UNSIGNED_BYTE, this.paramData);
    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  private tick() {
    this.raf = 0;
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  }

  private matrices(width: number, height: number): Mat4 {
    const c = this.camera;
    const ce = Math.cos(c.elevation), se = Math.sin(c.elevation);
    const eye: Vec3 = [
      c.target[0] + c.distance * ce * Math.sin(c.azimuth),
      c.target[1] - c.distance * ce * Math.cos(c.azimuth),
      c.distance * se + 60,
    ];
    const view = lookAt(eye, [c.target[0], c.target[1], 0], [0, 0, 1]);
    const proj = perspective(
      (38 * Math.PI) / 180, width / height,
      Math.max(c.distance * 0.005, 20), c.distance * 8 + this.extent * 4,
    );
    return multiply(proj, view);
  }

  private drawScene(mvp: Mat4, width: number, height: number, picking: boolean) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!picking) {
      gl.useProgram(this.seaProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.seaProg, "uMVP"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(this.seaProg, "uFogDist"), this.extent * 1.1);
      gl.uniform3fv(gl.getUniformLocation(this.seaProg, "uFog"), FOG);
      gl.bindVertexArray(this.seaVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.useProgram(this.terrainProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.terrainProg, "uMVP"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(this.terrainProg, "uExag"), this.options.exaggeration);
      gl.uniform1f(gl.getUniformLocation(this.terrainProg, "uMaxH"), this.maxHeight);
      gl.uniform1f(gl.getUniformLocation(this.terrainProg, "uFogDist"), this.extent * 1.1);
      gl.uniform3fv(gl.getUniformLocation(this.terrainProg, "uFog"), FOG);
      gl.uniform3fv(gl.getUniformLocation(this.terrainProg, "uLight"), [0.42, 0.55, 0.72]);
      gl.bindVertexArray(this.terrainVAO);
      gl.drawElements(gl.TRIANGLES, this.terrainCount, gl.UNSIGNED_INT, 0);
    }

    const prog = picking ? this.pickProg : this.streetProg;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uMVP"), false, mvp);
    gl.uniform2f(gl.getUniformLocation(prog, "uResolution"), width, height);
    gl.uniform1f(gl.getUniformLocation(prog, "uExag"), this.options.exaggeration);
    gl.uniform1f(gl.getUniformLocation(prog, "uLift"), this.options.liftScale);
    gl.uniform1f(gl.getUniformLocation(prog, "uBaseWidth"),
      this.options.lineWidth * (window.devicePixelRatio || 1));
    gl.uniform1i(gl.getUniformLocation(prog, "uStyleW"), this.styleW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.styleTex);
    gl.uniform1i(gl.getUniformLocation(prog, "uStyle"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paramTex);
    gl.uniform1i(gl.getUniformLocation(prog, "uParams"), 1);
    gl.bindVertexArray(picking ? this.pickVAO : this.streetVAO);
    gl.depthMask(!picking ? false : true);
    gl.drawElements(gl.TRIANGLES, this.streetCount, gl.UNSIGNED_INT, 0);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(Math.round(this.canvas.clientWidth * dpr), 1);
    const height = Math.max(Math.round(this.canvas.clientHeight * dpr), 1);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.drawScene(this.matrices(width, height), width, height, false);
  }

  /** Index of the vía under a client-space point, or -1. */
  pick(x: number, y: number): number {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(Math.round(this.canvas.clientWidth * dpr), 1);
    const height = Math.max(Math.round(this.canvas.clientHeight * dpr), 1);

    if (!this.pickFBO || this.pickSize[0] !== width || this.pickSize[1] !== height) {
      if (this.pickFBO) {
        gl.deleteFramebuffer(this.pickFBO);
        gl.deleteTexture(this.pickTex!);
        gl.deleteRenderbuffer(this.pickDepth!);
      }
      this.pickFBO = gl.createFramebuffer();
      this.pickTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.pickTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.pickDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, this.pickTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER, this.pickDepth);
      this.pickSize = [width, height];
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFBO);
    gl.disable(gl.BLEND);
    this.drawScene(this.matrices(width, height), width, height, true);
    const px = new Uint8Array(4);
    gl.readPixels(Math.round(x * dpr), height - Math.round(y * dpr), 1, 1,
      gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.invalidate();
    if (px[3] === 0) return -1;
    return px[0] | (px[1] << 8) | (px[2] << 16);
  }

  /** World-space extent, used to frame the initial camera. */
  get worldExtent() { return this.extent; }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    const ext = this.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}

export { identity };
