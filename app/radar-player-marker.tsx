type Vertex = [number, number];
const directions = ['北','東北','東','東南','南','西南','西','西北'];

/** Rotate on the ground plane before 45-degree projection, not a flat screen rotation. */
export function RadarPlayerMarker({direction}: {direction:number}) {
  const angle = direction * Math.PI / 4;
  const vertices: Vertex[] = [[0,-17],[10,12],[-10,12]];
  const plane = vertices.map(([x,y]):Vertex => [x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)]);
  const project = ([x,y]:Vertex,height:number):Vertex => [180+x,180+y*Math.SQRT1_2-height*Math.SQRT1_2];
  const top = plane.map(p=>project(p,5));
  const points = (p:Vertex[])=>p.map(v=>v.join(',')).join(' ');
  return <g aria-label={`玩家位置，面向${directions[direction%8]}`}>
    <ellipse cx="180" cy="184" rx="11" ry="4.5" fill="#020d14" opacity=".3" style={{filter:"blur(2px)"}}/>
    <polygon points={points(top)} fill="#92eaf2" stroke="#e4ffff" strokeWidth=".8" strokeLinejoin="round"/>
  </g>;
}
