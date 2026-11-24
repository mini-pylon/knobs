// Dependency-free WebGL 2 / WebGL 1 cloud renderer. Progress runs 0 to `last`
// across the shapes. Ported from the reference repo, with dispersal uniforms and a
// hot-swappable fragment shader.
// Two passes: the cloud renders offscreen at the quality profile's resolution,
// then the texture pass (postSource, see post.js) draws it to the canvas at full
// resolution with a global texture on top. The texture pass also redraws on its
// own at 24 fps for animated textures, so grain moves while the cloud is still.
// Birds (birds.js, WebGL 2 only) draw into a layer of their own at canvas
// resolution before the texture pass, which lays them under the texture.

// Used when no texture pass is given or it fails to compile: a plain copy.
const BLIT_SOURCE = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D scene;
uniform vec2 size;
void main(){color=texture(scene,gl_FragCoord.xy/size);}`;
const POST_UNIFORMS = ['scene', 'size', 'px', 'time', 'mode', 'strength', 'beams', 'sunDir', 'beamLength', 'beamStreaks', 'birds', 'birdsOn'];
const BASE_UNIFORMS = ['word', 'size', 'progress', 'time', 'steps', 'viewAngle', 'transparentBackground', 'portalVariant', 'agentVariant', 'forceBurst', 'pointer', 'pointerVel', 'install', 'wind'];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${log}`);
  }
  return shader;
}

function toWebGL1(source, fragment) {
  let s = source.replace('#version 300 es\n', '');
  if (!fragment) return s.replace('in vec2 position;', 'attribute vec2 position;').replace('out vec2 uv;', 'varying vec2 uv;');
  return s.replace('in vec2 uv;', 'varying vec2 uv;').replace('out vec4 color;', '').replaceAll('texture(', 'texture2D(').replace(/\bcolor\b/g, 'gl_FragColor');
}

export async function mountCloudMorph(canvas, { vertexSource, fragmentSource, postSource = BLIT_SOURCE, svgUrl = '/wings-wide.svg', quality = 'balanced', last = 3, uniforms: initial = {}, vectors: initialVectors = {} }) {
  const options = { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, preserveDrawingBuffer: false };
  let gl = canvas.getContext('webgl2', options);
  const webgl2 = Boolean(gl);
  gl ||= canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
  if (!gl) throw new Error('WebGL is unavailable.');
  const highp = Boolean(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const custom = { ...initial };
  const vectors = { ...initialVectors }; // vec4 array uniforms, re-sent whenever the program is rebuilt
  const state = { viewAngle: [0.2, -0.16], portalVariant: 0, agentVariant: 0 };
  let program = null, locations = {};
  // Both programs read the triangle from attribute 0.
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // Cloud frame size (sw x sh, the quality profile's resolution) and the
  // canvas's device pixels per CSS pixel; set in resize().
  let sw = 1, sh = 1, pxRatio = 1;

  function link(fragSrc) {
    const vertex = webgl2 ? vertexSource : toWebGL1(vertexSource, false);
    let fragment = webgl2 ? fragSrc : toWebGL1(fragSrc, true);
    if (!highp) fragment = fragment.replace('precision highp float;', 'precision mediump float;');
    const vs = compile(gl, gl.VERTEX_SHADER, vertex);
    let fs;
    try { fs = compile(gl, gl.FRAGMENT_SHADER, fragment); } catch (error) { gl.deleteShader(vs); throw error; }
    const next = gl.createProgram();
    gl.attachShader(next, vs); gl.attachShader(next, fs);
    gl.bindAttribLocation(next, 0, 'position');
    gl.linkProgram(next);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(next);
      gl.deleteProgram(next);
      throw new Error(`link: ${log}`);
    }
    return next;
  }

  function build(fragSrc) {
    const next = link(fragSrc);
    if (program) gl.deleteProgram(program);
    program = next;
    gl.useProgram(program);
    locations = {};
    for (const key of [...BASE_UNIFORMS, ...Object.keys(custom)]) locations[key] = gl.getUniformLocation(program, key);
    gl.uniform1i(locations.word, 0);
    gl.uniform2f(locations.viewAngle, ...state.viewAngle);
    gl.uniform1f(locations.portalVariant, state.portalVariant);
    gl.uniform1f(locations.agentVariant, state.agentVariant);
    for (const [key, value] of Object.entries(custom)) gl.uniform1f(locations[key], value);
    for (const [key, values] of Object.entries(vectors)) gl.uniform4fv(gl.getUniformLocation(program, key), values);
    applySize();
  }

  const wordTexture = await makeWordTexture(gl, svgUrl, webgl2);
  let target = 0, current = 0, clock = 0, previous = performance.now();
  // Wind clock for the opening sky's drift. It runs only near the top of the
  // page and stops by a fifth of the way into the first morph, so a drifting
  // cloud never wraps around while it gathers.
  let wind = 0;
  let moving = true, disposed = false, raf = 0, dirty = true, contextLost = false, capturing = false;
  let ease = 9;
  let force = 0, forceTarget = 0;
  // Install morph: a timed tween, so the dispersal burst peaks halfway.
  const morph = { value: 0, from: 0, to: 0, start: 0, duration: 1500 };
  // Cursor disturbance: position in camera-plane units, smoothed velocity, and a
  // strength that rises while the cursor moves and heals when it stops.
  const cursor = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, strength: 0, seen: false, active: false, radius: 0.95 };
  const profiles = { low: [0.45, 48], balanced: [0.7, 80], high: [1, 120] };
  let frames = 0, fpsStart = performance.now(), fps = 0;
  // Live stats for the drawer's perf page: the time between drawn frames, a
  // GPU timer where the browser exposes one, and totals.
  const timer = webgl2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const stats = { frameMs: 0, gpuMs: null, drawn: 0, lastDraw: 0 };
  let query = null;
  function timeDraw(draw) {
    if (timer && !query) { query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); draw(); gl.endQuery(timer.TIME_ELAPSED_EXT); }
    else draw();
  }
  function readTimer() {
    if (!query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      stats.gpuMs = stats.gpuMs === null ? ms : stats.gpuMs + (ms - stats.gpuMs) * 0.2;
    }
    gl.deleteQuery(query); query = null;
  }

  // Texture pass: its program, the offscreen cloud frame it reads, and what it shows.
  let postProgram = null, postLocations = {};
  const post = { mode: 0, strength: 1, animated: false, dirty: true, last: 0, beams: 0, sunDir: [-0.96, 0.27], beamLength: 0.5, beamStreaks: 0.6 };
  const sceneTexture = gl.createTexture(), sceneFbo = gl.createFramebuffer();
  function buildPost(source) {
    const next = link(source);
    if (postProgram) gl.deleteProgram(postProgram);
    postProgram = next;
    postLocations = Object.fromEntries(POST_UNIFORMS.map(key => [key, gl.getUniformLocation(postProgram, key)]));
    gl.useProgram(program);
    post.dirty = true;
  }
  // A texture on unit 1, so unit 0 keeps the wordmark the cloud samples.
  function makeTarget(texture, width, height, filter) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }
  function attach(fbo, texture) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('framebuffer incomplete');
  }
  // Draws the cloud frame in source through the texture pass into fbo (null:
  // the canvas), width x height, ratio device pixels per CSS pixel.
  function drawPost(now, { fbo = null, source = sceneTexture, width = canvas.width, height = canvas.height, ratio = pxRatio, birdLayer = birdCount > 0 ? birdTexture : null } = {}) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(postProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(postLocations.scene, 1);
    gl.uniform2f(postLocations.size, width, height);
    gl.uniform1f(postLocations.px, ratio);
    gl.uniform1f(postLocations.time, moving ? now / 1000 % 3600 : 0);
    gl.uniform1f(postLocations.mode, post.mode);
    gl.uniform1f(postLocations.strength, post.strength);
    gl.uniform1f(postLocations.beams, post.beams);
    gl.uniform2f(postLocations.sunDir, ...post.sunDir);
    gl.uniform1f(postLocations.beamLength, post.beamLength);
    gl.uniform1f(postLocations.beamStreaks, post.beamStreaks);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, birdLayer);
    gl.uniform1i(postLocations.birds, 2);
    gl.uniform1f(postLocations.birdsOn, birdLayer ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    applySize();
    post.last = now; post.dirty = false;
  }

  // Birds: the simulation (flock, from birds.js), its program, one quad per
  // bird drawn instanced from a buffer of per-bird points, and the layer.
  const BIRD_CAPACITY = 512, BIRD_FLOATS = 20;
  let flock = null, birdProgram = null, birdLocations = {}, birdVao = null, birdBuffer = null, birdCount = 0;
  const birdTexture = gl.createTexture(), birdFbo = gl.createFramebuffer();
  function setupBirds(sim) {
    const vs = compile(gl, gl.VERTEX_SHADER, sim.vertexSource);
    let fs;
    try { fs = compile(gl, gl.FRAGMENT_SHADER, sim.fragmentSource); } catch (error) { gl.deleteShader(vs); throw error; }
    const next = gl.createProgram();
    gl.attachShader(next, vs); gl.attachShader(next, fs);
    ['corner', 'a0', 'a1', 'a2', 'a3', 'a4'].forEach((name, i) => gl.bindAttribLocation(next, i, name));
    gl.linkProgram(next);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(next, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(next); gl.deleteProgram(next); throw new Error(`birds: ${log}`); }
    birdProgram = next;
    birdLocations = { size: gl.getUniformLocation(next, 'size'), view: gl.getUniformLocation(next, 'view') };
    // A vertex array of its own, so the cloud's triangle on attribute 0 is untouched.
    birdVao = gl.createVertexArray();
    gl.bindVertexArray(birdVao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    birdBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, birdBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, BIRD_CAPACITY * BIRD_FLOATS * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 5; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, BIRD_FLOATS * 4, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    birdVao.corners = corners;
    sizeBirdLayer();
  }
  function sizeBirdLayer() {
    if (!birdProgram) return;
    makeTarget(birdTexture, canvas.width, canvas.height, gl.LINEAR);
    attach(birdFbo, birdTexture);
  }
  // The shader's view fit for a width x height target: the frame centre in
  // pixels, pixels per world unit, and the frame's half width, top and bottom
  // (the canvas bottom, under the footer) in world units.
  function viewFit(width, height) {
    const inset = custom.frameInset ?? 0;
    const aspect = width / (height * (1 - inset));
    const world = Math.max((aspect < 0.7 ? 6.8 : 8) / 1.25, 4.2 * aspect);
    const ppw = width / world;
    return { cx: width / 2, cy: height * (1 + inset) / 2, ppw, halfWidth: world / 2, top: height * (1 - inset) / 2 / ppw, bottom: -height * (1 + inset) / 2 / ppw };
  }
  function drawBirds(fbo, width, height) {
    const fit = viewFit(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (birdCount) {
      gl.useProgram(birdProgram);
      gl.uniform2f(birdLocations.size, width, height);
      gl.uniform3f(birdLocations.view, fit.cx, fit.cy, fit.ppw);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(birdVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, birdCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    applySize();
  }
  // Steps the flock and uploads it; true when the layer needs redrawing.
  function updateBirds(dt) {
    if (!flock || !birdProgram) return false;
    if (moving) flock.step(dt, viewFit(canvas.width, canvas.height));
    const { data, count } = flock.pack();
    const n = Math.min(count, BIRD_CAPACITY);
    const changed = moving ? n > 0 || birdCount > 0 : n !== birdCount;
    if (n) {
      gl.bindBuffer(gl.ARRAY_BUFFER, birdBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * BIRD_FLOATS);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    }
    birdCount = n;
    return changed;
  }

  // The cloud program draws at the cloud frame's size.
  function applySize() {
    gl.viewport(0, 0, sw, sh);
    gl.uniform2f(locations.size, sw, sh);
    gl.uniform1i(locations.steps, profiles[quality][1]);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1, scale = Math.min(dpr, profiles[quality][0]);
    sw = Math.max(1, Math.round(rect.width * scale));
    sh = Math.max(1, Math.round(rect.height * scale));
    pxRatio = Math.min(dpr, 2);
    canvas.width = Math.max(1, Math.round(rect.width * pxRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pxRatio));
    makeTarget(sceneTexture, sw, sh, gl.LINEAR);
    attach(sceneFbo, sceneTexture);
    sizeBirdLayer();
    applySize();
    dirty = true; post.dirty = true;
  }

  build(fragmentSource);
  try { buildPost(postSource); } catch (error) { console.warn('Texture pass unavailable; drawing the cloud plain.', error); buildPost(BLIT_SOURCE); }

  function tick(now) {
    if (disposed || contextLost) return;
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden && !capturing) {
      if (moving) {
        clock += dt;
        const k = Math.min(1, Math.max(0, current / 0.2));
        wind += dt * (1 - k * k * (3 - 2 * k));
      }
      const delta = target - current;
      if (moving) current += delta * (1 - Math.exp(-dt * ease));
      else current = target;
      if (moving) {
        const k = dt > 0 ? 1 / dt : 0;
        const ix = cursor.seen ? (cursor.x - cursor.px) * k : 0, iy = cursor.seen ? (cursor.y - cursor.py) * k : 0;
        cursor.px = cursor.x; cursor.py = cursor.y; cursor.seen = cursor.active;
        const blend = 1 - Math.exp(-dt * 10);
        cursor.vx += (Math.max(-6, Math.min(6, ix)) - cursor.vx) * blend;
        cursor.vy += (Math.max(-6, Math.min(6, iy)) - cursor.vy) * blend;
        const goal = cursor.active ? Math.min(1, Math.hypot(cursor.vx, cursor.vy) / 2.5) : 0;
        cursor.strength += (goal - cursor.strength) * (1 - Math.exp(-dt * (goal > cursor.strength ? 9 : 1.4)));
        if (cursor.strength < 0.002) cursor.strength = 0;
      } else cursor.strength = 0;
      gl.uniform4f(locations.pointer, cursor.x, cursor.y, cursor.strength, cursor.radius);
      gl.uniform2f(locations.pointerVel, cursor.vx, cursor.vy);
      const morphing = morph.value !== morph.to;
      if (morphing) {
        const k = Math.min(1, (now - morph.start) / morph.duration);
        morph.value = k >= 1 ? morph.to : morph.from + (morph.to - morph.from) * k;
      }
      const forceDelta = forceTarget - force;
      force = Math.abs(forceDelta) < 0.001 ? forceTarget : force + forceDelta * (1 - Math.exp(-dt * 7));
      let drew = false;
      if (moving || dirty || morphing || Math.abs(delta) > 0.0001 || forceDelta !== 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
        gl.uniform1f(locations.forceBurst, force);
        gl.uniform1f(locations.install, morph.value);
        gl.uniform1f(locations.time, clock);
        gl.uniform1f(locations.wind, wind);
        gl.uniform1f(locations.progress, current);
        timeDraw(() => gl.drawArrays(gl.TRIANGLES, 0, 3));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (stats.lastDraw) stats.frameMs += (now - stats.lastDraw - stats.frameMs) * 0.2;
        stats.lastDraw = now; stats.drawn++;
        dirty = false;
        frames++;
        drew = true;
      }
      const birdsMoved = updateBirds(dt);
      if (birdsMoved) drawBirds(birdFbo, canvas.width, canvas.height);
      if (drew || post.dirty || birdsMoved || ((post.animated || post.beams > 0) && moving && now - post.last >= 1000 / 24 - 2)) drawPost(now);
      if (now - fpsStart > 1000) { fps = frames * 1000 / (now - fpsStart); frames = 0; fpsStart = now; }
      if (timer) readTimer();
    }
    raf = requestAnimationFrame(tick);
  }

  function onLost(event) { event.preventDefault(); contextLost = true; cancelAnimationFrame(raf); }
  function onRestored() { canvas.dispatchEvent(new CustomEvent('cloud-context-restored', { bubbles: true })); }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  resize(); raf = requestAnimationFrame(tick);

  return {
    backend: webgl2 ? 'WebGL 2' : 'WebGL 1',
    // instant: jump there now instead of easing toward it.
    setProgress(value, instant = false) { target = Math.max(0, Math.min(last, Number.isFinite(value) ? value : 0)); if (instant) current = target; dirty = true; },
    getProgress() { return current; },
    getTime() { return clock; }, // the shader's time uniform, seconds
    setMotion(value) { moving = Boolean(value); dirty = true; },
    getMotion() { return moving; },
    setEase(value) { ease = value; },
    setQuality(value) { if (profiles[value]) { quality = value; resize(); } },
    getQuality() { return quality; },
    getFps() { return fps; },
    getStats() {
      return { fps, frameMs: stats.frameMs, gpuMs: stats.gpuMs, gpuTimer: Boolean(timer), drawn: stats.drawn, backend: webgl2 ? 'WebGL 2' : 'WebGL 1', gpu: gpuName,
        width: sw, height: sh, canvasWidth: canvas.width, canvasHeight: canvas.height, texture: post.mode, birds: birdCount, scale: Math.min(devicePixelRatio || 1, profiles[quality][0]), steps: profiles[quality][1], quality, moving, contextLost, install: morph.value, progress: current };
    },
    // Morph into (true) or out of (false) the current panel shape; duration is
    // the full morph in ms, and instant skips the tween.
    setInstall(open, { instant = false, duration = 1500 } = {}) {
      const to = open ? 1 : 0;
      // A reversal mid-way takes only the time for the distance left.
      Object.assign(morph, { from: morph.value, to, start: performance.now(), duration: Math.max(120, duration * Math.abs(to - morph.value)) });
      if (instant) morph.value = to;
      dirty = true;
    },
    getInstall() { return morph.value; },
    // Chat text, width x height RGBA bytes: r is the distance, 0..255 for
    // -range..+range; g is 255 where the ink is soft.
    setForceBurst(value) { forceTarget = Math.max(0, Math.min(1, value)); dirty = true; },
    setAgentVariant(value) { state.agentVariant = value; gl.uniform1f(locations.agentVariant, value); dirty = true; },
    setPortalVariant(value) { state.portalVariant = value; gl.uniform1f(locations.portalVariant, value); dirty = true; },
    // x, y in camera-plane units (see the shader's view fit); null when the
    // cursor leaves, so the disturbance heals.
    setPointer(x, y) {
      if (x === null) { cursor.active = false; cursor.seen = false; return; }
      cursor.x = x; cursor.y = y; cursor.active = true; dirty = true;
    },
    setViewAngle(yaw, pitch) { state.viewAngle = [yaw, pitch]; gl.uniform2f(locations.viewAngle, yaw, pitch); dirty = true; },
    // A vec4 array uniform: values holds four floats per element.
    setUniformVec4s(name, values) {
      vectors[name] = values;
      gl.uniform4fv(gl.getUniformLocation(program, name), values);
      dirty = true;
    },
    setUniform(name, value) {
      custom[name] = value;
      if (!(name in locations)) locations[name] = gl.getUniformLocation(program, name);
      gl.uniform1f(locations[name], value);
      dirty = true;
    },
    // Render the current frame offscreen at width x height and return a PNG blob.
    // Drawn in scissored tiles so no single GPU draw runs long enough to trip the
    // browser's watchdog; the live view pauses meanwhile.
    async capture(width, height, { steps = 160, tile = 384 } = {}) {
      const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      const fit = Math.min(1, limit / Math.max(width, height));
      width = Math.round(width * fit); height = Math.round(height * fit);
      capturing = true;
      // The cloud renders into texture in tiles, then the texture pass draws it
      // into the output texture, read back in one go. Patterns keep their size
      // relative to the page: ratio is the shot's pixels per CSS pixel.
      const texture = gl.createTexture(), fbo = gl.createFramebuffer();
      const output = gl.createTexture(), outFbo = gl.createFramebuffer();
      const birdShot = birdCount ? gl.createTexture() : null, birdShotFbo = birdCount ? gl.createFramebuffer() : null;
      const ratio = width / Math.max(1, canvas.getBoundingClientRect().width);
      const pixels = new Uint8Array(width * height * 4);
      try {
        makeTarget(texture, width, height, gl.NEAREST);
        makeTarget(output, width, height, gl.NEAREST);
        try { attach(fbo, texture); attach(outFbo, output); } catch { throw new Error('capture: framebuffer incomplete'); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, width, height);
        gl.uniform2f(locations.size, width, height);
        gl.uniform1i(locations.steps, steps);
        // The drawer's dispersal preview is left out: a shot shows the page as scrolled.
        gl.uniform1f(locations.forceBurst, 0);
        gl.uniform1f(locations.install, morph.value);
        gl.uniform1f(locations.time, clock);
        gl.uniform1f(locations.wind, wind);
        gl.uniform1f(locations.progress, current);
        gl.enable(gl.SCISSOR_TEST);
        const strip = new Uint8Array(tile * tile * 4);
        for (let y = 0; y < height; y += tile) {
          for (let x = 0; x < width; x += tile) {
            const w = Math.min(tile, width - x), h = Math.min(tile, height - y);
            gl.scissor(x, y, w, h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, strip); // waits for the tile, so no draw piles up past the watchdog
            await new Promise(requestAnimationFrame);
            if (contextLost) throw new Error('capture: WebGL context lost');
          }
        }
        gl.disable(gl.SCISSOR_TEST);
        if (birdShot) {
          makeTarget(birdShot, width, height, gl.NEAREST);
          attach(birdShotFbo, birdShot);
          drawBirds(birdShotFbo, width, height);
        }
        drawPost(performance.now(), { fbo: outFbo, source: texture, width, height, ratio, birdLayer: birdShot });
        gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      } finally {
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fbo); gl.deleteTexture(texture);
        gl.deleteFramebuffer(outFbo); gl.deleteTexture(output);
        if (birdShot) { gl.deleteFramebuffer(birdShotFbo); gl.deleteTexture(birdShot); }
        applySize();
        capturing = false; dirty = true; post.dirty = true;
      }
      // readPixels rows run bottom-up; flip into a 2D canvas for encoding.
      const out = document.createElement('canvas'); out.width = width; out.height = height;
      const image = new ImageData(width, height), rowBytes = width * 4;
      for (let row = 0; row < height; row++) image.data.set(pixels.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes), row * rowBytes);
      out.getContext('2d').putImageData(image, 0, 0);
      const blob = await new Promise(resolve => out.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('capture: PNG encoding failed');
      return { blob, width, height };
    },
    // Recompile with new source; on failure the previous program keeps rendering.
    setFragment(source) { build(source); dirty = true; },
    // The texture pass: mode indexes post.js's textures; animated textures
    // redraw at 24 fps; strength 0..2 (1 is the designed amount).
    setTexture(mode, animated = false) { post.mode = mode; post.animated = Boolean(animated); post.dirty = true; },
    setTextureStrength(value) { post.strength = Math.max(0, Math.min(2, Number(value) || 0)); post.dirty = true; },
    setPostSource(source) { buildPost(source); },
    // Bird flocks: a simulation from birds.js (createFlocks), or null for none.
    // WebGL 2 only; returns whether birds can show.
    setBirds(sim) {
      if (!webgl2) return false;
      if (sim && !birdProgram) setupBirds(sim);
      flock = sim;
      if (!sim) birdCount = 0;
      post.dirty = true;
      return true;
    },
    // Sun beams in the texture pass: amount 0..2 (0 off), length in screen
    // heights, streaks 0..1; the sun's azimuth and elevation in degrees, as
    // the cloud shader's sunlight, set the beams' direction on screen.
    setBeams({ amount = 0, length = 0.5, streaks = 0.6, azimuth = -62, elevation = 14 } = {}) {
      const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
      let x = Math.cos(el) * Math.sin(az), y = Math.sin(el);
      const n = Math.hypot(x, y);
      // A sun straight behind the camera has no direction on screen: fall back to the upper left.
      if (n < 0.05) { x = -Math.SQRT1_2; y = Math.SQRT1_2; } else { x /= n; y /= n; }
      Object.assign(post, { beams: Math.max(0, amount), sunDir: [x, y], beamLength: length, beamStreaks: streaks, dirty: true });
    },
    destroy() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteTexture(wordTexture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
      gl.deleteTexture(sceneTexture); gl.deleteFramebuffer(sceneFbo); gl.deleteProgram(postProgram);
      gl.deleteTexture(birdTexture); gl.deleteFramebuffer(birdFbo);
      if (birdProgram) { gl.deleteProgram(birdProgram); gl.deleteBuffer(birdBuffer); gl.deleteBuffer(birdVao.corners); gl.deleteVertexArray(birdVao); }
    },
  };
}

// Linear-time separable Euclidean distance transform for the SVG silhouette.
function edt(mask, width, height, target) {
  const out = new Float32Array(width * height), n = Math.max(width, height);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  function line(n) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let a = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (a <= z[k]) { k--; a = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = a; z[k + 1] = Infinity;
    }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  }
  for (let x = 0; x < width; x++) { for (let y = 0; y < height; y++) f[y] = mask[y * width + x] === target ? 0 : 1e12; line(height); for (let y = 0; y < height; y++) out[y * width + x] = d[y]; }
  for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) f[x] = out[y * width + x]; line(width); for (let x = 0; x < width; x++) out[y * width + x] = Math.sqrt(d[x]); }
  return out;
}

async function makeWordTexture(gl, url, webgl2) {
  const image = new Image(); image.src = url; await image.decode();
  const w = 1024, h = 256, canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const dw = w * 0.84, dh = dw * image.naturalHeight / image.naturalWidth;
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const pixels = ctx.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] > 127 ? 1 : 0;
  const inside = edt(mask, w, h, 0), outside = edt(mask, w, h, 1), data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.max(0, Math.min(1, ((outside[i] - inside[i]) * (6.4 / w) + 0.8) / 1.6)) * 255);
  const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, webgl2 ? gl.R8 : gl.LUMINANCE, w, h, 0, webgl2 ? gl.RED : gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
