// 曲速退出「筆刷拉痕」：沿船艙頭尾方向把整個遊戲畫面抹成一條條長短不一的拖痕（邊緣羽化）。
// 參數來自已確認的預覽（output/warp-exit-preview/saved-params.json）；粗細、羽化、長度都以畫面高度換算，
// 不受解析度影響。白色裂縫負責時間軸：淡入時 0 → 1，淡出時 1 → 0（Chapter02WhiteRift 的 setSmear）。

export const WARP_EXIT_SMEAR_SETTINGS = {
  /** 拉痕方向角度（度，畫面座標，順時針；35° = 往右下的船尾方向） */
  angleDegrees: 35,
  /** 拉痕最長長度（畫面短邊的比例） */
  length: 0.5,
  /** 各條長短落差（0 = 一樣長） */
  variance: 0.5,
  /** 筆痕平均粗細（畫面高度的比例；預覽 24px / 1178px） */
  thickness: 24 / 1178,
  /** 拖痕濃度（越高拖痕越實、越長） */
  trail: 0.4,
  /** 筆痕上下邊緣羽化（畫面高度的比例；預覽 16 CSS px） */
  edge: 24 / 1178,
  /** 1 = 往船尾拖，-1 = 往船頭拖 */
  direction: 1,
  /** 筆痕分布的亂數種子 */
  seed: 336854705 % 9973,
} as const;

/** 抹開時沿拖痕取樣的點數 */
const SAMPLES = 40;

export const WARP_EXIT_SMEAR_FRAGMENT = `precision highp float;
uniform sampler2D frame;
uniform vec2 size;
uniform float amount, angle, lengthPx, variance, thickness, trail, edge, direction, seed;
float hash(float n){return fract(sin(n*12.9898+seed*78.233)*43758.5453);}
float noise(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(hash(i+101.),hash(i+102.),f);}
float bandLength(float i){return lengthPx*amount*(1.-variance+variance*pow(hash(i),1.6));}
// 畫布上傳時第 0 列是畫面最上方，所以 y 不用翻轉
vec3 sampleAt(vec2 p){return texture2D(frame,p/size).rgb;}
void main(){
  // 畫面座標（左上原點、y 向下），axis = 拉痕方向，v = 垂直拉痕方向的位置
  vec2 p=vec2(gl_FragCoord.x,size.y-gl_FragCoord.y);
  vec2 axis=vec2(cos(angle),sin(angle));
  vec2 normal=vec2(-axis.y,axis.x);
  vec3 base=sampleAt(p);
  if(amount<=0.){gl_FragColor=vec4(base,1.);return;}
  // 粗細不一：沿垂直方向輕微扭動筆痕邊界
  float v=dot(p,normal);
  v+=(noise(v/(thickness*3.))-.5)*thickness*1.3;
  float b=v/thickness, i=floor(b), f=fract(b);
  // 邊緣羽化：靠近邊界時和相鄰筆痕的長度平滑銜接
  float e=clamp(edge/thickness,.001,.5);
  float len=bandLength(i);
  len=mix((bandLength(i-1.)+len)*.5,len,smoothstep(0.,e,f));
  len=mix(len,(len+bandLength(i+1.))*.5,smoothstep(1.-e,1.,f));
  // 沿拖痕往上游取樣：越遠權重越低（拖痕濃度越高衰減越慢）
  float falloff=mix(4.5,.6,trail);
  vec3 sum=vec3(0.);float total=0.;
  for(int k=0;k<${SAMPLES};k++){
    float s=float(k)/${SAMPLES - 1}.;
    float w=exp(-s*falloff);
    sum+=sampleAt(p-axis*direction*len*s)*w;
    total+=w;
  }
  vec3 smeared=sum/total;
  gl_FragColor=vec4(mix(base,smeared,clamp(amount*1.25,0.,1.)),1.);
}`;

/**
 * 把來源畫布（遊戲主畫面）經筆刷拉痕濾鏡畫到自己的 WebGL 畫布。
 * 沒有 WebGL 時 render() 回傳 false，呼叫端維持原畫面即可。
 */
export class WarpExitSmearRenderer {
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private shaders: WebGLShader[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!this.gl) return;
    try {
      this.setup(this.gl);
    } catch (error) {
      console.warn("[WarpExitSmear] WebGL 濾鏡無法使用，維持原畫面", error);
      this.dispose();
    }
  }

  private setup(gl: WebGLRenderingContext) {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      this.shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, WARP_EXIT_SMEAR_FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Warp exit smear shader link failed");
    this.program = program;
    gl.useProgram(program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const name of ["frame", "size", "amount", "angle", "lengthPx", "variance", "thickness", "trail", "edge", "direction", "seed"]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    const settings = WARP_EXIT_SMEAR_SETTINGS;
    gl.uniform1i(this.uniforms.frame, 0);
    gl.uniform1f(this.uniforms.angle, settings.angleDegrees * Math.PI / 180);
    gl.uniform1f(this.uniforms.variance, settings.variance);
    gl.uniform1f(this.uniforms.trail, settings.trail);
    gl.uniform1f(this.uniforms.direction, settings.direction);
    gl.uniform1f(this.uniforms.seed, settings.seed);
  }

  render(source: HTMLCanvasElement, amount: number): boolean {
    const gl = this.gl;
    if (!gl || !this.program || source.width === 0 || source.height === 0) return false;
    if (this.canvas.width !== source.width || this.canvas.height !== source.height) {
      this.canvas.width = source.width;
      this.canvas.height = source.height;
    }
    const { width, height } = this.canvas;
    const settings = WARP_EXIT_SMEAR_SETTINGS;
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform2f(this.uniforms.size, width, height);
    gl.uniform1f(this.uniforms.amount, Math.max(0, Math.min(1, amount)));
    gl.uniform1f(this.uniforms.lengthPx, settings.length * Math.min(width, height));
    gl.uniform1f(this.uniforms.thickness, Math.max(1, settings.thickness * height));
    gl.uniform1f(this.uniforms.edge, settings.edge * height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    for (const shader of this.shaders) gl.deleteShader(shader);
    this.texture = null;
    this.buffer = null;
    this.program = null;
    this.shaders = [];
  }
}
