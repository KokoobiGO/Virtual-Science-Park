"use client";

import { cn } from "cn";
import { useEffect, useRef } from "react";

/**
 * Decorative: a glossy, slowly changing liquid shape for the landing hero.
 * A small WebGL shader ray-marches a wobbling blob and lights it like polished
 * glass: a bright rim, warm gold light from above, sea blue from below.
 * Without WebGL it falls back to a soft CSS glow. It holds still for readers
 * who ask for reduced motion, and pauses while off screen.
 */
export function LiquidOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) {
      fallbackRef.current?.removeAttribute("hidden");
      return;
    }
    const program = buildProgram(gl);
    if (!program) {
      fallbackRef.current?.removeAttribute("hidden");
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_res");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !still) frame = requestAnimationFrame(draw);
    });
    io.observe(canvas);

    const start = performance.now();
    let frame = 0;
    function draw(now: number) {
      gl!.uniform1f(uTime, still ? 4 : (now - start) / 1000);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      if (!still && visible) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className={cn("pointer-events-none relative aspect-square", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <div
        ref={fallbackRef}
        hidden
        className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_40%_30%,oklch(0.85_0.1_80/0.7),oklch(0.45_0.15_255/0.6)_45%,transparent_70%)] blur-xl"
      />
    </div>
  );
}

const VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;

float blob(vec3 p) {
  float t = u_time * 0.4;
  // A wide, soft dome that wobbles slowly.
  vec3 q = p * vec3(0.88, 0.97, 1.0);
  float d = length(q) - 1.0;
  d += 0.12 * sin(1.9 * p.x + t * 1.2) * sin(2.2 * p.y + t * 0.8) * sin(1.7 * p.z + t);
  d += 0.05 * sin(3.1 * p.y - t * 1.5 + 1.4 * p.x);
  d += 0.03 * sin(4.1 * p.x + 2.0 * p.z + t * 1.9);
  return d * 0.7;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    blob(p + e.xyy) - blob(p - e.xyy),
    blob(p + e.yxy) - blob(p - e.yxy),
    blob(p + e.yyx) - blob(p - e.yyx)));
}

float lamp(vec3 r, vec3 dir, float a, float b) {
  return smoothstep(a, b, dot(r, normalize(dir)));
}

// What the polished surface reflects: a black studio with warm gold lamps on
// both sides and above, and a deep blue light below.
vec3 environment(vec3 r) {
  vec3 col = vec3(0.004, 0.004, 0.006);
  // Softboxes with crisp edges, so the reflections read as polished glass, not fog.
  col += vec3(1.0, 0.64, 0.22) * 3.0 * lamp(r, vec3(-0.92, 0.35, 0.15), 0.55, 0.62);
  col += vec3(1.0, 0.7, 0.3) * 2.4 * lamp(r, vec3(0.94, 0.15, 0.2), 0.58, 0.65);
  col += vec3(1.0, 0.9, 0.7) * 3.0 * lamp(r, vec3(-0.35, 0.95, 0.25), 0.9, 0.93);
  col += vec3(0.1, 0.32, 1.0) * 2.0 * lamp(r, vec3(0.05, -1.0, 0.3), 0.7, 0.85);
  col += vec3(1.0, 0.75, 0.4) * 0.25 * lamp(r, vec3(0.0, 0.6, -0.8), 0.2, 0.9);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec3 ro = vec3(0.0, 0.0, 3.7);
  vec3 rd = normalize(vec3(uv, -1.25));

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 80; i++) {
    float d = blob(ro + rd * t);
    if (d < 0.0008) { hit = 1.0; break; }
    t += d;
    if (t > 6.0) break;
  }
  if (hit < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 v = -rd;
  float facing = max(dot(n, v), 0.0);
  float fres = pow(1.0 - facing, 2.0);

  // The body: almost black, with blue light glowing deep inside near the bottom.
  vec3 col = vec3(0.012, 0.011, 0.014);
  col += vec3(0.08, 0.3, 1.0) * 1.1 * pow(facing, 1.6) * smoothstep(0.2, -0.8, p.y);
  col += vec3(0.6, 0.35, 0.12) * 0.12 * pow(facing, 3.0);

  // Reflections, strong at grazing angles like real glass.
  col += environment(reflect(rd, n)) * (0.02 + 1.3 * pow(1.0 - facing, 2.6));
  // A thin film of colour at the edge, and the bright white rim.
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (fres * 1.4 + vec3(0.0, 0.33, 0.67)));
  col += film * pow(fres, 2.0) * 0.12;
  col += vec3(1.0, 0.97, 0.92) * pow(1.0 - facing, 7.0) * 2.4;

  col = col / (1.0 + col * 0.45);
  col = pow(col, vec3(0.9));
  gl_FragColor = vec4(col, 1.0);
}
`;

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  return program;
}
