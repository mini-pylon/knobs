// Texture pass: draws the cloud frame (rendered offscreen at the quality
// profile's resolution) to the canvas at full resolution, with one global
// texture over sky and shape alike. Patterns are sized in CSS pixels (px is
// device pixels per CSS pixel), so they look the same at any resolution and in
// a high-res shot. Edits here hot-swap like shader.js.
// Sun beams are drawn here too, under the texture: the cloud pass writes its
// coverage to alpha, and each pixel looks toward the sun through it.
// Birds go in first, under the beams and the texture: their layer (drawn by
// the renderer from birds.js) holds each bird's coverage, how far behind the
// shapes it flies, and its haze; the cloud's coverage hides birds behind it.

// Texture names, in the shader's mode order. animated: redrawn at 24 fps even
// while the cloud frame is still.
export const textures = ['none', 'grain', 'paper', 'linen', 'scanlines', 'vignette', 'leak', 'dust', 'dither', 'halftone', 'riso', 'posterize', 'hatch', 'fringe'];
export const animatedTextures = ['grain', 'scanlines', 'leak', 'dust'];

export const postSource = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D scene;
uniform vec2 size;      // the render target, device pixels
uniform float px;       // device pixels per CSS pixel
uniform float time;     // seconds
uniform float mode;     // index into textures (post.js)
uniform float strength; // 0..2, 1 is the designed amount
uniform float beams;       // sun beam strength, 0..2 (0: none)
uniform vec2 sunDir;       // toward the sun on screen, unit length in aspect-corrected units
uniform float beamLength;  // how far each pixel looks toward the sun, in screen heights
uniform float beamStreaks; // 0: an even wash of light, 1: separate shafts
uniform sampler2D birds;   // premultiplied: r behind, g haze, a coverage
uniform float birdsOn;     // 0: no birds, skip the layer

float hash12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y);}
float fbm2(vec2 p){return noise2(p)*.55+noise2(p*2.03+7.1)*.3+noise2(p*4.11+3.7)*.15;}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
mat2 rot2(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
// Ordered dither thresholds without arrays or bit operations.
float bayer2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
float bayer4(vec2 a){return bayer2(a*.5)*.25+bayer2(a);}
float bayer8(vec2 a){return bayer4(a*.5)*.25+bayer2(a);}
// Sun beams: from st, step toward the sun and add up how much cloud is in the
// way. Clear paths get warm light, blocked ones fall into shadow, so light
// streams through the gaps and shadow shafts trail behind each shape. A slow
// streak pattern across the beams splits the light into shafts.
vec3 beamsAt(vec3 c,vec2 st){
  if(beams<.001)return c;
  vec2 asp=vec2(size.x/size.y,1.);
  vec2 stepv=sunDir/asp*beamLength/24.;
  vec2 p=st+stepv*hash12(gl_FragCoord.xy);
  float lit=0.,w=0.,decay=1.;
  for(int i=0;i<24;i++){
    p+=stepv;
    vec2 inside=step(vec2(0),p)*step(p,vec2(1));
    lit+=(1.-texture(scene,p).a*inside.x*inside.y)*decay;
    w+=decay;
    decay*=.94;
  }
  lit/=w;
  vec2 q=st*asp;
  float across=dot(q,vec2(-sunDir.y,sunDir.x)),along=dot(q,sunDir);
  float streak=noise2(vec2(across*11.+time*.05,along*.5-time*.02))*.65+noise2(vec2(across*27.-time*.03,along*.8))*.35;
  streak=mix(1.,smoothstep(.3,.85,streak)*1.6,beamStreaks);
  float self=texture(scene,st).a;
  float toward=smoothstep(-.9,.7,dot(q-asp*.5,sunDir)); // stronger on the sun's side
  c+=vec3(1.,.82,.58)*lit*streak*toward*(1.-.6*self)*.16*beams;
  c*=1.-(1.-lit)*.24*beams*(1.-.5*self)*toward;
  return c;
}
// Birds over the colour c at st, where the cloud covers cover of the pixel. A
// bird behind the shapes shows only where the cloud is clear; far birds fade
// toward the colour behind them.
vec3 birdsAt(vec3 c,float cover,vec2 st){
  if(birdsOn<.5)return c;
  vec4 b=texture(birds,st);
  if(b.a<.002)return c;
  float behind=b.r/b.a,haze=b.g/b.a;
  vec3 bird=mix(vec3(.15,.16,.2),c,haze);
  return mix(c,bird,b.a*(1.-behind*cover));
}
vec3 sceneOf(vec2 s){vec4 t=texture(scene,s);return birdsAt(t.rgb,t.a,s);}
vec3 sceneAt(vec2 fc){vec2 s=clamp(fc*px/size,0.,1.);return beamsAt(sceneOf(s),s);}
// One round dot of a halftone screen: the cell grid turned by angle, cell
// pitch in CSS pixels, dot area from the tone t (0 none, 1 full) sampled at the
// cell centre by the caller. Returns ink coverage 0..1, antialiased.
vec2 cellCentre(vec2 fc,float angle,float pitch){vec2 g=rot2(angle)*fc/pitch;return rot2(-angle)*((floor(g)+.5)*pitch);}
float dotInk(vec2 fc,float angle,float pitch,float t){
  vec2 g=rot2(angle)*fc/pitch;
  float d=length(fract(g)-.5)*pitch;
  float r=sqrt(clamp(t,0.,1.))*pitch*.62;
  return 1.-smoothstep(r-.6,r+.6,d);
}
float hatchLine(vec2 fc,float angle,float period,float wobble){
  vec2 q=rot2(angle)*fc;
  float v=q.y+wobble*(noise2(q*vec2(.02,.02))-.5)*4.;
  float d=abs(fract(v/period)-.5)*period;
  return 1.-smoothstep(.35,1.1,d);
}

void main(){
  vec2 fc=gl_FragCoord.xy/px; // CSS pixels from the bottom left
  vec2 st=gl_FragCoord.xy/size;
  vec3 c=beamsAt(sceneOf(st),st);
  float L=luma(c);
  float k=strength;
  float aspect=size.x/size.y;
  float frame=floor(time*24.);
  vec3 outc=c;
  if(mode<.5){
    outc=c;
  }else if(mode<1.5){ // grain: animated film grain, strongest in the mid-tones
    float n=hash12(floor(fc)+frame*vec2(17.31,41.73))+hash12(floor(fc*.5)+frame*vec2(5.17,29.9))-1.;
    outc=c+n*.075*k*(.35+.65*4.*L*(1.-L));
  }else if(mode<2.5){ // paper: still paper tooth, lit from the upper left, with soft blotches
    float h0=fbm2(fc*.45),hx=fbm2((fc+vec2(1,0))*.45),hy=fbm2((fc+vec2(0,1))*.45);
    float shade=(hx-h0)*-1.+(hy-h0);
    float blotch=fbm2(fc*.012)-.5;
    float fibre=noise2(vec2(fc.x*.06,fc.y*.9))-.5;
    outc=c*(1.+k*(shade*.35+blotch*.07+fibre*.025))*mix(vec3(1),vec3(1.,.985,.955),k);
  }else if(mode<3.5){ // linen: a fine over-under weave with uneven threads
    float a=sin(fc.x*2.1+2.5*noise2(vec2(fc.y*.04,1.3)));
    float b=sin(fc.y*2.1+2.5*noise2(vec2(fc.x*.04,8.7)));
    float over=step(0.,sin(fc.x*1.05)*sin(fc.y*1.05));
    float slub=noise2(vec2(fc.x*.07,floor(fc.y/3.)))*over+noise2(vec2(floor(fc.x/3.),fc.y*.07))*(1.-over);
    outc=c*(1.+k*(.05*mix(a,b,over)+.06*(slub-.5)));
  }else if(mode<4.5){ // scanlines: CRT lines, a faint aperture grille and a slow rolling band
    float s=.5+.5*cos(fc.y*6.2832/3.);
    float col=mod(floor(gl_FragCoord.x/max(px,1.)),3.);
    vec3 grille=vec3(col<.5?1.:.9,col>.5&&col<1.5?1.:.9,col>1.5?1.:.9);
    float roll=smoothstep(.0,.08,.08-abs(fract(st.y*.6-time*.07)-.5))*.06;
    outc=c*mix(vec3(1),(.8+.2*s)*grille,min(k,1.))+roll*k;
  }else if(mode<5.5){ // vignette: darker toward the corners
    float d=length((st-.5)*vec2(aspect,1.))/length(vec2(aspect,1.)*.5);
    outc=c*(1.-.34*k*smoothstep(.35,1.1,d));
  }else if(mode<6.5){ // leak: a warm light leak drifting along the left edge, a faint rose one at the right
    float drift=noise2(vec2(st.y*1.6,time*.06));
    float g=exp(-max(st.x+.08*sin(time*.11)-.02,0.)*4.)*(.45+.55*drift);
    float g2=exp(-max(1.-st.x,0.)*7.)*smoothstep(.2,1.,1.-st.y)*.5*noise2(vec2(st.y*2.,time*.05+9.));
    vec3 leak=vec3(1.,.48,.2)*g+vec3(1.,.35,.45)*g2;
    outc=1.-(1.-c)*(1.-clamp(leak*.75*k,0.,1.));
  }else if(mode<7.5){ // dust: film specks and the odd hairline scratch, new every film frame
    float f=floor(time*12.);
    vec2 cell=floor(fc/70.);
    float h=hash12(cell+f*13.7);
    vec2 at=(cell+vec2(hash12(cell+f*3.1),hash12(cell+f*5.9)))*70.;
    float r=.6+2.2*hash12(cell+f*7.3);
    float speck=(1.-smoothstep(r-.5,r+.5,length(fc-at)))*step(.9,h);
    float sx=hash12(vec2(f,1.7))*size.x/px+6.*sin(fc.y*.013+f);
    float scratch=step(.72,hash12(vec2(f,4.2)))*(1.-smoothstep(.2,.9,abs(fc.x-sx)));
    float flick=1.+.03*(hash12(vec2(f,9.1))-.5);
    float dark=step(.5,hash12(cell+f*2.3));
    outc=c*flick;
    outc=mix(outc,dark>.5?outc*.35:outc+.35,speck*min(k,1.));
    outc=mix(outc,outc+.25,scratch*.6*min(k,1.));
  }else if(mode<8.5){ // dither: 2px pixels, ordered dither into four sky colours
    float cellPx=2.;
    vec2 g=floor(fc/cellPx);
    float t=luma(sceneAt((g+.5)*cellPx));
    t=clamp((t-.38)/.52,0.,1.)*3.+bayer8(g)-.5;
    float lv=clamp(floor(t+.5),0.,3.);
    vec3 p0=vec3(.2,.28,.36),p1=vec3(.47,.53,.61),p2=vec3(.85,.66,.52),p3=vec3(.98,.88,.76);
    vec3 q=lv<.5?p0:lv<1.5?p1:lv<2.5?p2:p3;
    outc=mix(c,q,min(k,1.));
  }else if(mode<9.5){ // halftone: one ink of round dots on warm paper, screen at 45 degrees
    float pitch=6.;
    vec2 cc=cellCentre(fc,.785,pitch);
    float t=clamp((.84-luma(sceneAt(cc)))/.42,0.,1.)*.9;
    float ink=dotInk(fc,.785,pitch,t);
    vec3 paper=vec3(.96,.93,.87),inkc=vec3(.2,.28,.36);
    outc=mix(c,mix(paper,inkc,ink),min(k,1.));
  }else if(mode<10.5){ // riso: blue and orange inks as halftones at different angles, a little out of register
    float pitch=5.;
    vec2 ca=cellCentre(fc,.26,pitch),cb=cellCentre(fc+vec2(1.6,-1.1),1.31,pitch);
    vec3 sa=sceneAt(ca),sb=sceneAt(cb-vec2(1.6,-1.1));
    float ta=clamp((sa.b-sa.r*.55-.05)*1.6+(1.-luma(sa))*.4,0.,1.)*.75;
    float tb=clamp((sb.r-sb.b*.7)*2.6,0.,1.)*.8;
    float grit=(noise2(fc*.9)-.5)*.25;
    float ia=dotInk(fc,.26,pitch,ta+grit),ib=dotInk(fc+vec2(1.6,-1.1),1.31,pitch,tb+grit);
    vec3 paper=vec3(.96,.94,.9);
    vec3 r=paper*mix(vec3(1),vec3(.18,.4,.75),ia)*mix(vec3(1),vec3(1.,.55,.28),ib);
    outc=mix(c,r,min(k,1.));
  }else if(mode<11.5){ // posterize: flat bands of tone, keeping each band's hue
    float lv=5.;
    float q=floor(L*lv+.5)/lv;
    outc=mix(c,c*(q/max(L,.001)),min(k,1.));
  }else if(mode<12.5){ // hatch: pencil cross-hatching, denser in the shadows, on tinted paper
    float t=clamp((.84-L)/.6,0.,1.);
    float h=hatchLine(fc,.785,5.,1.)*smoothstep(.12,.3,t);
    h=max(h,hatchLine(fc,-.785,5.,1.)*smoothstep(.4,.58,t));
    h=max(h,hatchLine(fc,0.,4.,1.)*smoothstep(.68,.85,t));
    h*=.75+.25*noise2(fc*.15);
    vec3 paper=mix(vec3(.96,.94,.9),c,.3),lead=vec3(.23,.26,.31);
    outc=mix(c,mix(paper,lead,h),min(k,1.));
  }else{ // fringe: red and blue pulled apart toward the edges, like a cheap lens
    vec2 off=(st-.5)*2.*6.*k*px/size; // up to 6 CSS px at the edges
    outc=vec3(beamsAt(sceneOf(st+off),st+off).r,c.g,beamsAt(sceneOf(st-off),st-off).b);
  }
  outc+=(hash12(gl_FragCoord.xy+fract(time)*91.)-.5)/255.; // breaks 8-bit banding in smooth gradients
  color=vec4(clamp(outc,0.,1.),1.); // the cloud pass's alpha is its coverage, not transparency
}`;
