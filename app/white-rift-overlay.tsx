"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { WHITE_RIFT_SETTINGS } from "./chapter02-white-rift";
import { WHITE_RIFT_FRAGMENT } from "./white-rift-shader";

export type WhiteRiftOverlayHandle = { setOpacity: (opacity: number) => void };

/** One visual owner. Fully clear removes hit testing and releases the WebGL resources. */
export const WhiteRiftOverlay = forwardRef<WhiteRiftOverlayHandle, { paused: boolean }>(function WhiteRiftOverlay({ paused }, ref) {
  const [opacity, setOpacity] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const visible = opacity > 0;
  useImperativeHandle(ref, () => ({ setOpacity: value => setOpacity(Math.max(0, Math.min(1, value))) }), []);
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: false, antialias: false });
    if (!canvas || !gl) return; // The same white backing remains usable without WebGL.
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, frame = 0;
    const release = () => { cancelAnimationFrame(frame); if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)); };
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
      return shader;
    };
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, WHITE_RIFT_FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("White rift shader link failed");
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const size = gl.getUniformLocation(program, "size"), time = gl.getUniformLocation(program, "time");
      gl.uniform1f(gl.getUniformLocation(program, "opacity"), 1);
      gl.uniform1f(gl.getUniformLocation(program, "spotCount"), WHITE_RIFT_SETTINGS.spotCount);
      gl.uniform1f(gl.getUniformLocation(program, "density"), WHITE_RIFT_SETTINGS.density);
      gl.uniform1f(gl.getUniformLocation(program, "spotSize"), WHITE_RIFT_SETTINGS.spotSize);
      let previous = performance.now(), elapsed = 0;
      const draw = (now: number) => {
        if (!pausedRef.current) elapsed += Math.max(0, Math.min((now - previous) / 1000, .05));
        previous = now;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
        gl.uniform2f(size, width, height); gl.uniform1f(time, elapsed); gl.drawArrays(gl.TRIANGLES, 0, 6);
        frame = requestAnimationFrame(draw);
      };
      draw(performance.now());
    } catch (error) { console.warn("[WhiteRift] Using white fallback", error); release(); }
    return release;
  }, [visible]);
  return <div className="white-rift-overlay" aria-hidden="true" data-opacity={opacity.toFixed(3)}
    data-input-blocking={visible ? "true" : "false"} style={{ opacity, visibility: visible ? "visible" : "hidden" }}>
    <canvas ref={canvasRef} />
  </div>;
});
