// Shader preserved from the approved white-rift preview.
export const WHITE_RIFT_FRAGMENT = `precision highp float;
uniform vec2 size; uniform float time; uniform float opacity;
uniform float spotCount; uniform float density; uniform float spotSize;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.04+4.7;a*=.5;}return v;}
vec3 tint(float n){return .55+.36*cos(6.28318*(vec3(.10,.42,.72)+n));}
void main(){
 vec2 uv=gl_FragCoord.xy/size, q=(uv-.5)*vec2(size.x/size.y,1.);float t=time;
 // Large-scale fluid displacement keeps the colour suspended in the white layer.
 vec2 flow=vec2(fbm(q*1.8+vec2(t*.065,t*-.045)),fbm(q*1.8+vec2(4.2-t*.05,t*.08)))-.5;
 vec2 w=q+flow*.43;
 vec3 c=vec3(.988,.989,.996);
 for(int i=0;i<24;i++){
   if(float(i)>=spotCount)break;
   float k=float(i),phase=t*(.22+.013*k)+k*2.4;
   vec2 center=vec2(sin(phase*.71+k)*.78,cos(phase*.57+k*1.6)*.47);
   vec2 d=w-center;
   float ang=k*1.9+t*(.09-.02*mod(k,3.));
   d=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*d;
   float width=.22+.12*sin(k*1.3+1.);
   vec2 radius=vec2(width,.13+width*.3)*spotSize;
   float fog=exp(-dot(d/radius,d/radius)*1.3);
   float breathe=.34+.66*pow(.5+.5*sin(t*.5+k*2.1),2.);
   c=mix(c,tint(k*.142+t*.014),clamp(fog*breathe*.37*density,0.,1.));
 }
 // Intersecting translucent spectral folds with soft edges, never a hard rainbow stripe.
 for(int i=0;i<3;i++){
   float k=float(i),x=w.x*cos(k*1.1+.4)-w.y*sin(k*1.1+.4);
   float y=w.y*cos(k*1.1+.4)+w.x*sin(k*1.1+.4);
   float path=y-sin(x*2.7+t*.25+k*2.)*.16-sin(x*5.-t*.18+k)*.05;
   path-=(sin(t*.19+k*2.)*.32);
   float edge=exp(-pow(path/(.035*spotSize),2.));
   float veil=exp(-pow((path+.07)/(.13*spotSize),2.));
   float gate=(.5+.5*sin(t*.38+k*2.3))*density*min(spotCount/8.,1.);
   c=mix(c,tint(x*.3+k*.27+t*.018),veil*gate*.18);
   float fringe=exp(-pow((path-.025)/(.019*spotSize),2.))*exp(-pow(x/.85,2.));
   c=mix(c,tint(x*.4+k*.23+t*.026),fringe*gate*.12);
   c+=vec3(.032,.035,.038)*edge*gate;
 }
 // Gentle white bloom through the moving veils, without grain or speckling.
 float light=pow(fbm(w*2.2+vec2(-t*.04,t*.025)),3.);
 c=mix(c,vec3(1.),light*.5);
 gl_FragColor=vec4(clamp(c,0.,1.),opacity);
}`;
