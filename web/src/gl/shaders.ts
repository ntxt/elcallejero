/* GLSL ES 3.00. WebGL2 is required, chiefly for texelFetch: per-vía colour,
   visibility and lift live in a small texture that the filters rewrite, so
   changing a filter costs one 6 KB upload instead of rebuilding a 4 MB vertex
   buffer. */

export const TERRAIN_VS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
uniform mat4 uMVP;
uniform float uExag;
out float vHeight;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec3 p = vec3(aPos.xy, aPos.z * uExag);
  vHeight = aPos.z;
  vNormal = normalize(vec3(aNormal.xy * uExag, aNormal.z));
  vWorld = p;
  gl_Position = uMVP * vec4(p, 1.0);
}`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
in float vHeight;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uLight;
uniform float uMaxH;
uniform float uFogDist;
uniform vec3 uFog;
out vec4 fragColour;

/* A quiet land ramp: the terrain is context, never the subject. Sea level is
   left almost black so the coastline reads without drawing the eye. */
vec3 ramp(float t) {
  vec3 shore = vec3(0.086, 0.098, 0.117);
  vec3 low   = vec3(0.129, 0.149, 0.161);
  vec3 mid   = vec3(0.196, 0.204, 0.180);
  vec3 high  = vec3(0.271, 0.251, 0.212);
  if (t < 0.02) return mix(shore, low, t / 0.02);
  if (t < 0.35) return mix(low, mid, (t - 0.02) / 0.33);
  return mix(mid, high, clamp((t - 0.35) / 0.65, 0.0, 1.0));
}

void main() {
  // The DEM clamps sea to exactly zero, so dropping those fragments lets the
  // sea plane below show through instead of z-fighting with a flat grid.
  if (vHeight <= 0.01) discard;
  float t = clamp(vHeight / max(uMaxH, 1.0), 0.0, 1.0);
  vec3 base = ramp(t);
  vec3 n = normalize(vNormal);
  float lambert = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
  float ambient = 0.42 + 0.18 * n.z;
  vec3 col = base * (ambient + 0.85 * lambert);
  float fog = clamp(length(vWorld.xy) / uFogDist, 0.0, 1.0);
  fragColour = vec4(mix(col, uFog, fog * fog * 0.85), 1.0);
}`;

/** Screen-space extruded lines: constant pixel width whatever the camera does. */
export const STREET_VS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNext;
in float aSide;
in float aId;

uniform mat4 uMVP;
uniform vec2 uResolution;
uniform float uExag;
uniform float uLift;
uniform float uBaseWidth;
uniform sampler2D uStyle;    // rgb = colour, a = visibility
uniform sampler2D uParams;   // r = lift, g = width scale, b = flags
uniform int uStyleW;

out vec3 vColour;
out float vAlpha;
out float vFlag;

vec4 fetch(sampler2D tex, float id) {
  int i = int(id + 0.5);
  return texelFetch(tex, ivec2(i % uStyleW, i / uStyleW), 0);
}

vec3 place(vec3 p, float lift) {
  return vec3(p.xy, p.z * uExag + lift * uLift + 6.0);
}

void main() {
  vec4 style = fetch(uStyle, aId);
  vec4 param = fetch(uParams, aId);
  vColour = style.rgb;
  vAlpha = style.a;
  vFlag = param.b;

  vec3 here = place(aPos, param.r);
  vec3 there = place(aNext, param.r);
  vec4 clipHere = uMVP * vec4(here, 1.0);
  vec4 clipThere = uMVP * vec4(there, 1.0);

  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 sHere = clipHere.xy / max(clipHere.w, 1e-4) * aspect;
  vec2 sThere = clipThere.xy / max(clipThere.w, 1e-4) * aspect;
  vec2 dir = sThere - sHere;
  dir = length(dir) < 1e-7 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 offset = vec2(-dir.y, dir.x) / aspect;

  float px = uBaseWidth * (0.55 + 1.9 * param.g) * (1.0 + 1.6 * vFlag);
  gl_Position = clipHere;
  gl_Position.xy += offset * aSide * (px / uResolution.y) * clipHere.w;
}`;

export const STREET_FS = `#version 300 es
precision highp float;
in vec3 vColour;
in float vAlpha;
in float vFlag;
out vec4 fragColour;
void main() {
  if (vAlpha < 0.004) discard;
  vec3 col = mix(vColour, vec3(1.0), 0.42 * vFlag);
  fragColour = vec4(col, vAlpha);
}`;

/** Same geometry, but writing the vía index so a click can be resolved. */
export const PICK_FS = `#version 300 es
precision highp float;
in vec3 vColour;
in float vAlpha;
in float vFlag;
out vec4 fragColour;
void main() {
  if (vAlpha < 0.004) discard;
  fragColour = vec4(vColour, 1.0);
}`;

export const PICK_VS = STREET_VS.replace(
  "vColour = style.rgb;",
  `int pid = int(aId + 0.5);
  vColour = vec3(float(pid & 255), float((pid >> 8) & 255), float((pid >> 16) & 255)) / 255.0;`,
).replace("float px = uBaseWidth", "float px = (uBaseWidth + 4.0)");

export const SEA_VS = `#version 300 es
precision highp float;
in vec2 aPos;
uniform mat4 uMVP;
out vec2 vWorld;
void main() {
  vWorld = aPos;
  // A few metres below sea level, so the coastline is a clean edge rather
  // than a fight between two coplanar surfaces.
  gl_Position = uMVP * vec4(aPos, -4.0, 1.0);
}`;

export const SEA_FS = `#version 300 es
precision highp float;
in vec2 vWorld;
uniform float uFogDist;
uniform vec3 uFog;
out vec4 fragColour;
void main() {
  float fog = clamp(length(vWorld) / uFogDist, 0.0, 1.0);
  vec3 sea = vec3(0.043, 0.063, 0.094);
  fragColour = vec4(mix(sea, uFog, fog * fog * 0.85), 1.0);
}`;
