// Fragment shader for the cloud morph. Edits here hot-swap in the browser
// without a reload. Dispersal constants from the reference are uniforms (d*).
export const vertexSource = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=position;gl_Position=vec4(position,0.,1.);}`;

// Sky clouds for the opening, laid out here so the shader does no hashing per
// sample. Each row: centre x, y, z, size, the cloud's slot on the loop
// (degrees) that it gathers to, and how tall it is (0: a wide, flat cloud
// with low towers; 1: a narrow, towering one), and optionally 1 to make it
// the wordmark instead of a cumulus. z is depth: clouds further back (z below
// about -.6) are drawn paler and thinner, as through more air, and are made
// small, so they also drift slowly. x is where the cloud starts:
// the wind carries every cloud rightward and wraps it round a span a little
// wider than the view, so some start out of view and drift in.
const SKY_CLOUDS = [
  [-2.5, 1.15, -.5, .85, 150, .9], [1.0, 1.85, .3, .6, 65, .1], [3.2, .75, -.3, .7, 30, .55], [-.55, .35, .6, .3, 125, .7],
  [1.45, -.55, 0, .42, 320, .4], [2.2, -.3, .2, .24, 350, .2], [-3.3, -1.0, .2, .45, 205, .15], [5.0, .1, -.2, .55, 5, .75],
  [-5.0, 1.6, 0, .35, 175, .3], [-1.2, -1.5, -.4, .22, 255, .5], [-1.4, 2.0, -.2, .24, 95, .05], [3.6, -1.5, .4, .3, 290, .6],
  // Far back: small, hazy, slow.
  [-3.8, .25, -1.4, .17, 230, .3], [.35, -.95, -1.6, .14, 272, .2], [2.75, .35, -1.5, .16, 48, .6], [-2.1, -.5, -1.2, .19, 190, .1],
  [4.3, -.85, -1.35, .13, 305, .45], [-.15, 1.3, -1.1, .2, 110, .5],
  // Middle depth, and one near and overhead whose underside shows at the top.
  [-4.4, -.25, .5, .36, 162, .65], [2.6, 2.05, 1.3, 1.0, 80, .35],
];
// Wind speed in shape units per second for a cloud of size 1; bigger (nearer)
// clouds move faster.
const WIND = .1;
// The wordmark cloud's size, as wordShape's frame per unit of the cloud's
// size, and how much deeper than the wordmark it is. The shader's WORD_SCALE
// and WORD_DEPTH must match.
const WORD_SCALE = 1.0, WORD_DEPTH = 1.8;
const fract = x => x - Math.floor(x);
const hash1 = n => fract(Math.sin(n * 91.345) * 47453.5453);
// The renderer uploads these as uniform arrays (cheap to index in a loop,
// unlike constant arrays). skyTarget is each cloud's slot on the loop's centre
// line, in the same frame as loopShape after undoing its tilt.
const rot = (a, u, v) => [Math.cos(a) * u + Math.sin(a) * v, -Math.sin(a) * u + Math.cos(a) * v]; // GLSL rotate(a)*vec2(u,v)
export const skyUniforms = { skyCloud: [], skyTarget: [], skyMeta: [], skyTower: [], skyBound: [] };
SKY_CLOUDS.forEach(([x, y, z, r, slot, tall, word], i) => {
  const seed = fract(i * .618 + .13);
  const aspect = (1.1 + 1.8 * (1 - tall)) * (.85 + .3 * hash1(seed)); // flat clouds are wide
  const towers = 3 + Math.round(3 * hash1(seed + 4.4)); // 3 to 6
  const lift = .4 + 1.7 * tall; // tower height
  const speed = (.4 + r) * WIND * (.8 + .4 * hash1(seed + 2.2));
  const angle = slot * Math.PI / 180;
  let [tx, ty, tz] = [1.23 * Math.cos(angle), 1.23 * Math.sin(angle), 0];
  [tx, tz] = rot(-.2, tx, tz);
  [ty, tz] = rot(-.38, ty, tz);
  // The cloud's bounding box, in units of its size: base ellipsoid, then towers.
  let [x0, x1, y0, y1, z1] = [-aspect * .95, aspect * .95, -.18, .36, .8];
  let reach = aspect * .95; // and the radius of a sphere round it
  for (let j = 0; j < 6; j++) {
    const fj = j + seed * 13;
    const wx = (hash1(fj) - .5) * 1.5 * aspect * (j ? 1 : 1 - .8 * tall); // a tall cloud's first tower stands mid-cloud
    const centre = 1 - Math.abs(wx) / aspect; // towers grow tallest near the middle
    const rad = (.24 + .3 * hash1(fj + 3.1)) * (.6 + .55 * centre) * (.85 + .3 * tall);
    const wy = (.05 + .42 * hash1(fj + 7.7) * centre) * lift + rad * .35, wz = (hash1(fj + 1.9) - .5) * .6;
    skyUniforms.skyTower.push(wx, wy, wz, rad);
    if (j >= towers) continue;
    [x0, x1, y1, z1] = [Math.min(x0, wx - rad), Math.max(x1, wx + rad), Math.max(y1, wy + rad), Math.max(z1, Math.abs(wz) + rad)];
    reach = Math.max(reach, Math.hypot(wx, wy, wz) + rad);
  }
  if (word) { // the wordmark's box instead (wordShape spans 3.2 x .8 x .34 each way)
    [x0, x1, y0, y1, z1] = [-3.2 * WORD_SCALE, 3.2 * WORD_SCALE, -.8 * WORD_SCALE, .8 * WORD_SCALE, .34 * WORD_SCALE * WORD_DEPTH];
    reach = Math.hypot(x1, y1, z1);
  }
  skyUniforms.skyCloud.push(x, y, z, r);
  skyUniforms.skyTarget.push(tx, ty, tz, word ? -1 : towers); // -1 marks the wordmark
  // Half extents grown by the outline's noise bump, and the box centre's y.
  const pad = .3;
  skyUniforms.skyMeta.push(aspect, seed, speed, reach + pad);
  skyUniforms.skyBound.push(Math.max(-x0, x1) + pad, (y1 - y0) / 2 + pad, z1 + pad, (y1 + y0) / 2);
});
for (const key of Object.keys(skyUniforms)) skyUniforms[key] = new Float32Array(skyUniforms[key]);
// The sky-full opening: the same clouds, each size times bigger, spread times
// as far apart across the view, stretched top to bottom so the lowest sits at
// low and the highest at high (shape units; JS fits them to the canvas), and
// over depth times the depth (so the far, hazy ones come forward). Returns
// skyCloud and skyMeta for the renderer; the other sky arrays are in units of
// each cloud's size, so they still fit.
const SKY_Y0 = Math.min(...SKY_CLOUDS.map(c => c[1])), SKY_Y1 = Math.max(...SKY_CLOUDS.map(c => c[1]));
export function skyLayout({ size = 1, spread = 1, depth = 1, low = SKY_Y0, high = SKY_Y1 } = {}) {
  const cloud = new Float32Array(skyUniforms.skyCloud), meta = new Float32Array(skyUniforms.skyMeta);
  SKY_CLOUDS.forEach(([x, y, z, r], i) => {
    const r2 = r * size;
    cloud.set([x * spread, low + (y - SKY_Y0) / (SKY_Y1 - SKY_Y0) * (high - low), z * depth, r2], i * 4);
    meta[i * 4 + 2] *= (.4 + r2) / (.4 + r); // bigger clouds drift faster, as before
  });
  return { skyCloud: cloud, skyMeta: meta };
}

export const fragmentSource = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D word;
uniform vec2 size;
uniform float frameInset; // the strip at the canvas bottom the view fit leaves out (the footer), as a fraction of its height
uniform float progress;
uniform float time;
uniform float wind; // the opening sky's wind clock, in seconds (stops once the gather begins)
uniform int steps;
uniform vec2 viewAngle;
uniform float transparentBackground;
uniform float portalVariant; // Wings Portal shape: 0 tunnel, 1 gyro, 2 atom, 3 ripple, 4 infinity, 5 coil, 6 arch, 7 oval, 8 reflection, 9 disc
uniform float agentVariant;
uniform float kitsVariant; // Wings Kits shape: 0 hex nut, 1 linked rings, 2 plus, 3 blocks, 4 wing nut
uniform float skyClear; // 0..1: how much of the sky's low haze is taken away (the sky-full opening)
uniform float openingVariant; // the opening slot's shape (id 7): 0 raw block, 1 cloud planet, 2 fog wall
uniform float oBlockSize; // block: size
uniform float oRough;     // block: how uneven its faces are
uniform float oCarve;     // block: how deep the pointer carves, world units
uniform float oCarveHeal; // block: seconds a carved groove takes to fill back in
uniform float oPlanetR;   // planet: radius, shape units
uniform float oBands;     // planet: how deep the weather bands cut
uniform float oBandCount; // planet: bands from pole to pole
uniform float oSpin;      // planet: turns per minute
uniform float oTilt;      // planet: axial tilt, degrees
uniform float oFogDepth;  // fog: half the wall's thickness, shape units
uniform float oWipe;      // fog: how cleanly the pointer wipes it away, 0..1
uniform float oFogHeal;   // fog: seconds a wiped patch takes to fog back over
uniform float oBrush;     // block and fog: the pointer's radius, world units
uniform vec4 wipeTrail[24]; // the pointer's recent path over the opening: xy camera plane, z its time, w strength (0: unused)
uniform float wipeLatest;   // the time of the newest wipeTrail point (none: far in the past)
uniform float machineVariant; // Wings Machine shape: 0 crt, 1 gear, 2 gears, 3 flywheel, 4 belt, 5 turbine, 6 screen, 7 crank, 8 platters, 9 clock, 10 ripple (the portal ripple)
uniform vec4 pointer;    // xy: cursor in camera-plane units, z: disturbance strength 0..1, w: radius
uniform vec2 pointerVel; // smoothed cursor velocity, camera-plane units per second
uniform float forceBurst; // 0..1: holds dispersal at full strength on the current shape
uniform float dive;       // 0..1: an object's detail view: the shape frays into wisps that stream outward, then fades to bare sky
uniform float install;     // 0..1: morph from the scroll shape into the chat pill
uniform float chatHalfW;   // half the chat input's width, in world units
uniform float chatHalfH;   // half the chat pill's height, in world units
uniform float chatGrow;     // extra height the pill grows downward by, for the command menu, in world units
uniform float chatShift;    // how far the chat pill moves up to fit a tall reply, in world units
uniform vec4 chatChips[8];  // the reply's option pills under the chat pill: centre xy, half width, half height, in world units
uniform vec4 chatChipLook[8]; // x: how present each option pill is, 0..1 (it appears and fades as density)
uniform float chatChipCount;
// Set by chatPill() for the sample's nearest option pill, as crispMask is:
// how much calmer its surface is than the chat pill's (small pills would be
// eaten by the full noise), and how present it is.
float chatCalm=0.,chatFade=1.;
uniform float shape0;      // shape id in each scroll slot (0 wordmark, 1 loop, 2 agent, 3 portal, 4 sky (first slot only), 5 machine, 6 kits)
uniform float shape1;
uniform float shape2;
uniform float shape3;
uniform float shape4;
uniform float shape5;
uniform float shapeCount;  // how many slots are in use
// Each scroll slot's own pose and look, re-rolled by JS while the slot is out
// of view so every morph to it lands a little differently. Blended through
// each morph into pose and look (set in main()).
uniform vec4 slotPose[6];  // yaw, pitch, roll (radians), scale
uniform vec4 slotLook[6];  // multipliers: density, puff, dispersal strength, softness
vec4 pose=vec4(0,0,0,1);
vec4 look=vec4(1);

// Dispersal group.
uniform float dExpand;
uniform float dCurve;
uniform float dDrift;
uniform float dDriftScale;
uniform float dDriftSpeed;
uniform float dFracture;
uniform float dFractureScale;
uniform float dFractureBias;
uniform float dFragments;
uniform float dFragmentCut;
uniform float dFragmentSoft;
uniform float dThinning;
uniform float dSwirl;
uniform float dLift;
// Detail view dive (params.js dive group)
uniform float dvReach;  // push outward from the centre, world units (0: none)
uniform float dvDrift;  // how far eddies carry the wisps, each region its own way
uniform float dvDriftScale; // eddy frequency: low = broad masses, high = small wisps
uniform float dvLift;   // wisps rise (+) or sink (-) on screen
uniform float dvFray;   // turbulence that frays the shape into wisps
uniform float dvErode;  // ridged erosion that leaves thin sheets and filaments
uniform float dvWear;   // extra erosion toward the end, wearing the wisps away
uniform float dvFade;   // where in the dive the last of it starts to fade (0..1)
// Object hover (params.js hover group; objHover 0..1 from main.js)
uniform float objHover;  // the pointer is over a clickable object: it fluffs up
uniform float hvPuff;    // extra surface billow
uniform float hvLumps;   // extra large lumps
uniform float hvSwell;   // the surface grows outward, world units
uniform float hvSoft;    // softer edges
uniform float hvGrain;   // billow size: - bigger, + finer

// Cloud group: the look of the cloud at rest.
uniform float cDensity;
uniform float cSoftness;
uniform float cPuff;
uniform float cTexture;
uniform float cLumps;
uniform float cContrast;
uniform float cBillow;
uniform float cAbsorb;
uniform float cLight;
uniform float cShade;
uniform float cSunAz;
uniform float cSunEl;
uniform float cScale;
uniform float viewMode; // 0 cloud, 1 solid, 2 normals, 3 x-ray (faint cloud over the shape), 4 cost

float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.65+noise(p*2.04+5.)*.25+noise(p*4.13)*.1;}
float ellipsoid(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k1<.0001?-min(r.x,min(r.y,r.z)):k0*(k0-1.)/k1;}
float roundedBox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}
float smoothUnion(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float capsule(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float trapezoid(vec2 p,float r1,float r2,float he){
  vec2 k1=vec2(r2,he),k2=vec2(r2-r1,2.*he);
  p.x=abs(p.x);
  vec2 ca=vec2(p.x-min(p.x,p.y<0.?r1:r2),abs(p.y)-he);
  vec2 cb=p-k1+k2*clamp(dot(k1-p,k2)/dot(k2,k2),0.,1.);
  float s=(cb.x<0.&&ca.y<0.)?-1.:1.;
  return s*sqrt(min(dot(ca,ca),dot(cb,cb)));
}
float torusXY(vec3 p,float R,float r){return length(vec2(length(p.xy)-R,p.z))-r;}
float cylY(vec3 p,float r,float h){vec2 d=vec2(length(p.xz)-r,abs(p.y)-h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float box2(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}

// Portal: a filled disc at the loop's tilt, smaller than the loop.
float portalDisc(vec3 p){
  p.yz=rotate(.38)*p.yz;
  p.xz=rotate(.2)*p.xz;
  vec2 q=vec2(length(p.xy)-.62,abs(p.z));
  return length(max(q,0.))+min(max(q.x,q.y),0.)-.36;
}

// Portal alternative: an arched doorway cut through a cloud bank.
float doorway(vec3 p){
  p.xz=rotate(.25)*p.xz;
  float slab=roundedBox(p-vec3(0,-.1,0),vec3(1.05,.95,.26),.30);
  float rect=max(abs(p.x)-.40,max(p.y+.15,-2.-p.y));
  float arch=length(p.xy-vec2(0,-.15))-.40;
  return max(slab,-min(rect,arch));
}

// Portal (default): an open door in a small cumulus.
// The cloud is a pile of 3D puffs with a flat base, thin around the doorway so
// the opening reads as a hole. The leaf has the opening's arched outline, hangs
// on the left jamb and stands open toward the viewer; the object is turned so
// the camera sits on the side away from the hinge and sees past the leaf.
// crispMask is 1 on details that should stay smooth (the door leaf, the agent's
// face and chest); density() turns the cloud noise down there. shapeField()
// resets it.
float crispMask=0.;
float wordMask=0.; // 1 in and near the sky's wordmark cloud, set by skyShape()
float skyDepth=0.; // z of the sky cloud nearest the sample, set by skyShape()
float farMask=0.; // how far back the sample's sky cloud is (0..1), set by density()
float smoothSub(float a,float b,float k){float h=clamp(.5-.5*(a+b)/k,0.,1.);return mix(a,-b,h)+k*h*(1.-h);}
float puff(vec3 p,vec3 c,float r){vec3 d=p-c;d.z*=1.7;return (length(d)-r)*.75;}
float doorOpening(vec2 g){return min(box2(g-vec2(0,-.36),vec2(.4,.36)),max(length(g)-.4,-g.y));}
float cloudDoor(vec3 p){
  p.yz=rotate(-.12)*p.yz;
  p.xz=rotate(.5)*p.xz;
  p.x+=.3;
  float o=puff(p,vec3(.15,.42,0),.8);
  o=smoothUnion(o,puff(p,vec3(1.05,-.42,-.02),.7),.22);
  o=smoothUnion(o,puff(p,vec3(1.6,-.74,0),.42),.22);
  o=smoothUnion(o,puff(p,vec3(.72,.85,.05),.58),.22);
  o=smoothUnion(o,puff(p,vec3(-.45,.8,-.05),.5),.22);
  o=smoothUnion(o,puff(p,vec3(.1,1.12,0),.45),.22);
  o=smoothUnion(o,puff(p,vec3(.45,.3,-.3),.62),.22);
  // right jamb, so the opening is closed in down to the base
  o=smoothUnion(o,puff(p,vec3(.5,-.82,.02),.42),.2);
  o=smoothUnion(o,puff(p,vec3(.45,-.3,0),.4),.2);
  // narrow puffy column for the left jamb
  o=smoothUnion(o,puff(p,vec3(-.86,.3,0),.3),.18);
  o=smoothUnion(o,puff(p,vec3(-.86,-.3,0),.25),.18);
  o=smoothUnion(o,puff(p,vec3(-.88,-.84,0),.27),.18);
  o=max(o,-1.12-p.y);
  vec2 g=p.xy-vec2(-.25,-.4);
  float wall=max(o,-doorOpening(g));
  vec3 h=p-vec3(-.65,-.4,.17);
  h.xz=rotate(1.65)*h.xz;
  float leaf=max(doorOpening(h.xy-vec2(.4,0))+.025,abs(h.z-.05)-.055)-.015;
  float knob=length(h-vec3(.68,-.36,.17))-.07;
  float door=min(leaf,knob);
  crispMask=max(crispMask,smoothstep(-.06,.06,wall-door));
  return min(wall,door);
}
float portalVariantShape(vec3 p){return portalVariant<.5?cloudDoor(p):portalVariant<1.5?portalDisc(p):doorway(p);}

// Agent options. None has hair. Only the default (featured) has a face.
// Base: egg head, short neck, dome shoulders (mannequin)
float agentSmooth(vec3 p){
  float head=ellipsoid(p-vec3(0,.68,0),vec3(.58,.78,.56));
  float neck=ellipsoid(p-vec3(0,-.10,-.02),vec3(.24,.30,.24));
  float torso=max(ellipsoid(p-vec3(0,-.95,-.05),vec3(.92,.62,.50)),-1.36-p.y);
  return smoothUnion(smoothUnion(head,neck,.14),torso,.22);
}
// 0 smooth (default): the base bust with simple, soft, geometric features:
// round lens eyes, a short nose ridge, a straight mouth groove, a collar ring,
// a chest seam and a round badge.
float agentFeatured(vec3 p){
  float d=agentSmooth(p);
  vec3 q=vec3(abs(p.x),p.y,p.z);
  float eye=ellipsoid(q-vec3(.21,.80,.55),vec3(.11,.12,.1));
  float nose=capsule(p,vec3(0,.72,.54),vec3(0,.58,.6),.05);
  float mouth=capsule(p,vec3(-.15,.45,.53),vec3(.15,.45,.53),.05);
  vec3 c=p-vec3(0,-.40,-.02);
  c.yz=rotate(.3)*c.yz;
  float collar=length(vec2(length(c.xz)-.33,c.y))-.075;
  float seam=capsule(p,vec3(0,-.6,.33),vec3(0,-1.25,.39),.04);
  float badge=ellipsoid(p-vec3(.36,-.7,.36),vec3(.13,.13,.06));
  d=smoothUnion(d,min(nose,min(collar,badge)),.05);
  d=smoothSub(d,min(eye,min(mouth,seam)),.03);
  float feat=min(min(min(eye,nose),min(mouth,seam)),min(collar,badge));
  crispMask=max(crispMask,1.-smoothstep(0.,.16,abs(feat)));
  return d;
}
// Active variants: the smooth bust plus one animated cue.
// 1 orbit: a small sphere circling the head on a tilted path
float agentOrbit(vec3 p){
  float a=time*1.6;
  vec3 c=vec3(cos(a)*.95,.80+sin(a)*.18,sin(a)*.95);
  return min(agentSmooth(p),length(p-c)-.24);
}
// 2 halo: a ring of beads circling above the head
float agentHalo(vec3 p){
  vec3 q=p-vec3(0,1.62,0);
  q.yz=rotate(.25)*q.yz;
  float a=atan(q.z,q.x)+time*1.2;
  float seg=6.28318/6.;
  a=mod(a+seg*.5,seg)-seg*.5;
  vec2 xz=vec2(cos(a),sin(a))*length(q.xz);
  float bead=length(vec3(xz.x-.60,q.y,xz.y))-.16;
  return min(agentSmooth(p),bead);
}
// 3 pulse: rings broadcasting outward behind the head
float agentPulse(vec3 p){
  vec3 q=p-vec3(0,.68,-.45);
  float d=agentSmooth(p);
  for(int i=0;i<2;i++){
    float t=fract(time*.45+float(i)*.5);
    float ring=length(vec2(length(q.xy)-(.75+t*1.05),q.z))-.13*(1.-t);
    d=min(d,ring);
  }
  return d;
}
// 4 thinking: three puffs rising from the head, bobbing
float agentThinking(vec3 p){
  float d=agentSmooth(p);
  for(int i=0;i<3;i++){
    float f=float(i);
    vec3 c=vec3(.58+f*.36,1.25+f*.36+.06*sin(time*2.4+f*1.3),0.);
    d=min(d,length(p-c)-(.12+f*.08));
  }
  return d;
}
// 5 typing: three dots beside the head bouncing in turn
float agentTyping(vec3 p){
  float d=agentSmooth(p);
  for(int i=0;i<3;i++){
    float f=float(i);
    float hop=.20*max(sin(time*5.-f*.9),0.);
    d=min(d,length(p-vec3(1.0+f*.42,.85+hop,.15))-.16);
  }
  return d;
}
// Abstract agents: no human form. Each is a quiet, functional presence that
// shows it is active through one slow, simple motion.
// 6 caret: a soft text cursor that breathes, ready and attentive
float agentCaret(vec3 p){
  float b=1.+.06*sin(time*1.6);
  return capsule(p,vec3(0,-1.05*b,0),vec3(0,1.05*b,0),.30*b);
}
// 7 breath: one sphere slowly expanding and contracting
float agentBreath(vec3 p){
  return length(p)-(1.0+.10*sin(time*1.2));
}
// 8 surface: a dot that grows into a pill, then a card, then settles back
float agentSurface(vec3 p){
  float t=mod(time*.35,3.);
  vec3 dot=vec3(.38,.38,.38),pill=vec3(1.25,.38,.32),card=vec3(1.2,.85,.14);
  vec3 size=t<1.?mix(dot,pill,smoothstep(.15,.85,t)):t<2.?mix(pill,card,smoothstep(1.15,1.85,t)):mix(card,dot,smoothstep(2.15,2.85,t));
  float r=min(size.x,min(size.y,size.z))*.95;
  return roundedBox(p,size-r,r);
}
// 9 ellipsis: three orbs pulsing in turn, the typing cue on its own
float agentEllipsis(vec3 p){
  float d=2.;
  for(int i=0;i<3;i++){
    float f=float(i);
    d=min(d,length(p-vec3((f-1.)*1.1,0,0))-(.32+.12*max(sin(time*3.-f*1.),0.)));
  }
  return d;
}
// 10 gyro: a still core held by two slowly turning rings, poised
float agentGyro(vec3 p){
  float core=length(p)-.42;
  vec3 a=p; a.xz=rotate(time*.6)*a.xz; a.yz=rotate(1.1)*a.yz;
  vec3 b=p; b.xy=rotate(time*.45)*b.xy; b.xz=rotate(1.3)*b.xz;
  float r1=length(vec2(length(a.xy)-1.15,a.z))-.12;
  float r2=length(vec2(length(b.xy)-.85,b.z))-.11;
  return min(core,min(r1,r2));
}
// 11 relay: a small loop with a bead running around it, a process at work
float agentRelay(vec3 p){
  vec3 q=p; q.yz=rotate(.38)*q.yz; q.xz=rotate(.2)*q.xz;
  float ring=length(vec2(length(q.xy)-1.0,q.z))-.15;
  float a=time*1.4;
  float bead=length(q-vec3(cos(a),sin(a),0)*1.0)-.30;
  return min(ring,bead);
}
// Still agents from the themed sets: heaven, aviary, scientific instruments.
// No motion, and chunky parts only: the cloud noise erases anything under ~.15.

// heaven
// 12 harp: pillar, sound box, curved neck and three heavy strings
float agentHarp(vec3 p){
  float pillar=capsule(p,vec3(-1.0,-1.25,0),vec3(-1.0,1.75,0),.20);
  float box=capsule(p,vec3(-.85,-1.25,0),vec3(1.05,1.15,0),.30);
  float neck=capsule(p,vec3(-1.0,1.75,0),vec3(-.2,1.35,0),.18);
  neck=min(neck,capsule(p,vec3(-.2,1.35,0),vec3(.55,1.75,0),.18));
  neck=min(neck,capsule(p,vec3(.55,1.75,0),vec3(1.05,1.15,0),.18));
  float strings=capsule(p,vec3(-.55,-.87,0),vec3(-.55,1.52,0),.12);
  strings=min(strings,capsule(p,vec3(-.05,-.24,0),vec3(-.05,1.43,0),.12));
  strings=min(strings,capsule(p,vec3(.45,.39,0),vec3(.45,1.70,0),.12));
  float foot=roundedBox(p-vec3(-.9,-1.32,0),vec3(.28,.05,.28),.08);
  return min(smoothUnion(smoothUnion(pillar,box,.12),min(neck,foot),.1),strings);
}
// 13 halo-ring: one thick ring tipped toward the viewer, hovering
float agentHaloRing(vec3 p){
  vec3 q=p-vec3(0,.35,0);
  q.yz=rotate(1.15)*q.yz;
  return torusXY(q,1.15,.32);
}
// 14 lantern: an open-paned box around a flame, with a cap and carrying ring
float agentLantern(vec3 p){
  vec3 q=p-vec3(0,-.1,0);
  float body=roundedBox(q,vec3(.55,.68,.55),.12);
  float panes=min(roundedBox(q,vec3(.38,.52,.9),.04),roundedBox(q,vec3(.9,.52,.38),.04));
  body=max(body,-panes);
  float flame=ellipsoid(q-vec3(0,-.05,0),vec3(.30,.42,.30));
  float base=roundedBox(q-vec3(0,-.84,0),vec3(.68,.07,.68),.06);
  float cap=trapezoid(vec2(length(q.xz),q.y-1.0),.72,.22,.2)-.04;
  float ring=torusXY(q-vec3(0,1.5,0),.30,.12);
  return min(min(min(body,flame),min(base,cap)),ring);
}
// 15 gate: two pillars under a round arch on a low step, an orb on top
float agentGate(vec3 p){
  vec3 s=vec3(abs(p.x),p.y,p.z);
  float pillars=roundedBox(s-vec3(.95,-.4,0),vec3(.16,.86,.16),.08);
  vec3 a=p-vec3(0,.45,0);
  float arch=max(length(vec2(length(a.xy)-.95,a.z))-.25,-a.y);
  float base=roundedBox(p-vec3(0,-1.32,0),vec3(1.35,.06,.38),.06);
  float orb=length(p-vec3(0,1.88,0))-.22;
  return min(min(pillars,arch),min(base,orb));
}
// 16 dove: plump body, small head, raised wings and a fanned tail
float agentDove(vec3 p){
  vec3 b=p; b.xy=rotate(-.15)*b.xy;
  float body=ellipsoid(b,vec3(.85,.45,.45));
  float head=length(p-vec3(.78,.48,0))-.30;
  float beak=ellipsoid(p-vec3(1.12,.43,0),vec3(.18,.10,.10));
  vec3 t=p-vec3(-1.0,-.08,0); t.xy=rotate(.29)*t.xy;
  float tail=ellipsoid(t,vec3(.50,.16,.34));
  vec3 w1=p-vec3(-.2,.85,.28); w1.xy=rotate(2.0)*w1.xy;
  vec3 w2=p-vec3(-.3,.80,-.26); w2.xy=rotate(2.3)*w2.xy;
  float wings=min(ellipsoid(w1,vec3(.75,.30,.16)),ellipsoid(w2,vec3(.70,.28,.16)));
  float d=smoothUnion(smoothUnion(body,head,.18),min(beak,tail),.12);
  return smoothUnion(d,wings,.12);
}
// 17 trumpet: looped tubing, three valves and a flared bell
float agentTrumpet(vec3 p){
  float pipe=capsule(p,vec3(-1.55,.15,0),vec3(.35,.15,0),.17);
  float lower=capsule(p,vec3(-1.0,-.4,0),vec3(.1,-.4,0),.17);
  float bends=max(torusXY(p-vec3(.1,-.125,0),.275,.17),.1-p.x);
  bends=min(bends,max(torusXY(p-vec3(-1.0,-.125,0),.275,.17),p.x+1.0));
  float t=clamp((p.x-.35)/1.45,0.,1.);
  float bell=max(length(p.yz-vec2(.15,0))-(.17+.63*t*t*t),max(.35-p.x,p.x-1.8))*.5;
  float rim=length(vec2(length(p.yz-vec2(.15,0))-.8,p.x-1.8))-.1;
  float valves=2.;
  for(int i=0;i<3;i++){
    float x=-.65+float(i)*.3;
    valves=min(valves,capsule(p,vec3(x,-.5,0),vec3(x,.5,0),.14));
    valves=min(valves,length(p-vec3(x,.62,0))-.17);
  }
  float mouth=length(p-vec3(-1.62,.15,0))-.2;
  return min(min(min(pipe,lower),min(bends,bell)),min(min(rim,valves),mouth));
}

// aviary
// 18 birdcage: domed bars on a round base, a small bird inside, a hook on top
float agentBirdcage(vec3 p){
  vec3 q=p-vec3(0,-.1,0);
  float rxz=length(q.xz);
  float seg=6.28318/8.;
  float a=mod(atan(q.z,q.x)+seg*.5,seg)-seg*.5;
  vec2 l=vec2(cos(a),sin(a))*rxz;
  float side=length(vec2(l.x-.9,max(max(-1.0-q.y,q.y-.4),0.)));
  vec2 v=vec2(l.x,q.y-.4);
  float dome=(v.x>=0.&&v.y>=0.)?abs(length(v)-.9):min(length(v-vec2(.9,0)),length(v-vec2(0,.9)));
  float bars=length(vec2(min(side,dome),l.y))-.12;
  float base=cylY(q-vec3(0,-1.1,0),1.0,.1)-.05;
  float hoop=length(vec2(rxz-.9,q.y+.3))-.1;
  float hook=min(length(q-vec3(0,1.36,0))-.16,torusXY(q-vec3(0,1.66,0),.2,.1));
  float bird=smoothUnion(ellipsoid(q-vec3(0,-.45,0),vec3(.36,.25,.25)),length(q-vec3(.26,-.2,0))-.17,.1);
  return min(min(min(bars,base),min(hoop,hook)),bird);
}
// 19 nest: a woven bowl holding three eggs
float agentNest(vec3 p){
  vec3 q=(p-vec3(0,-.2,0))/1.3;
  q.yz=rotate(.5)*q.yz;
  float a=atan(q.z,q.x);
  float bowl=length(vec2(length(q.xz)-.85,q.y*1.4))-.42;
  bowl=smoothUnion(bowl,ellipsoid(q-vec3(0,-.25,0),vec3(.95,.28,.95)),.2);
  bowl+=.035*sin(a*14.+q.y*10.)+.025*sin(-a*9.+q.y*14.);
  float eggs=ellipsoid(q-vec3(-.1,.38,-.15),vec3(.30,.38,.30));
  eggs=min(eggs,ellipsoid(q-vec3(.38,.30,.12),vec3(.28,.35,.28)));
  eggs=min(eggs,ellipsoid(q-vec3(-.3,.28,.32),vec3(.28,.35,.28)));
  return min(bowl*.7,eggs)*1.3;
}
// 20 egg: one upright egg, broader at the base
float agentEgg(vec3 p){
  vec3 q=p-vec3(0,.3,0);
  q.xz*=1.+.14*q.y;
  return ellipsoid(q,vec3(.92,1.3,.92))*.8;
}
// 21 birdhouse: a gabled box with a round door, a perch peg and a post
float agentBirdhouse(vec3 p){
  vec3 q=p-vec3(0,.25,0);
  float pent=max(max(abs(q.x)-.62,-.72-q.y),(abs(q.x)+q.y-1.1)*.7071);
  float body=max(pent,abs(q.z)-.52);
  body=max(body,-max(length(q.xy-vec2(0,.25))-.22,-q.z));
  vec2 s=rotate(-.785)*(vec2(abs(q.x),q.y)-vec2(.395,.875));
  float roof=roundedBox(vec3(s,q.z),vec3(.62,.07,.64),.05);
  float peg=capsule(q,vec3(0,-.2,.5),vec3(0,-.2,.95),.12);
  float post=roundedBox(q-vec3(0,-1.08,0),vec3(.14,.36,.14),.04);
  return min(min(body,roof),min(peg,post));
}
// 22 feather: a broad curved vane on a quill
float agentFeather(vec3 p){
  vec3 q=p-vec3(0,.35,0);
  q.xy=rotate(.45)*q.xy;
  q.x+=.12*q.y*q.y-.1;
  float vane=ellipsoid(q-vec3(0,.15,0),vec3(.58,1.45,.32));
  vane=max(vane,-capsule(q,vec3(.6,.75,0),vec3(.2,.45,0),.07));
  vane=max(vane,-capsule(q,vec3(-.6,-.2,0),vec3(-.22,-.45,0),.07));
  float quill=capsule(q,vec3(0,-1.7,0),vec3(0,1.4,0),.14);
  return min(vane,quill)*.85;
}
// 23 perch: a hanging ring with a dowel across the bottom and three beads
float agentPerch(vec3 p){
  vec3 q=p-vec3(0,.1,0);
  float ring=max(torusXY(q,1.0,.15),-(q.y+.62));
  float dowel=capsule(q,vec3(-.95,-.62,0),vec3(.95,-.62,0),.17);
  float hang=min(capsule(q,vec3(0,1.15,0),vec3(0,1.62,0),.1),torusXY(q-vec3(0,1.78,0),.17,.09));
  float beads=2.;
  for(int i=0;i<3;i++){float an=radians(145.+float(i)*20.);beads=min(beads,length(q-vec3(cos(an),sin(an),0))-.21);}
  return min(min(ring,dowel),min(hang,beads));
}

// scientific instruments
// 24 hourglass: two glass bulbs between round caps on three posts
float agentHourglass(vec3 p){
  vec3 q=p-vec3(0,.3,0);
  float glass=min(ellipsoid(q-vec3(0,.64,0),vec3(.62,.6,.62)),ellipsoid(q+vec3(0,.64,0),vec3(.62,.6,.62)));
  glass=smoothUnion(glass,cylY(q,.15,.2),.12);
  float caps=min(cylY(q-vec3(0,1.28,0),.95,.1),cylY(q+vec3(0,1.28,0),.95,.1))-.04;
  float seg=6.28318/3.;
  float a=mod(atan(q.z,q.x)+seg*.5,seg)-seg*.5;
  vec2 l=vec2(cos(a),sin(a))*length(q.xz);
  float posts=max(length(vec2(l.x-.82,l.y))-.11,abs(q.y)-1.28);
  return min(min(glass,caps),posts);
}
// 25 magnet: a square-section horseshoe, poles down, with wider pole tips
float agentMagnet(vec3 p){
  vec3 q=p-vec3(0,.35,0);
  q.xy=rotate(.2)*q.xy;
  float bend=max(box2(vec2(length(q.xy)-.72,q.z),vec2(.26))-.06,-q.y);
  vec3 s=vec3(abs(q.x)-.72,q.y,q.z);
  float legs=roundedBox(s-vec3(0,-.42,0),vec3(.26,.42,.26),.06);
  float tips=roundedBox(s-vec3(0,-1.0,0),vec3(.29,.15,.29),.06);
  return min(min(bend,legs),tips);
}
// 26 flask: an Erlenmeyer flask, two bubbles rising from the neck
float agentFlask(vec3 p){
  vec2 r=vec2(length(p.xz),p.y);
  float body=trapezoid(r-vec2(0,-.55),.95,.28,.7)-.1;
  float neck=cylY(p-vec3(0,.55,0),.26,.6);
  float lip=length(vec2(r.x-.3,p.y-1.15))-.1;
  float bubbles=min(length(p-vec3(.08,1.6,0))-.17,length(p-vec3(-.12,2.0,0))-.2);
  return min(min(smoothUnion(body,neck,.12),lip),bubbles);
}
// 27 tuning-fork: two tines on a stem ending in a ball, with still sound arcs
float agentTuningFork(vec3 p){
  vec3 q=p; q.xy=rotate(-.18)*q.xy;
  vec3 s=vec3(abs(q.x),q.y,q.z);
  float tines=capsule(s,vec3(.38,.25,0),vec3(.38,1.85,0),.17);
  float yoke=max(torusXY(q-vec3(0,.25,0),.38,.17),q.y-.25);
  float stem=capsule(q,vec3(0,-.13,0),vec3(0,-1.05,0),.17);
  float ball=length(q-vec3(0,-1.18,0))-.24;
  vec2 w=s.xy-vec2(0,1.35);
  float ang=abs(atan(w.y,w.x));
  float arcs=min(length(vec2(length(w)-.95,s.z))-.12,length(vec2(length(w)-1.3,s.z))-.12);
  arcs=max(arcs,(ang-.4)*.8);
  return min(min(tines,yoke),min(smoothUnion(stem,ball,.08),arcs));
}
// 28 prism: a triangular glass prism, one beam in and a fan of three out
float agentPrism(vec3 p){
  vec3 q=p-vec3(0,.2,0);
  vec3 a=abs(q);
  float prism=max(a.z-.45,max(a.x*.866025+q.y*.5,-q.y)-.75)-.06;
  float beams=capsule(p,vec3(-2.0,0,0),vec3(-.55,.55,0),.13);
  beams=min(beams,capsule(p,vec3(.55,.55,0),vec3(1.95,.95,0),.13));
  beams=min(beams,capsule(p,vec3(.55,.55,0),vec3(2.0,.5,0),.13));
  beams=min(beams,capsule(p,vec3(.55,.55,0),vec3(1.95,.05,0),.13));
  return min(prism,beams);
}
// 29 metronome: a tapered case, its arm and weight stopped mid-swing
float agentMetronome(vec3 p){
  vec3 q=p-vec3(0,.1,0);
  float body=max(trapezoid(q.xy,.9,.32,1.2)-.06,abs(q.z)-(.55-.08*q.y));
  float arm=capsule(q,vec3(0,-.75,.5),vec3(.65,1.85,.5),.12);
  float weight=ellipsoid(q-vec3(.4,.85,.54),vec3(.25,.18,.18));
  float base=roundedBox(q-vec3(0,-1.32,0),vec3(1.05,.08,.55),.05);
  return min(min(body,arm),min(weight,base));
}

// 30 sprite: the smooth bust with a small winged creature hovering by its head.
// The creature has no face: a round head, a teardrop body and two pairs of wings.
float sprite(vec3 p){
  p.xy=rotate(.2)*p.xy;
  float head=length(p-vec3(0,.2,0))-.17;
  float body=ellipsoid(p-vec3(0,-.13,0),vec3(.13,.22,.13));
  vec3 s=vec3(abs(p.x),p.y,p.z+.08);
  vec3 u=s-vec3(.40,.22,0); u.xy=rotate(-.6)*u.xy;
  vec3 l=s-vec3(.30,-.20,0); l.xy=rotate(.5)*l.xy;
  float wings=min(ellipsoid(u,vec3(.32,.21,.12)),ellipsoid(l,vec3(.21,.14,.12)));
  return min(smoothUnion(head,body,.08),wings);
}
float agentSprite(vec3 p){
  p.x+=.2;
  vec3 q=(p-vec3(1.25,1.5,.15))/1.35;
  q.xz=rotate(.5)*q.xz;
  return min(agentSmooth(p),sprite(q)*1.35);
}

// 31 swan: a mute swan seen from behind (after wings-cap.png). Wings arched
// up into a heart, neck in an S rising between them, head bowed to the gap.
vec3 bezier3(vec3 a,vec3 b,vec3 c,vec3 d,float t){float s=1.-t;return s*s*s*a+3.*s*s*t*b+3.*s*t*t*c+t*t*t*d;}
float tube(vec3 p,vec3 a,vec3 b,vec3 c,vec3 d,float r0,float r1){
  float m=4.;vec3 prev=a;
  for(int i=1;i<=10;i++){
    float t=float(i)*.1;
    vec3 cur=bezier3(a,b,c,d,t);
    m=smoothUnion(m,capsule(p,prev,cur,mix(r0,r1,t-.05)),.06);
    prev=cur;
  }
  return m;
}
float agentSwan(vec3 p){
  p.xz=rotate(.55)*p.xz;
  float body=ellipsoid(p-vec3(0,-.9,-.1),vec3(1.0,.58,.85));
  vec3 s=vec3(abs(p.x),p.y,p.z*1.5);
  float wing=tube(s,vec3(.42,-.75,-.1),vec3(1.45,-.15,0),vec3(1.05,2.05,0),vec3(.3,1.15,0),.46,.13)*.67;
  wing=smoothUnion(wing,ellipsoid(s-vec3(.72,-.2,0),vec3(.34,.55,.4)),.12);
  wing=smoothUnion(wing,ellipsoid(s-vec3(.72,.5,0),vec3(.3,.5,.3)),.15);
  float neck=tube(p,vec3(0,-.4,-.3),vec3(.05,1.0,-.28),vec3(.75,2.05,-.22),vec3(.28,1.95,-.18),.2,.17);
  vec3 h=p-vec3(.2,1.86,-.15); h.xy=rotate(-.9)*h.xy;
  float head=ellipsoid(h,vec3(.22,.17,.17));
  float beak=capsule(p,vec3(.1,1.74,-.13),vec3(-.06,1.55,-.1),.1);
  float d=smoothUnion(body,wing,.2);
  d=smoothUnion(d,smoothUnion(neck,head,.08),.1);
  return min(d,beak);
}

// Unusual birds, side-on so the silhouette carries. Still, no faces.
vec3 birdView(vec3 p){p.xz=rotate(.45)*p.xz;return p;}
// 32 kiwi: round body, no visible wings, a long down-curved beak
float agentKiwi(vec3 p){
  p=birdView(p);
  float body=ellipsoid(p-vec3(-.15,-.35,0),vec3(.95,.75,.72));
  float head=length(p-vec3(.68,.08,0))-.32;
  float beak=tube(p,vec3(.92,.05,0),vec3(1.35,-.05,0),vec3(1.7,-.35,0),vec3(1.9,-.9,0),.13,.09);
  vec3 s=vec3(p.x,p.y,abs(p.z));
  float legs=capsule(s,vec3(-.1,-.95,.25),vec3(-.05,-1.32,.25),.14);
  float feet=ellipsoid(s-vec3(.08,-1.38,.25),vec3(.26,.1,.14));
  return min(smoothUnion(smoothUnion(body,head,.2),min(legs,feet),.08),beak);
}
// 33 puffin: upright and stout, with a tall flat triangular bill
float agentPuffin(vec3 p){
  p=birdView(p);
  float body=ellipsoid(p-vec3(-.05,-.35,0),vec3(.62,.88,.6));
  float head=length(p-vec3(.12,.72,0))-.45;
  vec2 bq=p.xy-vec2(.55,.68);
  float bill=max(max(trapezoid(vec2(bq.y,bq.x-.25),.3,.06,.28),abs(p.z)-.16),-bq.x)-.04;
  float tail=ellipsoid(p-vec3(-.62,-.95,0),vec3(.3,.12,.2));
  vec3 s=vec3(p.x,p.y,abs(p.z));
  float legs=capsule(s,vec3(0,-1.1,.22),vec3(.05,-1.32,.22),.14);
  float feet=ellipsoid(s-vec3(.18,-1.38,.22),vec3(.3,.1,.16));
  return min(smoothUnion(smoothUnion(body,head,.2),min(tail,min(legs,feet)),.08),bill);
}
// 34 toucan: perched on a branch, a huge banana bill
float agentToucan(vec3 p){
  p=birdView(p);
  vec3 b=p-vec3(-.3,-.05,0); b.xy=rotate(-.3)*b.xy;
  float body=ellipsoid(b,vec3(.52,.85,.5));
  float head=length(p-vec3(0,.78,0))-.38;
  vec3 k=p-vec3(.95,.72,0); k.y+=.12*k.x*k.x;
  float bill=ellipsoid(k,vec3(.95,.3,.22))*.85;
  vec3 t=p-vec3(-.75,-1.0,0); t.xy=rotate(-.35)*t.xy;
  float tail=ellipsoid(t,vec3(.18,.55,.2));
  float branch=capsule(p,vec3(-1.7,-.82,0),vec3(1.5,-.75,0),.17);
  return min(smoothUnion(smoothUnion(body,head,.15),min(tail,bill),.08),branch);
}
// 35 pelican: heavy body, short neck, a long bill with a hanging pouch
float agentPelican(vec3 p){
  p=birdView(p);
  vec3 b=p-vec3(-.35,-.5,0); b.xy=rotate(.15)*b.xy;
  float body=ellipsoid(b,vec3(1.05,.6,.6));
  float neck=tube(p,vec3(.35,-.3,0),vec3(.65,.2,0),vec3(.1,.6,0),vec3(.3,.92,0),.24,.18);
  float head=length(p-vec3(.32,.95,0))-.26;
  float bill=capsule(p,vec3(.5,.95,0),vec3(1.85,.62,0),.12);
  float pouch=ellipsoid(p-vec3(1.1,.55,0),vec3(.72,.24,.18));
  vec3 s=vec3(p.x,p.y,abs(p.z));
  float legs=capsule(s,vec3(-.25,-1.0,.25),vec3(-.2,-1.32,.25),.14);
  float feet=ellipsoid(s-vec3(-.05,-1.38,.25),vec3(.28,.1,.16));
  float d=smoothUnion(smoothUnion(body,neck,.15),head,.1);
  return min(min(d,smoothUnion(bill,pouch,.08)),min(legs,feet));
}
// 36 shoebill: tall and still, a big head and a massive clog-shaped bill
float agentShoebill(vec3 p){
  p=birdView(p);
  vec3 b=p-vec3(-.25,-.15,0); b.xy=rotate(-.2)*b.xy;
  float body=ellipsoid(b,vec3(.6,.92,.58));
  float head=length(p-vec3(.12,1.2,0))-.45;
  float bill=roundedBox(p-vec3(.78,1.08,0),vec3(.36,.18,.16),.1);
  float hook=length(p-vec3(1.2,.95,0))-.15;
  vec3 s=vec3(p.x,p.y,abs(p.z));
  float legs=capsule(s,vec3(-.2,-.8,.2),vec3(-.15,-1.38,.2),.13);
  float feet=ellipsoid(s-vec3(.05,-1.42,.2),vec3(.3,.08,.16));
  return min(smoothUnion(smoothUnion(body,head,.25),smoothUnion(bill,hook,.08),.08),min(legs,feet));
}
// 37 dodo: plump body, a big hooked bill, a tuft of tail and stubby legs
float agentDodo(vec3 p){
  p=birdView(p);
  float body=ellipsoid(p-vec3(-.25,-.3,0),vec3(.95,.85,.82));
  float head=length(p-vec3(.62,.62,0))-.38;
  float bill=capsule(p,vec3(.9,.66,0),vec3(1.42,.55,0),.18);
  float hook=length(p-vec3(1.5,.42,0))-.16;
  float tail=min(length(p-vec3(-1.15,.15,0))-.22,length(p-vec3(-1.1,.42,.1))-.18);
  vec3 s=vec3(p.x,p.y,abs(p.z));
  float legs=capsule(s,vec3(-.15,-1.0,.3),vec3(-.1,-1.32,.3),.17);
  float feet=ellipsoid(s-vec3(.08,-1.38,.3),vec3(.3,.1,.17));
  float d=smoothUnion(smoothUnion(body,head,.25),min(tail,min(legs,feet)),.1);
  return min(d,smoothUnion(bill,hook,.1));
}
// 38 peacock: a small body in front of a full scalloped fan
float agentPeacock(vec3 p){
  p=birdView(p);
  vec3 f=p-vec3(-.15,-.85,-.35);
  float an=atan(f.y,f.x);
  float fan=max(max(length(f.xy)-1.75-.08*sin(an*16.),-f.y-.1),abs(f.z)-.13);
  float body=ellipsoid(p-vec3(.25,-.65,0),vec3(.45,.42,.38));
  float neck=capsule(p,vec3(.38,-.4,0),vec3(.5,.35,0),.15);
  float head=length(p-vec3(.52,.48,0))-.2;
  float crest=length(p-vec3(.46,.82,0))-.13;
  float beak=capsule(p,vec3(.68,.46,0),vec3(.86,.42,0),.08);
  vec3 s=vec3(p.x,p.y,abs(p.z));
  float legs=capsule(s,vec3(.25,-1.0,.15),vec3(.28,-1.4,.15),.12);
  float d=smoothUnion(smoothUnion(body,neck,.12),head,.08);
  return min(min(min(fan,d),min(crest,beak)),legs);
}
// 39 flamingo: one leg down, one tucked, an S-curved neck, a bent bill
float agentFlamingo(vec3 p){
  p=birdView(p);
  vec3 b=p-vec3(-.15,.3,0); b.xy=rotate(.1)*b.xy;
  float body=ellipsoid(b,vec3(.72,.4,.4));
  float tail=ellipsoid(p-vec3(-.85,.4,0),vec3(.28,.14,.2));
  float leg=capsule(p,vec3(-.05,0,0),vec3(0,-1.38,0),.12);
  float foot=ellipsoid(p-vec3(.15,-1.42,0),vec3(.25,.07,.12));
  float tuck=min(capsule(p,vec3(-.05,-.05,.15),vec3(.32,-.5,.15),.12),capsule(p,vec3(.32,-.5,.15),vec3(-.12,-.6,.15),.12));
  float neck=tube(p,vec3(.45,.45,0),vec3(1.05,.95,0),vec3(.05,1.6,0),vec3(.55,2.0,0),.15,.13);
  float head=length(p-vec3(.62,2.0,0))-.2;
  float bill=min(capsule(p,vec3(.75,2.02,0),vec3(.98,1.9,0),.11),capsule(p,vec3(.98,1.9,0),vec3(1.02,1.7,0),.09));
  float d=smoothUnion(smoothUnion(body,tail,.1),smoothUnion(neck,head,.08),.12);
  return min(min(d,bill),min(min(leg,foot),tuck));
}

float agentBust(vec3 p){
  p.xz=rotate(-.35)*p.xz;
  if(abs(p.x)>2.1||p.y>2.3||p.y< -1.5||abs(p.z)>1.5)
    return 2.;
  if(agentVariant<.5)return agentFeatured(p);
  if(agentVariant<1.5)return agentOrbit(p);
  if(agentVariant<2.5)return agentHalo(p);
  if(agentVariant<3.5)return agentPulse(p);
  if(agentVariant<4.5)return agentThinking(p);
  if(agentVariant<5.5)return agentTyping(p);
  if(agentVariant<6.5)return agentCaret(p);
  if(agentVariant<7.5)return agentBreath(p);
  if(agentVariant<8.5)return agentSurface(p);
  if(agentVariant<9.5)return agentEllipsis(p);
  if(agentVariant<10.5)return agentGyro(p);
  if(agentVariant<11.5)return agentRelay(p);
  if(agentVariant<12.5)return agentHarp(p);
  if(agentVariant<13.5)return agentHaloRing(p);
  if(agentVariant<14.5)return agentLantern(p);
  if(agentVariant<15.5)return agentGate(p);
  if(agentVariant<16.5)return agentDove(p);
  if(agentVariant<17.5)return agentTrumpet(p);
  if(agentVariant<18.5)return agentBirdcage(p);
  if(agentVariant<19.5)return agentNest(p);
  if(agentVariant<20.5)return agentEgg(p);
  if(agentVariant<21.5)return agentBirdhouse(p);
  if(agentVariant<22.5)return agentFeather(p);
  if(agentVariant<23.5)return agentPerch(p);
  if(agentVariant<24.5)return agentHourglass(p);
  if(agentVariant<25.5)return agentMagnet(p);
  if(agentVariant<26.5)return agentFlask(p);
  if(agentVariant<27.5)return agentTuningFork(p);
  if(agentVariant<28.5)return agentPrism(p);
  if(agentVariant<29.5)return agentMetronome(p);
  if(agentVariant<30.5)return agentSprite(p);
  if(agentVariant<31.5)return agentSwan(p);
  if(agentVariant<32.5)return agentKiwi(p);
  if(agentVariant<33.5)return agentPuffin(p);
  if(agentVariant<34.5)return agentToucan(p);
  if(agentVariant<35.5)return agentPelican(p);
  if(agentVariant<36.5)return agentShoebill(p);
  if(agentVariant<37.5)return agentDodo(p);
  if(agentVariant<38.5)return agentPeacock(p);
  return agentFlamingo(p);
}

float loopShape(vec3 p){
  p.yz=rotate(.38)*p.yz;
  p.xz=rotate(.2)*p.xz;
  return length(vec2(length(p.xy)-1.23,p.z))-.4;
}
// Wings Portal candidates, each built from the loop's ring (torusXY).
// Tunnel: five rings receding at an angle, each smaller and thinner.
float portalTunnel(vec3 p){
  p.xz=rotate(.55)*p.xz;
  p.yz=rotate(.15)*p.yz;
  float d=1e3,s=1.;
  for(int i=0;i<5;i++){
    d=min(d,torusXY(p-vec3(0,0,1.5-.75*float(i)),1.15*s,.3*s));
    s*=.82;
  }
  return d;
}
// Gyro: three gimbal rings nested at right angles.
float portalGyro(vec3 p){
  p.xz=rotate(.5)*p.xz;
  p.yz=rotate(.35)*p.yz;
  float d=torusXY(p,1.32,.24);
  d=min(d,torusXY(p.zyx,1.,.22));
  return min(d,torusXY(p.xzy,.7,.2));
}
// Atom: three thin orbit rings at 60 degrees round a small nucleus.
float portalAtom(vec3 p){
  p.yz=rotate(.2)*p.yz;
  float d=length(p)-.3;
  for(int i=0;i<3;i++){
    vec3 q=p;
    q.xy=rotate(1.0472*float(i))*q.xy;
    q.yz=rotate(1.15)*q.yz;
    d=min(d,torusXY(q,1.3,.19));
  }
  return d;
}
// Ripple: four concentric rings in one plane, lying back like rings on a
// pond, thinner outward. One ring is evaluated: the nearest.
float portalRipple(vec3 p){
  p.y+=.15;
  p.yz=rotate(1.)*p.yz;
  float k=clamp(floor((length(p.xy)-.45)/.5+.5),0.,3.);
  return torusXY(p,.45+.5*k,.22-.03*k);
}
// Infinity: two rings side by side, merged where they meet.
float portalInfinity(vec3 p){
  p.yz=rotate(.38)*p.yz;
  p.xz=rotate(.2)*p.xz;
  return smoothUnion(torusXY(p-vec3(1.,0,0),.95,.32),torusXY(p+vec3(1.,0,0),.95,.32),.2);
}
// Coil: the ring drawn out into a spring, seen nearly end-on, narrowing as it
// recedes like a wormhole.
float portalCoil(vec3 p){
  p.xz=rotate(.5)*p.xz;
  p.yz=rotate(.25)*p.yz;
  float R=1.3*exp(.38*(p.z-1.)),pitch=.6;
  float dz=mod(p.z-pitch*atan(p.y,p.x)/6.2832+pitch*.5,pitch)-pitch*.5;
  float d=length(vec2(length(p.xy)-R,dz))-(.06+.17*R/1.3);
  return max(d*.7,abs(p.z+.6)-1.6);
}
// Arch: the ring standing upright, its lower half sunk in a flat bank of cloud.
float portalArch(vec3 p){
  p.xz=rotate(.3)*p.xz;
  p.y+=.2;
  float d=torusXY(p+vec3(0,.35,0),1.3,.38);
  float bank=ellipsoid(p+vec3(0,.55,0),vec3(2.5,.4,1.));
  bank=smoothUnion(bank,ellipsoid(p+vec3(1.3,.35,.1),vec3(.8,.4,.7)),.25);
  bank=smoothUnion(bank,ellipsoid(p-vec3(1.2,-.4,.2),vec3(.7,.35,.6)),.25);
  return smoothUnion(d,bank,.2);
}
// Oval: the ring stretched to a tall door shape, standing on a small puff.
float portalOval(vec3 p){
  p.xz=rotate(.3)*p.xz;
  p.y-=.15;
  float d=(length(vec2(length(vec2(p.x*1.4,p.y))-1.45,p.z*1.4))-.48)/1.4;
  return smoothUnion(d,ellipsoid(p+vec3(0,1.75,0),vec3(.95,.3,.6)),.2);
}
// Reflection: the ring over a thinner, upside-down copy, as if in water.
float portalReflection(vec3 p){
  float t=.2+.12*smoothstep(-.3,.3,p.y);
  p.y=abs(p.y)-1.05;
  p.yz=rotate(.25)*p.yz;
  p.xz=rotate(.2)*p.xz;
  return torusXY(p,.78,t);
}
// Disc: the loop filled in, a disc with the loop's rounded rim, dished a
// little toward the centre.
float portalDiscFilled(vec3 p){
  p.yz=rotate(.38)*p.yz;
  p.xz=rotate(.2)*p.xz;
  float r=length(p.xy);
  vec2 q=vec2(r-1.23,abs(p.z)+.1*(1.-smoothstep(0.,1.2,r)));
  return length(max(q,0.))+min(max(q.x,q.y),0.)-.4;
}
float portalShape(vec3 p){
  if(portalVariant<.5)return portalTunnel(p);
  if(portalVariant<1.5)return portalGyro(p);
  if(portalVariant<2.5)return portalAtom(p);
  if(portalVariant<3.5)return portalRipple(p);
  if(portalVariant<4.5)return portalInfinity(p);
  if(portalVariant<5.5)return portalCoil(p);
  if(portalVariant<6.5)return portalArch(p);
  if(portalVariant<7.5)return portalOval(p);
  if(portalVariant<8.5)return portalReflection(p);
  return portalDiscFilled(p);
}
// Wings Kits candidates, simple single forms in the spirit of the loop.
// Hex nut: a thick hexagonal ring with a round hole, edges softened.
float hexagon(vec2 p,float r){ // r: distance from the centre to a flat side
  const vec3 k=vec3(-.866025404,.5,.577350269);
  p=abs(p);
  p-=2.*min(dot(k.xy,p),0.)*k.xy;
  p-=vec2(clamp(p.x,-k.z*r,k.z*r),r);
  return length(p)*sign(p.y);
}
float kitsNut(vec3 p){
  p.yz=rotate(.38)*p.yz;
  p.xz=rotate(.2)*p.xz;
  p.xy=rotate(.26)*p.xy;
  float face=max(hexagon(p.xy,1.18),.58-length(p.xy));
  vec2 w=vec2(face+.1,abs(p.z)-.3);
  return min(max(w.x,w.y),0.)+length(max(w,0.))-.1;
}
// Linked rings: two links of a chain, one through the other at right angles.
// Scaled up by 1.15 so it reads as large as the other kits.
float kitsLinks(vec3 p){
  p/=1.15;
  p.yz=rotate(.42)*p.yz;
  p.xz=rotate(.35)*p.xz;
  vec3 a=p+vec3(.5,0,0),b=p-vec3(.5,0,0);
  float ra=length(vec2(length(a.xy)-.88,a.z))-.3;
  float rb=length(vec2(length(b.xz)-.88,b.y))-.3;
  return min(ra,rb)*1.15;
}
// Plus: a thick, rounded plus sign.
float kitsPlus(vec3 p){
  p.yz=rotate(.38)*p.yz;
  p.xz=rotate(.3)*p.xz;
  p.xy=rotate(-.08)*p.xy;
  float h=roundedBox(p,vec3(1.18,.3,.24),.14);
  float v=roundedBox(p,vec3(.3,1.18,.24),.14);
  return smoothUnion(h,v,.12);
}
// Blocks: two side by side and one stacked off-centre on top, each turned a
// little so the stack looks hand-built.
float kitsBlocks(vec3 p){
  p.xz=rotate(-.25)*p.xz;
  p.yz=rotate(.14)*p.yz;
  vec3 a=p-vec3(-.6,-.55,.05);  a.xz=rotate(.18)*a.xz;
  vec3 b=p-vec3(.58,-.55,-.08); b.xz=rotate(-.22)*b.xz;
  vec3 c=p-vec3(-.12,.55,0);    c.xz=rotate(.42)*c.xz; c.xy=rotate(-.08)*c.xy;
  float d=roundedBox(a,vec3(.46),.1);
  d=min(d,roundedBox(b,vec3(.46),.1));
  d=min(d,roundedBox(c,vec3(.46),.1));
  return d;
}
// Wing nut: a round, slightly tapered hub with a hole down its axis, and two
// flat rounded wings rising from its sides. Tipped toward the viewer so the
// hole shows.
float kitsWingnut(vec3 p){
  p.yz=rotate(.55)*p.yz;
  p.xz=rotate(.22)*p.xz;
  p.xy=rotate(.05)*p.xy;
  p.y+=.2;
  float r=length(p.xz);
  vec2 h=vec2(r-(.62-.1*clamp(p.y+.5,0.,.8)),abs(p.y+.12)-.38);
  float hub=min(max(h.x,h.y),0.)+length(max(h,0.))-.06;
  hub=max(hub,.3-r);
  vec2 w=vec2(abs(p.x),p.y),a=vec2(.5,-.2),b=vec2(1.02,.66);
  float t=clamp(dot(w-a,b-a)/dot(b-a,b-a),0.,1.);
  float wing=smoothUnion(length(w-b)-.44,length(w-a-(b-a)*t)-.22,.25);
  vec2 e=vec2(wing,abs(p.z)-.09);
  wing=min(max(e.x,e.y),0.)+length(max(e,0.))-.05;
  return smoothUnion(hub,wing,.12);
}
float kitsShape(vec3 p){
  if(kitsVariant<.5)return kitsNut(p);
  if(kitsVariant<1.5)return kitsLinks(p);
  if(kitsVariant<2.5)return kitsPlus(p);
  if(kitsVariant<3.5)return kitsBlocks(p);
  return kitsWingnut(p);
}
// Wings Machine candidates. Besides the original CRT, each is built from the
// loop's ring (torusXY), tilted like the loop.
// slabZ: a 2D distance d extruded to half-thickness h along z.
float slabZ(float d,float z,float h){vec2 w=vec2(d,abs(z)-h);return min(max(w.x,w.y),0.)+length(max(w,0.));}
// polarRep: folds p into one of n equal sectors round the origin; x is the
// distance out, y the offset across the sector.
vec2 polarRep(vec2 p,float n){float s=6.2832/n,a=mod(atan(p.y,p.x)+s*.5,s)-s*.5;return length(p)*vec2(cos(a),sin(a));}
vec3 loopTilt(vec3 p){p.yz=rotate(.38)*p.yz;p.xz=rotate(.2)*p.xz;return p;}
// cog: the ring with n rounded teeth round its outside.
float cog(vec3 p,float R,float r,float n){
  vec2 q=polarRep(p.xy,n);
  float t=roundedBox(vec3(q.x-R-r*.9,q.y,p.z),vec3(r*.55,r*.36,r*.5),r*.22);
  return smoothUnion(torusXY(p,R,r),t,r*.25);
}
// CRT: a vintage desktop computer, turned three-quarters to the light: a deep
// CRT monitor (recessed screen, tube housing behind) sitting on a flat system
// unit with a drive bay, and a keyboard in front.
float machineCrt(vec3 p){
  p.xz=rotate(-.3)*p.xz;
  p.yz=rotate(.16)*p.yz;
  p.y-=.2;
  vec3 m=p-vec3(0,.42,.05);
  float d=roundedBox(m,vec3(1.,.74,.36),.12);                     // monitor front
  d=max(d,-roundedBox(m-vec3(0,.04,.5),vec3(.76,.54,.2),.1));      // recessed screen
  d=min(d,roundedBox(m-vec3(0,.02,-.62),vec3(.68,.5,.32),.16));    // tube housing
  vec3 u=p-vec3(0,-.6,-.05);
  float unit=roundedBox(u,vec3(1.36,.2,.72),.07);                   // system unit
  unit=max(unit,-roundedBox(u-vec3(.72,0,.82),vec3(.36,.07,.14),.03)); // drive bay
  d=min(d,unit);
  vec3 k=p-vec3(-.05,-1.2,1.75);
  k.yz=rotate(-.12)*k.yz;
  d=min(d,roundedBox(k,vec3(1.18,.05,.34),.05));                   // keyboard
  return d;
}
// Gear: the loop as a single cog.
float machineGear(vec3 p){return cog(loopTilt(p),1.,.34,10.);}
// Gears: a large cog meshing with a small one.
float machineGears(vec3 p){
  p=loopTilt(p);
  float d=cog(p+vec3(.6,-.25,0),.82,.3,9.);
  vec3 s=p-vec3(1.1,-.6,0);
  s.xy=rotate(.3)*s.xy;
  return min(d,cog(s,.42,.2,6.));
}
// Flywheel: the loop with a hub and five spokes.
float machineFlywheel(vec3 p){
  p=loopTilt(p);
  float d=torusXY(p,1.1,.32);
  d=min(d,slabZ(length(p.xy)-.24,p.z,.14)-.07);                          // hub
  vec2 q=polarRep(p.xy,5.);
  return smoothUnion(d,capsule(vec3(q,p.z),vec3(.25,0,0),vec3(1.,0,0),.12),.1); // spokes
}
// Belt: the loop drawn out into a belt round two pulley rings.
float machineBelt(vec3 p){
  p=loopTilt(p);
  float l=length(vec2(max(abs(p.x)-.78,0.),p.y))-.7;
  float d=roundedBox(vec3(l,0,p.z),vec3(.07,1.,.26),.05);                 // belt
  vec3 w=vec3(abs(p.x)-.78,p.y,p.z);
  d=min(d,torusXY(w,.44,.16));                                            // pulleys
  d=min(d,slabZ(length(w.xy)-.12,w.z,.2)-.05);                            // axles
  return d;
}
// Turbine: the loop drawn back into a short shroud round a ring of blades and
// a rounded hub, turned to show its depth.
float machineTurbine(vec3 p){
  p.xz=rotate(.55)*p.xz;
  p.yz=rotate(.2)*p.yz;
  float r=length(p.xy);
  float d=length(vec2(r-1.2,max(abs(p.z)-.42,0.)))-.26;                  // shroud
  d=min(d,ellipsoid(p-vec3(0,0,.12),vec3(.34,.34,.62)));                  // hub
  vec2 q=polarRep(p.xy,9.);
  vec3 b=vec3(q.x-.64,q.y,p.z);
  b.yz=rotate(.6)*b.yz;
  return min(d,roundedBox(b,vec3(.38,.16,.05),.04));                      // blades
}
// Screen: the loop squared off into a wide frame round a recessed screen,
// on a neck and a small flat ring for a foot.
float machineScreen(vec3 p){
  p.xz=rotate(.25)*p.xz;
  p.yz=rotate(.12)*p.yz;
  p.y-=.3;
  float d=length(vec2(box2(p.xy,vec2(.82,.42))-.42,p.z))-.27;            // frame
  d=min(d,roundedBox(p+vec3(0,0,.12),vec3(1.,.6,.06),.1));                // screen
  d=smoothUnion(d,capsule(p,vec3(0,-1.,-.05),vec3(0,-1.5,-.05),.14),.1);  // neck
  vec3 f=p+vec3(0,1.6,.05);
  return smoothUnion(d,length(vec2(length(f.xz)-.48,f.y))-.13,.1);        // foot
}
// Crank: the loop as a crank wheel driving a rod into a piston block.
float machineCrank(vec3 p){
  p.xz=rotate(.3)*p.xz;
  p.yz=rotate(.18)*p.yz;
  vec3 w=p+vec3(.62,.2,0);
  float d=torusXY(w,.86,.28);                                             // wheel
  d=min(d,slabZ(length(w.xy)-.2,w.z,.12)-.06);                            // hub
  vec3 a=vec3(-.2,.25,.3);
  d=smoothUnion(d,capsule(p,vec3(-.62,-.2,.16),a,.11),.08);               // crank arm
  d=min(d,capsule(p,a,vec3(.98,.2,.3),.1));                               // rod
  return min(d,roundedBox(p-vec3(1.4,.2,.22),vec3(.42,.34,.34),.12));     // piston block
}
// Platters: three rings stacked on a spindle like a disk drive's platters,
// seen from a little above, with the read arm reaching over the top one.
float machinePlatters(vec3 p){
  p.xz=rotate(.2)*p.xz;
  p.yz=rotate(.45)*p.yz;
  vec3 s=p;
  s.y-=clamp(floor(p.y/.5+.5),-1.,1.)*.5;
  float d=length(vec2(length(s.xz)-1.08,s.y))-.2;                        // platters
  d=min(d,capsule(p,vec3(0,-.75,0),vec3(0,.75,0),.16));                   // spindle
  d=min(d,capsule(p,vec3(1.45,.75,-.7),vec3(.35,.75,.05),.08));           // arm
  return min(d,length(p-vec3(1.45,.75,-.7))-.17);
}
// Clock: the loop as an alarm clock's face, with hands, two bells on top and
// two feet.
float machineClock(vec3 p){
  p.xz=rotate(.25)*p.xz;
  p.yz=rotate(.12)*p.yz;
  float d=torusXY(p,1.05,.3);
  d=min(d,slabZ(length(p.xy)-.85,p.z+.1,.04)-.03);                         // face
  d=min(d,capsule(p,vec3(0,0,.06),vec3(0,.68,.06),.07));                  // hands
  d=min(d,capsule(p,vec3(0,0,.06),vec3(.45,-.2,.06),.08));
  vec3 b=vec3(abs(p.x)-.78,p.y-1.28,p.z);
  b.xy=rotate(.6*sign(p.x))*b.xy;
  d=smoothUnion(d,max(length(b)-.34,-b.y-.05),.06);                       // bells
  vec3 f=vec3(abs(p.x),p.y,p.z);
  return smoothUnion(d,capsule(f,vec3(.62,-1.22,0),vec3(.82,-1.55,0),.1),.06); // feet
}
float machineShape(vec3 p){
  if(machineVariant<.5)return machineCrt(p);
  if(machineVariant<1.5)return machineGear(p);
  if(machineVariant<2.5)return machineGears(p);
  if(machineVariant<3.5)return machineFlywheel(p);
  if(machineVariant<4.5)return machineBelt(p);
  if(machineVariant<5.5)return machineTurbine(p);
  if(machineVariant<6.5)return machineScreen(p);
  if(machineVariant<7.5)return machineCrank(p);
  if(machineVariant<8.5)return machinePlatters(p);
  if(machineVariant<9.5)return machineClock(p);
  return portalRipple(p);
}
float wordShape(vec3 p){
  vec2 uvWord=vec2(p.x,-p.y)/vec2(6.4,1.6)+.5;
  float d=texture(word,uvWord).r*1.6-.8;
  vec2 outside=abs(p.xy)-vec2(3.2,.8);
  d=max(d,max(outside.x,outside.y));
  vec2 q=vec2(d+.035,abs(p.z)-.34);
  return min(max(q.x,q.y),0.)+length(max(q,0.))-.035;
}

// Sky: a light scatter of fair-weather cumulus across the whole view, for the
// first slot, laid out in JS above (SKY_CLOUDS). Clouds lower in the view are
// smaller, as they would be nearer the horizon.
uniform vec4 skyCloud[${SKY_CLOUDS.length}];  // centre xyz, size w
uniform vec4 skyTarget[${SKY_CLOUDS.length}]; // xyz: the cloud's slot on the loop, w: tower count (-1: the wordmark)
uniform vec4 skyMeta[${SKY_CLOUDS.length}];   // x: base aspect, y: seed, z: wind speed, w: radius of a sphere round it, in units of size
uniform vec4 skyBound[${SKY_CLOUDS.length}];  // xyz: half extents of the cloud's box, w: its centre's y; in units of size
float skyHalf=4.; // half the view's width in shape units, set in main()
float viewHalfH=3.; // the canvas's half height in shape units, footer strip included, set in main()
uniform vec4 skyTower[${SKY_CLOUDS.length * 6}]; // six towers per cloud: xyz and radius, in units of its size
float cumulus(vec3 q,float r,int i){
  vec4 meta=skyMeta[i];
  float d=ellipsoid(q-vec3(0,-.02*r,0),vec3(meta.x*.95,.38,.8)*r);
  float towers=skyTarget[i].w;
  for(int j=0;j<6;j++){
    if(float(j)>=towers)break;
    vec4 t=skyTower[i*6+j];
    d=smoothUnion(d,length(q-t.xyz*r)-t.w*r,.16*r);
  }
  // One low-frequency bump so the outline is irregular rather than a clean dome.
  d+=(noise(q/r*1.3+meta.y*17.)-.5)*.32*r;
  // Flat base: cut everything below the condensation level, softly.
  float base=-(q.y+.18*r);
  float h=clamp(.5+.5*(base-d)/(.06*r),0.,1.);
  return mix(d,base,h)+.06*r*h*(1.-h);
}
// The wordmark as one of the sky's clouds, deeper than the scroll wordmark.
// density() draws it thinner and softer than the cumulus (wordMask).
const float WORD_SCALE=1.0,WORD_DEPTH=1.8; // as in the JS above
// Its letters are bent by a slow warp and its baseline sways, so the strokes
// lean and sag, and their edges are lumpy, so it reads as a cloud that happens
// to spell the word rather than as lettering.
float wordCloud(vec3 q,float r){
  float s=r*WORD_SCALE;
  vec3 u=vec3(q.xy,q.z/WORD_DEPTH)/s;
  u.xy+=(vec2(noise(vec3(u.xy*.5,1.3)),noise(vec3(u.xy*.5+3.7,4.1)))-.5)*vec2(.25,.36);u.y+=.12*sin(u.x*.8+.6);
  return (wordShape(u)+(noise(u*3.2+7.)-.5)*.13)*s;
}
// Gathering: on the way to the loop the sky's clouds do not disperse. Each
// slides to its own slot on the ring (by three quarters of the morph),
// shrinking toward the ring's thickness and merging with its neighbours; the
// ring takes over once they have arrived. t is the first morph's progress.
float gatherMove(float t){return smoothstep(0.,.75,t);}
float gatherBlend(float t){return smoothstep(.6,1.,t);}
// Where cloud i is (xyz) and how big (w), m of the way to its slot. The wind
// carries it rightward, wrapping round a span wider than the view by the
// cloud's reach, so it leaves one side fully before it re-enters the other.
// Opening the chat from the sky gathers the clouds into the pill the same
// way: pillMove (0..1, set in main()) slides each cloud to the point on the
// pill's centre line under its own position, so they keep their order, and
// shrinks it to the pill's height.
float pillMove=0.;
// Per-pixel constants, set once in main() before the march: the view and pose
// turns (shapeField, toObject, facingToShape, chatPill) and the scroll, chat
// and dive curves. They depend on uniforms only, and every sample used to
// recompute them, five times over with the shadow samples.
mat2 rViewX=mat2(1.),rViewY=mat2(1.),rWobble=mat2(1.),rPoseX=mat2(1.),rPoseY=mat2(1.),rPoseZ=mat2(1.);
float gBurst=0.,gSpread=0.,gFray=0.,gFade=1.,gW2=0.,gW3=0.;
// The chat pill lives in camera-facing coordinates; this turns a point there
// into the shape frame the sky is built in (the view turns of shapeField()).
vec3 facingToShape(vec3 f){
  f.xz=rViewX*f.xz;
  f.yz=rViewY*f.yz;
  f.xy=rWobble*f.xy;
  return f;
}
vec4 gatherAt(int i,float m,mat2 swirl){
  vec4 c=skyCloud[i];
  vec4 meta=skyMeta[i];
  float span=skyHalf+skyBound[i].x*c.w+.5;
  c.x=mod(c.x+wind*meta.z+span,2.*span)-span;
  vec3 at=mix(c.xyz,skyTarget[i].xyz,m);
  at.xy=swirl*at.xy; // a slight swirl on the way in
  float size=mix(c.w,.3,m);
  if(pillMove>0.){
    float W=chatHalfW/cScale,H=chatHalfH/cScale;
    vec3 slot=facingToShape(vec3(clamp(at.x/skyHalf,-1.,1.)*(W-H),(chatShift-chatGrow*.5)/cScale,0.));
    at=mix(at,slot,pillMove);
    size=mix(size,H*1.15,pillMove);
  }
  return vec4(at,size);
}
// Which clouds can reach the current pixel, one bit per cloud held in a
// float (WebGL 1 has no bit operations); 0 means test them all. Set once per
// pixel by skyReaches() so each sample skips the clouds out of reach.
float skyMask=0.;
float skyShape(vec3 p,float t){
  float m=gatherMove(t),mk=max(m,pillMove),d=1e3,nearC=1e3,k=.02+.3*mk*mk;
  mat2 swirl=rotate(.5*m*(1.-m));
  float bit=.5;
  for(int i=0;i<${SKY_CLOUDS.length};i++){
    bit*=2.;
    if(skyMask>0.&&mod(floor(skyMask/bit+.0001),2.)<.5)continue;
    if(mk>.45&&skyCloud[i].z<-1.)continue; // far back: faded out by now (density())
    vec4 g=gatherAt(i,m,swirl);
    vec3 q=p-g.xyz;
    // Cheap reject outside a sphere and an ellipsoid round this cloud; each
    // gives a lower bound on the distance ((length(q/R)-1)*min(R) for the
    // ellipsoid), and the larger is kept for empty-space skipping.
    vec4 b=skyBound[i];
    vec3 R=b.xyz*g.w*1.25;
    float far=max(length(q)-skyMeta[i].w*g.w,(length((q-vec3(0,b.w*g.w,0))/R)-1.)*min(R.x,min(R.y,R.z)));
    if(far>.6){d=min(d,far);continue;}
    // The wordmark cloud is off (no SKY_CLOUDS row is marked 1), so its branch
    // is left out to keep the shader small. To bring it back:
    //   if(skyTarget[i].w<0.){c=wordCloud(q,g.w);wordMask=1.-smoothstep(0.,.3,c);}else
    float c=cumulus(q,g.w,i);
    if(c<nearC){nearC=c;skyDepth=skyCloud[i].z;}
    d=smoothUnion(d,c,k);
  }
  return d;
}
// Whether any sky cloud can reach this pixel (q, in shape units), noting
// which in skyMask. The margin covers surface billows, the cursor's push, the
// view's tilt and the sun's shadow samples.
bool skyReaches(vec2 q,float t){
  float m=gatherMove(t);
  mat2 swirl=rotate(.5*m*(1.-m));
  skyMask=0.;
  float bit=.5;
  for(int i=0;i<${SKY_CLOUDS.length};i++){
    bit*=2.;
    if(max(m,pillMove)>.45&&skyCloud[i].z<-1.)continue;
    vec4 g=gatherAt(i,m,swirl);
    vec4 b=skyBound[i];
    if(length((q-g.xy-vec2(0,b.w*g.w))/(b.xy*g.w*1.25+.8))<1.)skyMask+=bit;
  }
  return skyMask>0.;
}

// Opening alternatives to the sky (id 7, openingVariant picks one).
// Raw block: a dense slab, like uncut marble, its faces gently uneven.
float openBlock(vec3 p){
  vec3 b=vec3(2.3,1.85,1.1)*oBlockSize;
  vec3 q=abs(p)-b+.12;
  float d=length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-.12;
  return d+oRough*.22*(noise(p*.65+vec3(3.,1.,7.))-.5);
}
// Cloud planet: a sphere turning slowly on a tilted axis, its weather in
// bands from pole to pole, their edges warped so they read as weather.
float openPlanet(vec3 p){
  vec3 q=p;
  q.xy=rotate(radians(oTilt))*q.xy;
  q.xz=rotate(time*oSpin*.10472)*q.xz;
  float r=length(q),lat=q.y/max(r,.001);
  float band=smoothstep(-.5,.5,sin(lat*oBandCount*1.5708+2.6*noise(q*1.3+vec3(2.,5.,1.))));
  return r-oPlanetR-oBands*.12*band;
}
// Fog wall: a bank that fills the whole canvas, half oFogDepth thick.
float openFog(vec3 p){
  vec3 q=abs(p)-vec3(skyHalf+.8,viewHalfH+.8,oFogDepth);
  return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);
}
float openingShape(vec3 p){
  if(openingVariant<.5)return openBlock(p);
  if(openingVariant<1.5)return openPlanet(p);
  return openFog(p);
}

// The agent (2) shape is not in the scroll, so it is left
// out here: the compiler then drops their code, which every copy of this
// function would otherwise carry. The full shader was big enough that small
// edits could stall some GPUs for seconds. Add a line back to use one again.
float shape(vec3 p,int id){
  if(id==4)return skyShape(p,0.);
  if(id==7)return openingShape(p);
  if(id==1)return loopShape(p);
  if(id==5)return machineShape(p);
  if(id==6)return kitsShape(p);
  if(id==3)return portalShape(p);
  return wordShape(p);
}

// The first morph from the sky: gathering clouds, then the next shape.
float gatherShape(vec3 p,float t,int next){
  float w=gatherBlend(t);
  float s=w>.999?0.:skyShape(p,t);
  return w<.001?s:mix(s,shape(p,next),w);
}

// Which shape sits in scroll slot i, and how present shape id is right now
// (1 at its slot, falling to 0 half a slot away).
int shapeAt(int i){return int((i==0?shape0:i==1?shape1:i==2?shape2:i==3?shape3:i==4?shape4:shape5)+.5);}
float shapeWeight(int id){
  float w=0.;
  for(int i=0;i<6;i++){
    if(float(i)>=shapeCount)break;
    if(shapeAt(i)==id)w=max(w,1.-smoothstep(0.,.5,abs(progress-float(i))));
  }
  return w;
}

// 1 normally, falling to 0 as the chat pill forms, so the scroll's
// dispersal never reaches the panel.
float panelHold(){return 1.-install*install*(3.-2.*install);}
// 0 at each shape, 1 at the midpoint between two shapes.
// The detail view (dive): the material frays and streams outward at full
// density (diveSpread, in shapeField and density); only once it is mostly
// gone does what is left fade (diveFade), bare sky at 1. Back out, in reverse.
float diveSpreadNow(){return dive*dive*(3.-2.*dive);}
float diveSpread(){return gSpread;}
// The fraying leads: the shape turns to wisps first, then they travel.
float diveFrayNow(){return smoothstep(0.,.45,dive);}
float diveFray(){return gFray;}
float diveFadeNow(){return 1.-smoothstep(min(dvFade,.98),1.,dive);}
float diveFade(){return gFade;}
float burstAt(float t){return max(pow(max(sin(t*3.14159265),0.),dCurve),forceBurst)*panelHold();}
// The chat morph disperses on the way like a scroll morph does.
float installBurst(){return pow(max(sin(install*3.14159265),0.),dCurve);}
bool skyFirst(){return shapeCount>0.&&shapeAt(0)==4;}
bool openFirst(){return shapeCount>0.&&shapeAt(0)==7;}
bool fogFirst(){return openFirst()&&openingVariant>1.5;}
// The block and the fog are carved down to the next shape as the first
// morph runs, not cross-faded; the planet cross-fades.
bool carveFirst(){return openFirst()&&abs(openingVariant-1.)>.5;}
// The pointer's trail over the block or the fog (wipeTrail): how deep it cuts
// at p (0..1). Each point heals over its own time; the brush edge wobbles so
// the wiped patch is never a clean disc.
float trailCut(vec3 p){
  float heal=max(openingVariant>1.5?oFogHeal:oCarveHeal,.1);
  if(!carveFirst()||progress>.5||time-wipeLatest>heal)return 0.;
  float R=oBrush*(.75+.5*noise(vec3(p.xy*2.2,time*.3)));
  float w=0.;
  for(int i=0;i<24;i++){
    vec4 c=wipeTrail[i];
    if(c.w<=0.)continue;
    float f=c.w*(1.-smoothstep(0.,heal,time-c.z));
    vec2 q=p.xy-c.xy;
    w=max(w,f*exp(-dot(q,q)/(R*R)));
  }
  return w*(1.-smoothstep(0.,.5,progress));
}
// The cut, added to the distance. The fog thins evenly front to back, clean
// through over most of the brush, so the rim billows like the rest; the
// block is pushed in from its front face, less with depth: a groove.
float cutShift(vec3 p,float cut){
  if(openingVariant>1.5)return (oFogDepth*cScale+.45)*oWipe*smoothstep(.05,.6,cut);
  float front=1.1*oBlockSize*cScale;
  return 2.*oCarve*cut*(1.-smoothstep(0.,oCarve+.3,front-p.z));
}
float gatherT(){return skyFirst()?clamp(progress,0.,1.):1.;}
// Scroll dispersal right now. None while the first morph gathers the sky.
float scrollBurst(){return skyFirst()&&progress<1.?forceBurst*panelHold():burstAt(progress-floor(progress));}
// From the sky, the chat morph gathers instead of dispersing.
float chatBurst(){return installBurst()*(skyFirst()?smoothstep(0.,1.,progress):1.);}
float transitionBurstNow(){return max(scrollBurst(),chatBurst());}
float transitionBurst(){return gBurst;}

// Chat pill: a long, rounded cloud in the same material as every other
// shape; it grows downward by chatGrow to hold the slash-command menu. The
// typed text and the menu are HTML laid over it.
// Sunset palette, after a photo of an evening sky: slate blue-grey above,
// warm peach toward the horizon, clouds lit gold-orange with slate-lavender
// shadows, all a little brighter than the photo.
const vec3 SKY_TOP=vec3(.47,.53,.61);
const vec3 SKY_LOW=vec3(.97,.80,.64);
const vec3 SUN_LIT=vec3(1.,.70,.42);
const vec3 SHADE=vec3(.44,.46,.55);
float chatPill(vec3 p){
  float W=chatHalfW/cScale,H=chatHalfH/cScale,G=chatGrow/cScale*.5;
  // The body is a solid, rounded volume like the other objects, turned with
  // the same view angle; its cross-section is nearly round.
  vec3 o=p-vec3(0.,chatShift/cScale,0.);
  o.xz=rViewX*o.xz;
  o.yz=rViewY*o.yz;
  vec2 ob=abs(o.xy+vec2(0,G))-vec2(W-H,G);
  float r=H*.8,t=H*.15;
  vec2 q=vec2(length(max(ob,0.))+min(max(ob.x,ob.y),0.)-H+r,abs(o.z)-t);
  float d=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
  // Option pills: small pills as deep as the chat pill, so as dense, each
  // turned about its own centre so it stays under its HTML label.
  for(int i=0;i<8;i++){
    if(float(i)>=chatChipCount)break;
    vec4 c=chatChips[i]/cScale;
    if(c.w<.004)continue;
    vec3 e=p-vec3(c.xy,0.);
    e.xz=rViewX*e.xz;
    e.yz=rViewY*e.yz;
    float R=min(c.w,H);
    vec2 eb=abs(e.xy)-vec2(c.z-R,c.w-R);
    float er=R*.8;
    vec2 eq=vec2(length(max(eb,0.))+min(max(eb.x,eb.y),0.)-R+er,abs(e.z)-(H*.95-er));
    float dc=length(max(eq,0.))+min(max(eq.x,eq.y),0.)-er;
    if(dc<d){d=dc;chatCalm=1.-R/H;chatFade=chatChipLook[i].x;}
  }
  return d;
}

// Cursor disturbance, in camera space (the camera is orthographic, so the
// cursor maps straight onto x and y). Material near the cursor is pushed out,
// dragged along with its motion and churned; the hollow it leaves is thinned in
// density(). JS raises the strength while the cursor moves and lets it heal.
// The reach wobbles with slow noise so the stirred patch is never a clean disc.
// The opening sky takes a gentler touch, back to full by the next shape.
float pointerScale(){return skyFirst()?mix(.4,1.,smoothstep(0.,1.,progress)):1.;}
bool traceView(){return viewMode>.5&&viewMode<2.5;} // solid or normals
float disturbWeight(vec3 p){
  if(pointer.z<.002||traceView())return 0.;
  vec2 q=p.xy-pointer.xy;
  float R=pointer.w*(.75+.5*noise(vec3(p.xy*1.4+7.,time*.35)));
  return exp(-dot(q,q)/(R*R))*pointer.z*pointerScale();
}
vec3 disturb(vec3 p){
  float f=disturbWeight(p);
  if(f<.004)return p;
  vec2 q=p.xy-pointer.xy;
  // Push outward smoothly: zero at the cursor, so there is no pinch point.
  p.xy-=q*f*.6;
  p.xy-=pointerVel*f*.1;
  // Churn: two octaves of drifting noise, offset by the cursor so the pattern
  // flows as it moves instead of spinning in place.
  vec3 c=p*1.15+vec3(pointer.xy*.6,time*.8);
  vec3 w=vec3(noise(c),noise(c+vec3(5.2,1.3,2.8)),noise(c+vec3(2.1,7.7,3.)));
  vec3 c2=c*2.07+vec3(3.1,0,1.7);
  w+=.5*vec3(noise(c2),noise(c2+vec3(5.2,1.3,2.8)),noise(c2+vec3(2.1,7.7,3.)));
  p+=(w/1.5-.5)*f*1.3;
  return p;
}
float hollow(vec3 p){
  if(pointer.z<.002)return 1.;
  vec2 q=p.xy-pointer.xy;
  float R=pointer.w*.5*(.7+.6*noise(vec3(p.xy*2.3,time*.5)));
  return 1.-.3*pointer.z*pointerScale()*exp(-dot(q,q)/(R*R));
}

// A camera-plane direction turned into the shape's own frame: the same view
// and pose turns shapeField gives its point.
vec3 toObject(vec3 v){
  v.xz=rViewX*v.xz;
  v.yz=rViewY*v.yz;
  v.xy=rWobble*v.xy;
  v.xz=rPoseX*v.xz;
  v.yz=rPoseY*v.yz;
  v.xy=rPoseZ*v.xy;
  return v;
}

float shapeField(vec3 p){
  crispMask=0.;wordMask=0.;skyDepth=0.;chatCalm=0.;chatFade=1.;
  p/=cScale;
  vec3 facing=p; // camera-facing copy for the chat pill
  p.xz=rViewX*p.xz;
  p.yz=rViewY*p.yz;
  p.xy=rWobble*p.xy;
  p.xz=rPoseX*p.xz;
  p.yz=rPoseY*p.yz;
  p.xy=rPoseZ*p.xy;
  p/=pose.w;
  int a=int(clamp(floor(progress),0.,max(shapeCount-2.,0.))); // slot; shapeAt(a) is its shape
  float t=clamp(progress-float(a),0.,1.);
  float burst=transitionBurst();
  float scale=1.+burst*dExpand;
  vec3 samplePoint=p,flatPoint=facing;
  float fracture=0.;
  if(burst>.001){
    float ts=time*dDriftSpeed;
    vec3 q=p*dDriftScale;
    vec3 drift=vec3(noise(q+vec3(ts*.04,3.,1.)),noise(q*.91+vec3(11.,ts*.035,5.)),noise(q*1.055+vec3(7.,2.,ts*.045)))-.5;
    samplePoint=p/scale+drift*(dDrift*look.z*burst);
    samplePoint.xy=rotate(dSwirl*burst*length(p.xy)*.5)*samplePoint.xy;
    samplePoint.y+=dLift*burst;
    flatPoint=facing/scale+drift*(dDrift*look.z*burst);
    flatPoint.y+=dLift*burst;
    fracture=(noise(p*dFractureScale+vec3(ts*.065,7.,0.))-dFractureBias)*dFracture*look.z*burst;
  }
  float sp=diveSpread();
  if(dive>.001){
    // The detail view's dispersal (params.js dive group). The material frays
    // (dvFray) and is carved by a ridged erosion (dvErode) into thin sheets and
    // filaments: wisps. Broad, slow eddies carry each region off its own way
    // (dvDrift), with no centre, so nothing swells; dvLift lifts it on screen.
    // dvReach adds a push outward from the centre, by an amount that varies in
    // blotches (not by direction, which drew petals). Erosion deepens toward
    // the end (dvWear), wearing the wisps away. Density never drops here.
    float fr=diveFray();
    vec3 shift=vec3(0);
    float core=0.;
    if(dvReach>0.){
      // Outward across the screen (the camera plane), never toward the camera,
      // where material would grow to cover the view: the direction is taken
      // before the view and pose turns, then turned the same way.
      float r=length(facing.xy)/pose.w;
      vec3 dir=toObject(vec3(facing.xy/max(length(facing.xy),.001),0.));
      float reach=sp*dvReach*(.3+noise(p*.9+vec3(4.1,1.7,time*.05)));
      shift+=dir*reach;
      core=max(reach-r,0.); // the space it leaves stays empty
    }
    if(dvDrift>0.){
      vec3 q=p*dvDriftScale+vec3(2.3,time*.03,7.1);
      shift+=(vec3(noise(q),noise(q+vec3(8.3,2.9,4.4)),noise(q+vec3(3.7,9.2,1.6)))-.5)*(2.*dvDrift*sp);
    }
    if(dvLift!=0.)shift+=toObject(vec3(0,1,0))*(dvLift*sp);
    if(dvFray>0.){
      vec3 q=p*2.1+vec3(0.,time*.08,0.);
      shift+=(vec3(noise(q),noise(q+vec3(5.2,1.3,2.8)),noise(q+vec3(9.1,7.4,3.3)))-.5)*(fr*dvFray);
    }
    samplePoint-=shift;
    float n=noise(p*3.3+vec3(1.,time*.06,5.));
    fracture+=fr*dvErode*abs(n-.5)*2.+sp*sp*sp*dvWear+core;
  }
  float ease=t*t*(3.-2.*t);
  // Two shape() call sites, not four: each copies the whole shape library.
  float d=0.;
  if(install<=.999){
    if(a==0&&skyFirst())d=gatherShape(samplePoint,t,shapeAt(1));
    else{
      float d0=ease>.999?0.:shape(samplePoint,shapeAt(a));
      float d1=ease<.001?0.:shape(samplePoint,shapeAt(a+1));
      // Carving: everything farther than a shrinking margin from the next
      // shape is cut away, so the block or fog is pared down to it.
      // The fog's margin is uneven, so it clears in patches.
      float margin=3.2*(1.-ease)*(fogFirst()?.25+1.5*noise(samplePoint*.5+vec3(1.,4.,time*.05)):1.);
      d=ease<.001?d0:ease>.999?d1:a==0&&carveFirst()?max(d0,d1-margin):mix(d0,d1,ease);
    }
  }
  d*=pose.w;
  if(install>.001){
    // From the sky the gathered clouds already sit on the pill, so it takes
    // over late; elsewhere the shapes cross-fade through the dispersal.
    float e=a==0&&skyFirst()?mix(smoothstep(.55,1.,install),install*install*(3.-2.*install),t):install*install*(3.-2.*install);
    d=mix(d,chatPill(flatPoint),e);
    crispMask*=1.-e;
    chatCalm*=e;chatFade=mix(1.,chatFade,e);
  }
  return (d*scale+fracture)*cScale;
}

float field(vec3 p){
  float d=shapeField(disturb(p)),cut=trailCut(p); // the cut shades too, so a groove's floor is lit
  return cut>.001?d+cutShift(p,cut):d;
}

float marchD=0.; // the last density sample's distance to the shape, for empty-space skipping
float density(vec3 p){
  float thin=hollow(p);
  vec3 p0=p;
  float stir=disturbWeight(p);
  p=disturb(p);
  float d=shapeField(p);
  // The pointer's trail cuts into the block's front face, or wipes the fog
  // clean through: a plane behind the front, pushed back where the trail is.
  // Round the fog's wiped patch the rest thins, like breath on glass.
  float cut=trailCut(p0);
  if(cut>.001){
    d+=cutShift(p0,cut);
    if(openingVariant>1.5)thin*=1.-.75*oWipe*smoothstep(0.,.45,cut);
  }
  // Hover: the object under the pointer fluffs up. Its surface swells and
  // billows more, in bigger lumps, with softer edges; all in the material.
  float hv=objHover;
  float puff=cPuff*(1.+hv*hvPuff),soft=cSoftness*(1.+hv*hvSoft),lumps=1.+hv*hvLumps;
  d-=hv*hvSwell;
  marchD=d;
  if(traceView())return 0.; // the traced views need only the distance
  if(d>.22*max(puff*look.y,1.)*(1.+.3*(lumps-1.))+max(soft*look.w-.1,0.))return 0.;
  float bt=time*cBillow;
  // The texture follows the displacement only partly, so stirred material
  // reads as churned rather than stretched into smooth streaks.
  vec3 pt=mix(p0,p,.45);
  float skyW=skyFirst()?1.-smoothstep(0.,1.,progress):0.; // the opening sky's small clouds
  float wordW=wordMask*skyW; // the sky's wordmark: thinner, softer, barely billowed
  farMask=skyW*(1.-smoothstep(-1.5,-.6,skyDepth)); // far-back sky clouds: paler and thinner
  // Clouds far back do not join the loop or the chat pill: they fade out as
  // the gathering starts, and skyShape() skips them once gone.
  float farGone=skyDepth<-1.?smoothstep(0.,.45,max(gatherMove(gatherT()),pillMove)):0.;
  pt*=mix(1.,1.7,skyW);
  float n=fbm(pt*(cTexture*(1.+hv*hvGrain))+vec3(bt*.09,bt*.025,0));
  float coarse=noise(pt*cLumps+vec3(0,bt*.04,0));
  // Extra billow where stirred. Coarse, and nearly constant along the view
  // axis, so the fixed raymarch steps cannot alias it into per-pixel grain.
  if(stir>0.)d+=(noise(vec3(p0.xy*cTexture*.8,p0.z*1.5+time*1.2))-.5)*.16*stir*puff*look.y;
  float burst=transitionBurst(),sp=diveSpread();
  float detail=max(gW2,.8*gW3)*(1.-max(burst,sp));
  float crisp=crispMask*max(gW2,gW3)*(1.-burst);
  d+=((n-.5)*.21+(coarse-.5)*.13*lumps)*puff*look.y*mix(1.,.5,detail)*mix(1.,.12,crisp)*mix(1.,.7,skyW)*mix(1.,.25,wordW)*(1.-chatCalm);
  float edge=soft*look.w*mix(1.,.55,detail)*mix(1.,.55,crisp)*mix(1.,.5,wordW)*(1.-.5*chatCalm);
  float fragments=mix(1.,smoothstep(dFragmentCut,dFragmentCut+max(dFragmentSoft,.001),coarse),burst*dFragments*look.z);
  return (1.-smoothstep(-edge,edge,d))*(1.-.5*cContrast+n*cContrast)*fragments*mix(1.,1.-dThinning,burst)*thin*mix(1.,.62,wordW)*mix(1.,.65,farMask)*(1.-farGone)*chatFade*diveFade();
}

// Debug views (viewMode) show the bare geometry: shapeField without the cloud
// material or the cursor. They reuse the raymarch loop's one density() call,
// because every extra call site copies the whole shape library into the
// shader and slows every view, the cloud included.
// Solid: clay under a fixed studio light from the upper left, so the form
// reads the same at any sun setting. Normals: the normal as a colour.
vec3 surfaceColor(vec3 n,float ao){
  if(viewMode>1.5)return n*.5+.5;
  vec3 key=normalize(vec3(-.5,.65,.6));
  float diff=max(dot(n,key),0.);
  float rim=pow(1.-max(n.z,0.),3.);
  return vec3(.88,.86,.83)*(vec3(.32,.34,.40)*ao*(.75+.25*n.y)+vec3(1.,.96,.9)*diff*.85)+rim*.12;
}
// Cost: field evaluations per pixel, dark blue (none) through green and
// yellow to red (2.5 per raymarch step or more).
vec3 heat(float x){
  vec3 c=mix(vec3(.05,.07,.2),vec3(.1,.45,.9),smoothstep(0.,.25,x));
  c=mix(c,vec3(.2,.8,.3),smoothstep(.25,.5,x));
  c=mix(c,vec3(1.,.85,.1),smoothstep(.5,.75,x));
  return mix(c,vec3(1.,.15,.1),smoothstep(.75,1.,x));
}

void main(){
  // The view fits the canvas above frameInset (the footer), so the shape
  // centres in the space above the footer; the sky still fills the canvas.
  float aspect=size.x/(size.y*(1.-frameInset));
  // Fit the view so every shape stays whole: at least 6.4 units wide (5.44 on
  // narrow screens) and 4.2 units tall, zooming out when the canvas is short.
  float width=max((aspect<.7?6.8:8.)/1.25,4.2*aspect);
  float height=width/aspect;
  skyHalf=width*.5/cScale;
  viewHalfH=height/cScale;
  int sa=int(clamp(floor(progress),0.,max(shapeCount-2.,0.)));
  float st=clamp(progress-float(sa),0.,1.),se=st*st*(3.-2.*st);
  pose=mix(slotPose[sa],slotPose[sa+1],se);
  look=mix(slotLook[sa],slotLook[sa+1],se);
  pillMove=skyFirst()&&progress<1.?smoothstep(0.,.75,install)*(1.-progress):0.;
  rViewX=rotate(viewAngle.x);rViewY=rotate(viewAngle.y);rWobble=rotate(.025*sin(time*.2));
  rPoseX=rotate(pose.x);rPoseY=rotate(pose.y);rPoseZ=rotate(pose.z);
  gBurst=transitionBurstNow();gSpread=diveSpreadNow();gFray=diveFrayNow();gFade=diveFadeNow();
  gW2=shapeWeight(2);gW3=shapeWeight(3);
  vec3 origin=vec3(vec2(uv.x,(uv.y-frameInset)/(1.-frameInset))*vec2(width,height)*.5,5.);
  vec3 ray=vec3(0,0,-1);
  float skyY=uv.y*.5+.5;
  vec3 sky=mix(SKY_LOW,SKY_TOP,pow(skyY,.65)); // one sky for every slot
  sky+=.012*noise(vec3(uv*40.,0));
  vec3 result=vec3(0);
  float transmittance=1.;
  float tb=transitionBurst();
  vec2 bound=vec2(3.2,2.2)*1.08*cScale*(1.+tb*(dExpand*1.5+dDrift*.5+abs(dLift))+diveSpread()*(dvReach*.5+dvDrift+abs(dvLift))+diveFray()*dvFray*.25);
  if(install>.001){
    bound.y=max(bound.y,abs(chatShift)+chatHalfH+chatGrow+.3); // room for the grown pill
    for(int i=0;i<8;i++){ // and its option pills
      if(float(i)>=chatChipCount)break;
      vec4 c=chatChips[i];
      bound=max(bound,vec2(abs(c.x)+c.z,abs(c.y)+c.w)+.3);
    }
  }
  bool inBound=abs(origin.x)<bound.x&&abs(origin.y)<bound.y;
  if(skyFirst()&&progress<1.&&install<.999){
    // The sky's clouds reach past the edges, so instead of a bound, pixels no
    // cloud can reach return at once.
    float t=gatherT();
    inBound=skyReaches(origin.xy/cScale,t)||((gatherBlend(t)>0.||install>.001)&&inBound);
  }
  if(fogFirst()&&progress<1.)inBound=true; // the fog fills the canvas
  // Haze: the sky's lower clouds, nearer the horizon, fade toward the sky.
  float haze=skyFirst()?(1.-smoothstep(0.,1.,progress))*.55*(1.-skyClear)*(1.-smoothstep(.0,.6,skyY))*panelHold():0.;
  if(!inBound||dive>.999&&viewMode<.5){color=viewMode>3.5?vec4(heat(0.),1.):vec4(sky*(1.-transparentBackground),0.);return;}
  float distance=2.4;
  float dt=5.2/float(steps);
  // Interleaved gradient noise: spreads the step offset evenly between
  // neighbouring pixels, so banding turns into a fine, even dither, not speckle.
  float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  distance+=jitter*dt;
  float az=radians(cSunAz),el=radians(cSunEl);
  vec3 sun=vec3(cos(el)*sin(az),sin(el),cos(el)*cos(az));
  // Traced views: phase 0 sphere-traces to the surface, phases 1-4 take the
  // four normal samples around the hit, phase 5 one occlusion sample.
  bool trace=traceView();
  float traced=2.4,ao=1.;
  int phase=0;
  vec3 hitP=vec3(0),nrm=vec3(0);
  float cloudOpacity=viewMode>2.5&&viewMode<3.5?.35:1.;
  float evals=0.,entry=-1.; // cost view; x-ray: where the ray first enters the shape
  for(int i=0;i<160;i++){
    if(trace){
      if(i>=steps+64)break;
      vec3 k=phase==1?vec3(1,-1,-1):phase==2?vec3(-1,-1,1):phase==3?vec3(-1,1,-1):vec3(1);
      density(phase==0?origin+ray*traced:phase<5?hitP+k*.002:hitP+nrm*.15);
      float d=marchD;
      if(phase==0){
        if(d<.0015){hitP=origin+ray*traced;phase=1;}
        else{traced+=max(d*.8,.004);if(traced>7.6)break;}
      }else if(phase<5){nrm+=k*d;phase++;if(phase==5)nrm=normalize(nrm);}
      else{ao=.55+.45*clamp(d/.15,0.,1.);break;}
      continue;
    }
    if(i>=steps||transmittance<.015)break;
    vec3 p=origin+ray*distance;
    float den=density(p);
    evals+=1.;
    if(entry<0.&&marchD<0.)entry=distance;
    if(den>.001){
      evals+=4.;
      float optical=0.;
      for(int j=1;j<=4;j++){
        float s=float(j)*.17;
        optical+=(1.-smoothstep(-.10,.12,field(p+sun*s)))*.17;
      }
      float direct=exp(-optical*cAbsorb);
      float powder=1.-exp(-den*2.);
      vec3 light=mix(SHADE*cShade,SUN_LIT*cLight,direct);
      light+=vec3(.04,.03,.02)*powder;
      light=mix(light,sky,max(haze,.6*farMask));
      float alpha=(1.-exp(-den*dt*cDensity*look.x))*cloudOpacity;
      result+=transmittance*alpha*light;
      transmittance*=1.-alpha;
    }
    // Well clear of the shape, step by a safe share of the distance to it
    // instead of one small step. Near it, the even steps resume.
    distance+=den>.001?dt:max(dt,(marchD-.5)*.6/(1.+diveFray()*dvFray*2.+diveSpread()*dvDrift));
  }
  if(trace){color=vec4(phase==5?surfaceColor(nrm,ao):sky,1.);return;}
  if(viewMode>3.5){color=vec4(heat(evals/(float(steps)*2.5)),1.);return;}
  // X-ray: the shape's silhouette in clay, nearer parts lighter, behind a faint cloud.
  vec3 back=cloudOpacity<1.&&entry>0.?vec3(.88,.86,.83)*clamp(1.-(entry-4.)*.45,.4,1.):sky;
  float alpha=1.-transmittance;
  // Alpha is the cloud's coverage either way: the texture pass reads it for the
  // sun beams and draws the canvas opaque.
  color=transparentBackground>.5?vec4(result/max(alpha,.0001),alpha):vec4(result+back*transmittance,1.-transmittance);
}`;
