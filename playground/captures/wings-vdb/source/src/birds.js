// Bird flocks: a 3D boids simulation. The renderer (cloud-morph.js) draws each
// bird as a procedural silhouette into its own layer, and the texture pass
// (post.js) lays that layer under the texture, hiding a bird in the cloud
// where it flies behind a shape.
//
// Space: view space in the cloud's world units: x right, y up the screen, z
// toward the camera, z 0 the cloud's plane. A bird at depth z draws at
// D / (D - z) of its size, and its position shrinks toward the frame centre
// the same way. The camera sees the birds from a little below (PITCH): their
// up tilts away from it, so wings and V formations open up on screen.
//
// Two kinds of flock. Songbirds: loose boids (separation, alignment,
// cohesion, wander) following a wavy path across the screen, in bounding
// flight (bursts of wingbeats, then wings folded for a glide), and now and
// then splitting in two and rejoining. Geese: a V behind a leader, each bird
// steering for its slot, wingbeats rippling back along the arms.

const D = 8;
const PITCH = 0.85;
const UP = [0, Math.cos(PITCH), -Math.sin(PITCH)];
const MAX_BIRDS = 512;
const MAX_FLOCKS = 4;
export const FLOATS_PER_BIRD = 20; // five vec4s, see pack()
export const flockKinds = ['mixed', 'songbirds', 'geese'];

// Sizes in world units at depth 0: span is wingtip to wingtip, length nose to
// tail; nose, tail and shoulder are fractions of length from the centre; body
// and chord are the body's radius (of length) and the wing's depth (of the
// half span).
const KINDS = {
  songbirds: { count: [9, 24], span: 0.11, length: 0.06, nose: 0.5, tail: 0.5, shoulder: 0.1, body: 0.17, chord: 0.36, neck: 0.6, speed: 0.95, flapHz: 6.2, amp: 0.95, bounding: true },
  geese: { count: [5, 13], span: 0.26, length: 0.15, nose: 0.62, tail: 0.38, shoulder: 0.06, body: 0.1, chord: 0.3, neck: 0.3, speed: 0.72, flapHz: 2.3, amp: 0.62, bounding: false },
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a, fallback = [1, 0, 0]) => { const n = len(a); return n > 1e-9 ? mul(a, 1 / n) : fallback; };
const limit = (a, max) => { const n = len(a); return n > max ? mul(a, max / n) : a; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const scaleAt = z => D / (D - z);
// Seconds to the next flock, for a uniform draw u and flocks per minute.
export const flockDelay = (u, often) => Math.max(3, -Math.log(1 - u) * 60 / Math.max(0.1, often));

export function createFlocks({ random = Math.random } = {}) {
  const rand = (lo, hi) => lo + (hi - lo) * random();
  const flocks = [];
  const options = { enabled: true, often: 4, kind: 'mixed', size: 1, count: 1, speed: 1 };
  let untilNext = rand(2, 5); // the first flock comes soon after the page opens
  const data = new Float32Array(MAX_BIRDS * FLOATS_PER_BIRD);
  let packed = 0, lastView = null;
  const spawned = []; // when flocks set off, ms, the last five minutes

  // Depth: mostly far behind the shapes, some just behind, a few in front.
  function pickDepth() {
    const r = random();
    if (r < 0.12) return rand(0.6, 2.2);
    if (r < 0.4) return rand(-3.5, -0.8);
    return rand(-12, -3.5);
  }

  function spawn(view, kindName, { z: depth } = {}) {
    if (!options.enabled || !view || flocks.length >= MAX_FLOCKS) return false;
    const room = MAX_BIRDS - flocks.reduce((n, f) => n + f.birds.length, 0);
    let name = kindName && kindName !== 'mixed' ? kindName : options.kind;
    if (name === 'mixed') name = random() < 0.62 ? 'songbirds' : 'geese';
    const k = KINDS[name];
    const count = Math.min(room, Math.max(name === 'geese' ? 3 : 4, Math.round(rand(...k.count) * options.count)));
    if (count < 3) return false;
    // Flocks drift toward or away from the camera as they cross, so they are
    // seen at an angle, not always broadside.
    const z = Number.isFinite(depth) ? depth : pickDepth();
    const zEnd = clamp(z + rand(-1, 1) * (z > 0.4 ? 1.2 : z > -3.5 ? 2.5 : 6), -14, 2.6);
    const dir = random() < 0.5 ? 1 : -1;
    const size = options.size;
    const extent = (name === 'geese' ? count * 0.07 : 0.35) * size + 0.3; // screen units past the edge to start from
    const s0 = scaleAt(z), s1 = scaleAt(zEnd);
    const y0 = rand(-0.15, 0.85) * view.top, y1 = clamp(y0 + rand(-0.4, 0.4) * view.top, -0.25 * view.top, 0.95 * view.top);
    const start = [-dir * (view.halfWidth + extent) / s0, y0 / s0, z];
    const end = [dir * (view.halfWidth + extent) / s1, y1 / s1, zEnd];
    const across = norm(sub(end, start));
    const flock = {
      name, k, size, dir, start, end, t: 0,
      length: len(sub(end, start)),
      speed: k.speed * options.speed * rand(0.9, 1.1),
      side: norm([-across[1], across[0], 0]),
      wave: [rand(0.05, 0.25), rand(0.6, 1.6), rand(0, 6.28)], // amplitude, waves per crossing, phase
      bob: [rand(0.03, 0.12), rand(1, 2.5), rand(0, 6.28)],
      split: { wait: rand(4, 9), timer: 0, offset: [0, 0, 0] },
      birds: [],
    };
    const heading = mul(across, flock.speed);
    for (let i = 0; i < count; i++) {
      const b = {
        p: [0, 0, 0], v: heading.slice(), acc: [0, 0, 0],
        phase: rand(0, 6.28), flapW: 1, gliding: false, bout: rand(0.2, 1.2), bank: 0,
        rate: rand(0.88, 1.12), scale: rand(0.88, 1.1), group: 0,
        wander: [rand(-1, 1), rand(-1, 1), rand(-0.3, 0.3)],
        rank: Math.ceil(i / 2), wing: i % 2 ? 1 : -1, jitter: [rand(-1, 1), rand(-1, 1), rand(-1, 1)], lag: rand(-0.25, 0.25),
      };
      if (name === 'geese') b.p = add(start, slotOffset(flock, b, across));
      else b.p = add(start, [rand(-0.3, 0.3), rand(-0.18, 0.18), rand(-0.15, 0.15)]);
      flock.birds.push(b);
    }
    flocks.push(flock);
    const now = performance.now();
    spawned.push(now);
    while (now - spawned[0] > 300000) spawned.shift();
    return true;
  }

  // The flock's path: a straight crossing with a slow wave across it and a bob.
  function pathAt(f, u) {
    const base = add(f.start, mul(sub(f.end, f.start), u));
    const w = f.wave[0] * Math.sin(u * f.wave[1] * 6.2832 + f.wave[2]);
    const b = f.bob[0] * Math.sin(u * f.bob[1] * 6.2832 + f.bob[2]);
    return add(add(base, mul(f.side, w)), [0, b, 0]);
  }

  // A goose's slot behind and beside the leader; forward is the leader's heading.
  function slotOffset(f, b, forward) {
    if (b.rank === 0) return [0, 0, 0];
    const gap = f.k.span * f.size * 0.6;
    const lateral = norm(cross(forward, UP));
    const jitter = mul(b.jitter, gap * 0.12);
    return add(add(mul(forward, -b.rank * gap * 0.75), mul(lateral, b.wing * b.rank * gap * 0.7)), jitter);
  }

  function steerFlock(f, dt) {
    const u = f.t * f.speed / f.length;
    const target = pathAt(f, u);
    const pathVel = mul(sub(pathAt(f, u + 0.01), target), f.speed / (0.01 * f.length));
    const k = f.k, birds = f.birds;
    // Split and rejoin: part of the flock heads for an offset path for a few
    // seconds, keeping to its own group, then the offset lifts and they merge.
    const sp = f.split;
    if (sp.timer > 0) { sp.timer -= dt; if (sp.timer <= 0) { sp.offset = [0, 0, 0]; sp.wait = rand(5, 10); } }
    else if ((sp.wait -= dt) <= 0 && birds.length >= 6) {
      sp.timer = rand(2.5, 4.5);
      const lift = rand(0.25, 0.45) * (random() < 0.5 ? -1 : 1) * f.size;
      sp.offset = f.name === 'geese' ? add(mul(f.side, lift * 0.6), mul(norm(pathVel), -lift * 0.5)) : add(mul(f.side, lift), [0, 0, rand(-0.2, 0.2)]);
      const across = f.side;
      const centre = birds.reduce((c, b) => add(c, mul(b.p, 1 / birds.length)), [0, 0, 0]);
      for (const b of birds) b.group = f.name === 'geese' ? (b.rank > birds.length / 4 && b.wing === (lift > 0 ? 1 : -1) ? 1 : 0) : (dot(sub(b.p, centre), across) * Math.sign(lift) > 0 ? 1 : 0);
    }
    const splitOn = sp.timer > 0;
    if (f.name === 'geese') {
      const leader = birds[0];
      const forward = norm(leader.v);
      for (const b of birds) {
        let desired;
        if (b === leader) desired = add(pathVel, mul(sub(target, b.p), 0.8));
        else {
          const slot = add(add(leader.p, slotOffset(f, b, forward)), splitOn && b.group ? sp.offset : [0, 0, 0]);
          desired = add(leader.v, limit(mul(sub(slot, b.p), 1.8), f.speed * 0.6));
        }
        let acc = mul(sub(desired, b.v), 2.6);
        acc = add(acc, mul(separation(b, birds, k.span * f.size * 0.45), 1.5));
        b.wander = norm(add(b.wander, [rand(-1, 1) * dt * 2, rand(-1, 1) * dt * 2, rand(-1, 1) * dt]));
        acc = add(acc, mul(b.wander, 0.06));
        b.acc = limit(acc, 1.6);
      }
      return;
    }
    const sepR = k.span * f.size * 0.75, near = 0.32 * f.size;
    for (const b of birds) {
      let sep = [0, 0, 0], ali = [0, 0, 0], coh = [0, 0, 0], n = 0;
      for (const o of birds) {
        if (o === b || (splitOn && o.group !== b.group)) continue;
        const d = sub(b.p, o.p), dist = len(d);
        if (dist < sepR && dist > 1e-6) sep = add(sep, mul(d, (1 - dist / sepR) / dist));
        if (dist < near) { ali = add(ali, o.v); coh = add(coh, o.p); n++; }
      }
      let acc = mul(sep, 4.5);
      if (n) {
        acc = add(acc, mul(sub(mul(ali, 1 / n), b.v), 1.1));
        acc = add(acc, mul(sub(mul(coh, 1 / n), b.p), 1.4));
      }
      const goal = splitOn && b.group ? add(target, sp.offset) : target;
      const desired = add(pathVel, limit(mul(sub(goal, b.p), 0.9), f.speed * 0.7));
      acc = add(acc, mul(sub(desired, b.v), 1.2));
      b.wander = norm(add(b.wander, [rand(-1, 1) * dt * 4, rand(-1, 1) * dt * 4, rand(-1, 1) * dt * 2]));
      acc = add(acc, mul(b.wander, 0.55));
      // Bounding flight: wingbeats lift, a folded glide sinks.
      acc = add(acc, mul(UP, b.gliding ? -0.7 : 0.3 * b.flapW));
      b.acc = limit(acc, 3);
    }
  }

  function separation(b, birds, radius) {
    let sep = [0, 0, 0];
    for (const o of birds) {
      if (o === b) continue;
      const d = sub(b.p, o.p), dist = len(d);
      if (dist < radius && dist > 1e-6) sep = add(sep, mul(d, (1 - dist / radius) / dist));
    }
    return sep;
  }

  function moveBirds(f, dt) {
    const k = f.k, lo = f.speed * 0.6, hi = f.speed * 1.45;
    const leader = f.birds[0];
    for (const b of f.birds) {
      b.v = add(b.v, mul(b.acc, dt));
      const speed = len(b.v);
      if (speed > hi) b.v = mul(b.v, hi / speed);
      else if (speed < lo) b.v = mul(norm(b.v), lo);
      b.p = add(b.p, mul(b.v, dt));
      // Bank into turns: the sideways pull, eased.
      const forward = norm(b.v), right = norm(cross(forward, UP));
      const goal = clamp(dot(b.acc, right) * 0.45, -0.9, 0.9);
      b.bank += (goal - b.bank) * (1 - Math.exp(-dt * 4));
      // Wingbeat: faster climbing; songbirds alternate bursts and folded
      // glides, longer glides when descending; geese glide only going down.
      const climb = clamp(dot(b.v, UP) / f.speed, -1, 1);
      if (k.bounding) {
        if ((b.bout -= dt) <= 0) {
          b.gliding = !b.gliding;
          b.bout = b.gliding ? rand(0.18, 0.5) * (1 + Math.max(0, -climb) * 1.5) : rand(0.35, 1.1) * (1 + Math.max(0, climb));
        }
      } else b.gliding = climb < -0.3;
      b.flapW += ((b.gliding ? 0 : 1) - b.flapW) * (1 - Math.exp(-dt * 10));
      const hz = k.flapHz * b.rate * (1 + 0.9 * Math.max(0, climb));
      if (f.name === 'geese' && b !== leader) {
        // A wave down each arm of the V: each rank a little behind the one ahead.
        const want = leader.phase - b.rank * 0.75 + b.lag;
        b.phase += leader.dPhase + (want - b.phase) * (1 - Math.exp(-dt * 3));
      } else { b.dPhase = 6.2832 * hz * dt * (0.25 + 0.75 * b.flapW); b.phase += b.dPhase; }
    }
  }

  function step(dt, view) {
    lastView = view;
    if (!options.enabled) { flocks.length = 0; return; }
    if (dt <= 0) return;
    if ((untilNext -= dt) <= 0) {
      spawn(view);
      untilNext = flockDelay(random(), options.often);
    }
    for (const f of flocks) {
      f.t += dt;
      steerFlock(f, dt);
      moveBirds(f, dt);
    }
    // A flock leaves once past the end of its path with every bird off screen.
    for (let i = flocks.length - 1; i >= 0; i--) {
      const f = flocks[i], u = f.t * f.speed / f.length;
      const gone = u > 1 && f.birds.every(b => { const s = scaleAt(b.p[2]); return Math.abs(b.p[0] * s) > view.halfWidth + 0.3 || b.p[1] * s > view.top + 0.4 || b.p[1] * s < view.bottom - 0.4; });
      if (gone || u > 1.8) flocks.splice(i, 1);
    }
  }

  // Each bird as five vec4s, in screen world units (the cloud's world units on
  // the frame, after the bird's own perspective), far birds first:
  // 0 nose.xy tail.xy; 1 left elbow.xy, left tip.xy; 2 right elbow, right tip;
  // 3 shoulder.xy, body radius, wing radius at the shoulder; 4 behind (0 in
  // front of the shapes, 1 behind them), haze (0 dark, 1 the colour behind),
// the head's radius as a share of the body's (a goose's thin neck), 0.
  function pack() {
    const all = [];
    for (const f of flocks) for (const b of f.birds) all.push([f, b]);
    all.sort((a, b) => a[1].p[2] - b[1].p[2]);
    packed = Math.min(all.length, MAX_BIRDS);
    for (let i = 0; i < packed; i++) packBird(all[i][0], all[i][1], i * FLOATS_PER_BIRD);
    return { data, count: packed };
  }

  function packBird(f, b, o) {
    const k = f.k, s = scaleAt(b.p[2]);
    const H = k.span * 0.5 * f.size * b.scale, L = k.length * f.size * b.scale;
    const forward = norm(b.v);
    let right = norm(cross(forward, UP), [0, 0, 1]), up = cross(right, forward);
    const cb = Math.cos(b.bank), sb = Math.sin(b.bank);
    [right, up] = [sub(mul(right, cb), mul(up, sb)), add(mul(up, cb), mul(right, sb))];
    // Wing pose: the inner wing swings about a raised mid-point; the outer
    // wing lags it and bends further. Wings partly fold on the upstroke, and
    // songbirds fold them in a glide.
    const w = b.flapW, sn = Math.sin(b.phase), up1 = Math.cos(b.phase) > 0 ? Math.cos(b.phase) : 0;
    const glide = k.bounding ? 0.18 : 0.07;
    const a1 = glide + w * (k.amp * (0.2 + 0.8 * sn) - glide);
    const a2 = a1 + w * k.amp * 0.55 * Math.sin(b.phase - 0.6);
    const fold = (1 - w) * (k.bounding ? 0.62 : 0) + w * 0.3 * up1;
    const reach = H * (1 - 0.7 * fold);
    const shoulder = mul(forward, k.shoulder * L);
    const wing = side => {
      const e = add(mul(right, side * Math.cos(a1)), mul(up, Math.sin(a1)));
      const t = add(mul(right, side * Math.cos(a2)), mul(up, Math.sin(a2)));
      const elbow = add(add(shoulder, mul(e, 0.45 * reach)), mul(forward, (0.08 - 0.2 * fold) * H));
      const tip = add(add(elbow, mul(t, 0.55 * reach)), mul(forward, -(0.28 + 0.3 * fold) * H));
      return [elbow, tip];
    };
    const [le, lt] = wing(-1), [re, rt] = wing(1);
    const nose = mul(forward, k.nose * L), tail = mul(forward, -k.tail * L);
    const at = q => [(b.p[0] + q[0]) * s, (b.p[1] + q[1]) * s];
    const pts = [at(nose), at(tail), at(le), at(lt), at(re), at(rt), at(shoulder)];
    // The wing's depth across its length on screen: wide seen from below, a
    // sliver edge on.
    const chord = mul(forward, k.chord * H);
    const ws = [pts[3][0] - pts[6][0], pts[3][1] - pts[6][1]], wl = Math.hypot(ws[0], ws[1]) || 1;
    const cs = [chord[0] * s, chord[1] * s];
    const wingR = Math.max(0.5 * Math.abs(ws[0] * cs[1] - ws[1] * cs[0]) / wl, 0.12 * k.chord * H * s) * (1 - 0.4 * fold);
    const z = b.p[2];
    const values = [
      ...pts[0], ...pts[1], ...pts[2], ...pts[3], ...pts[4], ...pts[5], ...pts[6],
      k.body * L * s, wingR,
      smooth(0.4, -1, z), clamp((-z - 0.5) / 14, 0, 0.7), k.neck, 0,
    ];
    data.set(values, o);
  }

  return {
    step, pack,
    // Send a flock now (kind: songbirds, geese, or mixed for either). view: from the renderer.
    // depth: a view-space z for the flock (tests); otherwise picked at random.
    spawn(kind, { depth } = {}) { return spawn(lastView, kind, { z: depth }); },
    setOptions(next) {
      Object.assign(options, next);
      if (!options.enabled) flocks.length = 0;
    },
    clear() { flocks.length = 0; },
    // For the drawer's birds tab.
    snapshot() { return { until: untilNext, spawned, halfWidth: lastView?.halfWidth, birds: flocks.flatMap(f => f.birds.map(b => ({ x: b.p[0], z: b.p[2], geese: f.name === 'geese' }))) }; },
    stats() { return { flocks: flocks.length, birds: flocks.reduce((n, f) => n + f.birds.length, 0), kinds: flocks.map(f => f.name) }; },
    vertexSource: birdVertex, fragmentSource: birdFragment,
  };
}

// One instanced quad per bird, covering its points; the fragment shader draws
// the silhouette from them as tapered strokes, antialiased in pixels.
const birdVertex = `#version 300 es
in vec2 corner;
in vec4 a0;
in vec4 a1;
in vec4 a2;
in vec4 a3;
in vec4 a4;
uniform vec2 size;  // the layer, pixels
uniform vec3 view;  // xy: the frame centre in pixels from the bottom left, z: pixels per world unit
out vec2 pp;
flat out vec4 v0;
flat out vec4 v1;
flat out vec4 v2;
flat out vec4 v3;
flat out vec4 v4;
vec2 toPx(vec2 w){return view.xy+w*view.z;}
void main(){
  v0=vec4(toPx(a0.xy),toPx(a0.zw));
  v1=vec4(toPx(a1.xy),toPx(a1.zw));
  v2=vec4(toPx(a2.xy),toPx(a2.zw));
  v3=vec4(toPx(a3.xy),a3.zw*view.z);
  v4=a4;
  vec2 lo=min(min(min(v0.xy,v0.zw),min(v1.xy,v1.zw)),min(v2.xy,v2.zw));
  vec2 hi=max(max(max(v0.xy,v0.zw),max(v1.xy,v1.zw)),max(v2.xy,v2.zw));
  float pad=max(v3.z,v3.w)+2.;
  pp=mix(lo-pad,hi+pad,corner);
  gl_Position=vec4(pp/size*2.-1.,0.,1.);
}`;

const birdFragment = `#version 300 es
precision highp float;
in vec2 pp;
flat in vec4 v0;
flat in vec4 v1;
flat in vec4 v2;
flat in vec4 v3;
flat in vec4 v4;
out vec4 color;
// Distance to a stroke from a to b whose radius tapers from ra to rb.
float seg(vec2 p,vec2 a,vec2 b,float ra,float rb){
  vec2 pa=p-a,ba=b-a;
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);
  return length(pa-ba*h)-mix(ra,rb,h);
}
void main(){
  // Strokes thinner than a pixel stay a pixel wide and fade instead, so far
  // birds read as faint marks rather than breaking up.
  float rb=max(v3.z,.6),rw=max(v3.w,.6);
  float kb=min(1.,v3.z/.6),kw=min(1.,v3.w/.6);
  vec2 sh=v3.xy;
  float body=min(seg(pp,v0.xy,sh,rb*v4.z,rb),seg(pp,sh,v0.zw,rb,rb*.4));
  float wl=min(seg(pp,sh,v1.xy,rw,rw*.7),seg(pp,v1.xy,v1.zw,rw*.7,rw*.12));
  float wr=min(seg(pp,sh,v2.xy,rw,rw*.7),seg(pp,v2.xy,v2.zw,rw*.7,rw*.12));
  float c=max(clamp(.5-body,0.,1.)*kb,clamp(.5-min(wl,wr),0.,1.)*kw);
  if(c<.002)discard;
  color=vec4(v4.x,v4.y,0.,1.)*c; // premultiplied: behind, haze, -, coverage
}`;
