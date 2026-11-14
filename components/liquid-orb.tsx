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
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
  float t = u_time * 0.45;
  // A tall, soft drop that wobbles.
  vec3 q = p * vec3(0.92, 1.0, 1.0);
  float d = length(q) - 1.0;
  d += 0.11 * sin(2.1 * p.x + t * 1.3) * sin(2.4 * p.y + t * 0.9) * sin(1.9 * p.z + t);
  d += 0.06 * sin(3.7 * p.y - t * 1.7 + 1.3 * p.x);
  d += 0.04 * sin(4.3 * p.x + 2.0 * p.z + t * 2.1);
  return d * 0.8;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    blob(p + e.xyy) - blob(p - e.xyy),
    blob(p + e.yxy) - blob(p - e.yxy),
    blob(p + e.yyx) - blob(p - e.yyx)));
}

// What the polished surface reflects: a dark room, a warm gold light above-left,
// sea blue below, and a white window light.
vec3 environment(vec3 r) {
  vec3 col = vec3(0.008, 0.009, 0.014);
  col += vec3(1.0, 0.68, 0.28) * 1.6 * smoothstep(0.62, 0.97, dot(r, normalize(vec3(-0.55, 0.75, 0.35))));
  col += vec3(0.95, 0.62, 0.25) * 0.9 * smoothstep(0.7, 1.0, dot(r, normalize(vec3(0.8, 0.35, 0.2))));
  col += vec3(0.12, 0.32, 0.95) * 1.3 * smoothstep(0.45, 0.95, dot(r, normalize(vec3(0.1, -0.85, 0.45))));
  col += vec3(0.25, 0.75, 0.95) * 0.5 * smoothstep(0.6, 1.0, dot(r, normalize(vec3(0.7, -0.4, 0.5))));
  col += vec3(1.0) * 1.6 * smoothstep(0.975, 0.995, dot(r, normalize(vec3(-0.35, 0.55, 0.75))));
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec3 ro = vec3(0.0, 0.0, 3.7);
  vec3 rd = normalize(vec3(uv, -1.25));

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 72; i++) {
    float d = blob(ro + rd * t);
    if (d < 0.001) { hit = 1.0; break; }
    t += d;
    if (t > 6.0) break;
  }

  if (hit < 0.5) {
    // A faint glow around the shape, so it sits in the dark.
    float g = 0.22 * smoothstep(0.5, 0.33, length(uv));
    gl_FragColor = vec4(vec3(0.45, 0.5, 0.95) * g, g);
    return;
  }

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 v = -rd;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 refl = environment(reflect(rd, n));
  // Light seen through the glass: a deep blue body with a little thin-film colour.
  vec3 body = vec3(0.02, 0.03, 0.08) + 0.35 * vec3(0.1, 0.25, 0.9) * pow(max(dot(refract(rd, n, 0.75), vec3(0.0, -0.6, -0.8)), 0.0), 3.0);
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (fres * 1.2 + vec3(0.0, 0.33, 0.67)));
  vec3 col = body + refl * (0.55 + 0.45 * fres);
  col += film * fres * 0.18;
  // The bright rim from a light behind the shape.
  col += vec3(1.0, 0.95, 0.88) * pow(fres, 3.5) * 1.6;
  col = col / (1.0 + col * 0.35);
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
