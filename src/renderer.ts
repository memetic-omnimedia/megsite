/**
 * Full-screen WebGL video renderer.
 *
 * Two texture "layers" (A = current, B = incoming) are drawn by one fragment shader.
 * `uProgress` blends A → B through a noise-driven displacement wipe, used both for the
 * initial poster → video swap and for slide changes.
 */
import type { Fit } from './content';

const VERT = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uNoise;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform float uFitA;      // 0 = cover, 1 = contain
uniform float uFitB;
uniform vec2 uRes;
uniform float uTime;
uniform float uProgress;  // 0 = A, 1 = B

// UV fitting: maps screen UVs into texture UVs for cover / contain.
vec2 fitUv(vec2 uv, vec2 tex, float contain) {
  float rs = uRes.x / uRes.y;
  float rt = tex.x / tex.y;
  vec2 s = vec2(1.0);
  if (contain < 0.5) {
    if (rs > rt) s.y = rt / rs; else s.x = rs / rt;
    // Zoom in a touch so the displacement never samples past the frame edge.
    s *= 0.96;
  } else {
    if (rs > rt) s.x = rs / rt; else s.y = rt / rs;
  }
  return (uv - 0.5) * s + 0.5;
}

// Smooth tiling noise: a few octaves of a linearly-filtered random texture.
float fbm(vec2 p) {
  float n = texture2D(uNoise, p).r * 0.55;
  n += texture2D(uNoise, p * 2.03 + 0.17).r * 0.3;
  n += texture2D(uNoise, p * 4.11 + 0.41).r * 0.15;
  return n;
}

float inside(vec2 uv) {
  vec2 e = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return e.x * e.y;
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 nuv = vec2(uv.x * aspect, uv.y) * 0.35;
  float t = uTime;

  // Very slow, small ambient drift.
  vec2 drift = vec2(
    fbm(nuv + vec2(t * 0.006, t * 0.004)),
    fbm(nuv + vec2(5.2 - t * 0.005, 1.3 + t * 0.007))
  ) - 0.5;
  vec2 ambient = drift * 0.012;

  // Transition: displacement swells mid-way while a soft, low-frequency noise wipe reveals B.
  float p = uProgress;
  float swell = sin(p * 3.14159265);
  float n = texture2D(uNoise, nuv * 0.6 + 3.7).r * 0.7 + texture2D(uNoise, nuv * 1.3 + 1.1).r * 0.3;
  n = clamp((n - 0.2) / 0.6, 0.0, 1.0);
  float w = 0.3;
  float th = mix(-w, 1.0 + w, p);
  float mixB = 1.0 - smoothstep(th - w, th + w, n);

  vec2 push = drift * swell * 0.05;
  vec2 dispA = ambient + push * (1.0 - mixB);
  vec2 dispB = ambient - push * mixB;

  // Edge mask comes from undisplaced UVs, so contain-fit borders stay clean.
  float inA = max(inside(fitUv(uv, uSizeA, uFitA)), 1.0 - uFitA);
  float inB = max(inside(fitUv(uv, uSizeB, uFitB)), 1.0 - uFitB);
  vec2 uvA = clamp(fitUv(uv + dispA, uSizeA, uFitA), 0.0, 1.0);
  vec2 uvB = clamp(fitUv(uv + dispB, uSizeB, uFitB), 0.0, 1.0);
  vec3 bg = vec3(0.07, 0.04, 0.02);
  vec3 a = mix(bg, texture2D(uTexA, uvA).rgb, inA);
  vec3 b = mix(bg, texture2D(uTexB, uvB).rgb, inB);
  vec3 col = mix(a, b, mixB);

  // Warm, subtle vignette.
  float d = length((uv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0));
  col *= 1.0 - smoothstep(0.35, 0.95, d) * 0.38;

  // Fine film grain.
  float g = hash(gl_FragCoord.xy + fract(t * 7.0) * 100.0) - 0.5;
  col += g * 0.035;

  gl_FragColor = vec4(col, 1.0);
}`;

export type Source = HTMLVideoElement | HTMLImageElement;

interface Layer {
  tex: WebGLTexture;
  w: number;
  h: number;
  fit: Fit;
  source: Source | null;
  dirty: boolean;
}

type Uniforms = Record<
  'uTexA' | 'uTexB' | 'uNoise' | 'uSizeA' | 'uSizeB' | 'uFitA' | 'uFitB' | 'uRes' | 'uTime' | 'uProgress',
  WebGLUniformLocation | null
>;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private u: Uniforms;
  private a: Layer;
  private b: Layer;
  private progress = 0;
  private raf = 0;
  private running = false;
  private start = performance.now();
  private hasVfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  private onLost?: () => void;

  /** Returns null if WebGL is unavailable, so the caller can fall back. */
  static create(onLost?: () => void): Renderer | null {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    }) as WebGLRenderingContext | null;
    if (!gl) return null;
    try {
      return new Renderer(canvas, gl, onLost);
    } catch (err) {
      console.warn('[renderer] init failed, falling back', err);
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, onLost?: () => void) {
    this.canvas = canvas;
    this.gl = gl;
    this.onLost = onLost;
    canvas.className = 'stage__canvas';
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
      this.onLost?.();
    });

    const prog = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, FRAG],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    gl.useProgram(prog);

    // One oversized triangle covers the screen.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const names = ['uTexA', 'uTexB', 'uNoise', 'uSizeA', 'uSizeB', 'uFitA', 'uFitB', 'uRes', 'uTime', 'uProgress'] as const;
    this.u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Uniforms;

    this.a = this.makeLayer();
    this.b = this.makeLayer();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.makeNoise());
    gl.uniform1i(this.u.uTexA, 0);
    gl.uniform1i(this.u.uTexB, 1);
    gl.uniform1i(this.u.uNoise, 2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.resize();
  }

  private makeLayer(): Layer {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // NPOT-safe settings for WebGL1: no mipmaps, clamp.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([18, 10, 5]));
    return { tex, w: 16, h: 9, fit: 'cover', source: null, dirty: false };
  }

  /** 256² tiling random texture; smoothed in the shader by linear filtering + octaves. */
  private makeNoise(): WebGLTexture {
    const gl = this.gl;
    const size = 256;
    const data = new Uint8Array(size * size);
    // Two passes of box blur over white noise gives softer, more "atmospheric" octaves.
    const rnd = new Float32Array(size * size).map(() => Math.random());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) s += rnd[((y + dy + size) % size) * size + ((x + dx + size) % size)];
        data[y * size + x] = Math.round((s / 9) * 255);
      }
    }
    // Stretch contrast back out after blurring.
    let lo = 255, hi = 0;
    for (const v of data) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < data.length; i++) data[i] = Math.round(((data[i] - lo) / (hi - lo)) * 255);

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    return tex;
  }

  /** Put a source on layer A immediately (no transition). Used for the poster. */
  setImmediate(source: Source, fit: Fit) {
    this.assign(this.a, source, fit);
    this.progress = 0;
  }

  /**
   * Bring `source` in on layer B and animate uProgress 0 → 1. When done, B becomes A.
   * `animate` drives the progress (GSAP in the app); the renderer just reads it.
   */
  transitionTo(source: Source, fit: Fit, animate: (set: (p: number) => void, done: () => void) => void) {
    this.assign(this.b, source, fit);
    this.upload(this.b);
    this.progress = 0;
    animate(
      (p) => (this.progress = p),
      () => {
        [this.a, this.b] = [this.b, this.a];
        this.b.source = null;
        this.progress = 0;
        this.watchFrames();
      },
    );
  }

  private assign(layer: Layer, source: Source, fit: Fit) {
    layer.source = source;
    layer.fit = fit;
    layer.dirty = true;
    this.watchFrames();
  }

  /** With rVFC, mark layers dirty only when a new video frame was presented. */
  private watchFrames() {
    if (!this.hasVfc) return;
    for (const layer of [this.a, this.b]) {
      const v = layer.source;
      if (!(v instanceof HTMLVideoElement) || (v as any).__vfc) continue;
      (v as any).__vfc = true;
      const tick = () => {
        if (this.a.source !== v && this.b.source !== v) { (v as any).__vfc = false; return; }
        if (this.a.source === v) this.a.dirty = true;
        if (this.b.source === v) this.b.dirty = true;
        v.requestVideoFrameCallback(tick);
      };
      v.requestVideoFrameCallback(tick);
    }
  }

  private upload(layer: Layer) {
    const src = layer.source;
    if (!src) return;
    let w: number, h: number;
    if (src instanceof HTMLVideoElement) {
      if (src.readyState < 2) return;
      w = src.videoWidth; h = src.videoHeight;
      // Without rVFC we upload every animation frame.
      if (!this.hasVfc) layer.dirty = true;
    } else {
      if (!src.complete || !src.naturalWidth) return;
      w = src.naturalWidth; h = src.naturalHeight;
    }
    if (!layer.dirty) return;
    const gl = this.gl;
    gl.activeTexture(layer === this.a ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, layer.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    layer.w = w; layer.h = h;
    layer.dirty = src instanceof HTMLVideoElement ? !this.hasVfc : false;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  private frame = () => {
    if (!this.running) return;
    const gl = this.gl;
    // Layer textures are bound to fixed units: A → 0, B → 1.
    this.upload(this.a);
    if (this.b.source) this.upload(this.b);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.b.tex);

    gl.uniform2f(this.u.uSizeA, this.a.w, this.a.h);
    gl.uniform2f(this.u.uSizeB, this.b.w, this.b.h);
    gl.uniform1f(this.u.uFitA, this.a.fit === 'contain' ? 1 : 0);
    gl.uniform1f(this.u.uFitB, this.b.fit === 'contain' ? 1 : 0);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, (performance.now() - this.start) / 1000);
    gl.uniform1f(this.u.uProgress, this.progress);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.raf = requestAnimationFrame(this.frame);
  };

  play() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
