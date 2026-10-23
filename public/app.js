/* Fox GO — Pokémon GO style catch loop on 8th Wall world tracking + three.js */
(() => {
  const $ = (id) => document.getElementById(id)
  const ui = { count: $('count'), status: $('status'), hint: $('hint'), ball: $('ballBtn'), banner: $('banner'),
    bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'), loader: $('loader'), loadMsg: $('loadMsg'), ring: $('ring') }
  const setHint = (t) => { ui.hint.textContent = t; ui.hint.classList.toggle('hide', !t) }
  const setStatus = (t) => { ui.status.textContent = t }

  const CAMERA_HEIGHT = 1.4
  const FOX_SCALE = 1.5
  let groundY = 0
  const CATCH_RADIUS = 0.55

  let scene, camera, renderer, clock
  let fox = null, mixer = null, actions = {}, current = null, foxTemplate = null
  let shadow, ring3d
  let state = 'scan'            // scan | wild | thrown | caught
  let caught = 0
  const balls = []
  const particles = []
  let wander = { target: null, t: 0 }
  let lastTouch = null

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const raycaster = new THREE.Raycaster()
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3()

  // ---------- assets ----------
  const loadFox = () => new Promise((resolve, reject) => {
    new THREE.GLTFLoader().load('assets/fox.glb', (gltf) => {
      foxTemplate = gltf
      resolve()
    }, undefined, reject)
  })

  let appleTemplate = null, blackTex = null, foxMapOrig = null
  const loadApple = () => new Promise((resolve, reject) => {
    new THREE.GLTFLoader().load('assets/apple.glb', (gltf) => {
      const g = gltf.scene
      g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material.map) o.material.map.anisotropy = 4 } })
      // normalise: apple body ~9cm wide, centred on origin
      const box = new THREE.Box3().setFromObject(g)
      const size = box.getSize(new THREE.Vector3())
      const s = 0.09 / Math.max(size.x, size.z)
      g.scale.setScalar(s)
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s)
      const wrap = new THREE.Group(); g.position.sub(c); wrap.add(g)
      appleTemplate = wrap
      resolve()
    }, undefined, reject)
  })
  const loadBlackTex = () => new Promise((resolve) => {
    new THREE.TextureLoader().load('assets/fox_black.jpg', (t) => { t.flipY = false; t.encoding = THREE.sRGBEncoding; blackTex = t; resolve() }, undefined, () => resolve())
  })
  const makeApple = () => appleTemplate.clone()

  const makeBallMesh = () => {
    const g = new THREE.Group()
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe8313a, roughness: .35 }))
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: .35 }))
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x1b1f3a, roughness: .6 }))
    band.rotation.x = Math.PI / 2
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 }))
    btn.rotation.x = Math.PI / 2; btn.position.z = 0.058
    g.add(top, bot, band, btn)
    return g
  }

  // ---------- fox ----------
  const spawnFox = (pos) => {
    if (fox) { scene.remove(fox); fox = null }
    fox = foxTemplate.scene
    fox.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false } })
    fox.scale.setScalar(FOX_SCALE)
    fox.position.copy(pos)
    fox.visible = true
    scene.add(fox)

    mixer = new THREE.AnimationMixer(fox)
    actions = {}
    foxTemplate.animations.forEach((clip) => {
      const key = clip.name.replace(/_root$/, '')
      actions[key] = mixer.clipAction(clip)
    })
    current = null
    play('IdleLookAround')
    faceCamera()

    shadow.visible = true
    const black = !!blackTex
    fox.traverse((o) => { if (o.isMesh && o.material) { if (!foxMapOrig) foxMapOrig = o.material.map; o.material.map = black ? blackTex : foxMapOrig; o.material.needsUpdate = true } })
    fox.userData.black = black
    fox.userData.pop = 0 // pop-in scale animation
    fox.scale.setScalar(0.001)
    wander = { target: null, t: 2 + Math.random() * 3 }
    state = 'wild'
    setStatus('Wild Fox!')
    setHint('Swipe up to throw an apple')
    ui.ball.classList.remove('hide')
    ui.ring.classList.remove('show')
    burst(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xffffff, 24)
  }

  const play = (name, { loop = true, fade = 0.25, speed = 1 } = {}) => {
    const next = actions[name]
    if (!next || next === current) return next
    next.reset()
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    next.clampWhenFinished = !loop
    next.timeScale = speed
    next.enabled = true
    if (current) { current.crossFadeTo(next, fade, false) } else { next.fadeIn(fade) }
    next.play()
    current = next
    return next
  }

  const faceCamera = () => {
    if (!fox) return
    tmp.copy(camera.position); tmp.y = fox.position.y
    fox.lookAt(tmp)
  }

  const updateFox = (dt) => {
    if (!fox) return
    if (fox.userData.pop < 1) {
      fox.userData.pop = Math.min(1, fox.userData.pop + dt * 2.5)
      const p = fox.userData.pop
      const s = FOX_SCALE * (1 + Math.sin(p * Math.PI) * 0.25) * p
      fox.scale.setScalar(Math.max(0.001, s))
    }
    shadow.position.set(fox.position.x, groundY, fox.position.z)

    if (state === 'fleeing') {
      fox.position.addScaledVector(fox.userData.fleeDir, dt * 1.6)
      return
    }
    if (state !== 'wild') return
    // simple wander: idle a while, then walk to a nearby point, keep roughly facing the player
    wander.t -= dt
    if (wander.target) {
      tmp.subVectors(wander.target, fox.position); tmp.y = 0
      const d = tmp.length()
      if (d < 0.08) {
        wander.target = null; wander.t = 2 + Math.random() * 4
        play(Math.random() < 0.5 ? 'IdleBreathe' : 'IdleLookAround')
        faceCamera()
      } else {
        tmp.normalize()
        fox.position.addScaledVector(tmp, dt * 0.45)
        tmp2.copy(fox.position).add(tmp)
        fox.lookAt(tmp2)
        play('Walk')
      }
    } else if (wander.t <= 0) {
      // pick a spot 0.6-1.4m away but staying 1-3m from the player
      const ang = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.8
      const cand = new THREE.Vector3(fox.position.x + Math.cos(ang) * r, groundY, fox.position.z + Math.sin(ang) * r)
      const dp = Math.hypot(cand.x - camera.position.x, cand.z - camera.position.z)
      if (dp > 1.0 && dp < 2.6) wander.target = cand
      else wander.t = 0.5
    }
  }

  // ---------- balls ----------
  const throwBall = (power, sideways) => {
    const ball = makeApple()
    ball.position.copy(camera.position)
    ball.position.y -= 0.25
    // forward direction flattened a bit, aimed toward the fox if it exists
    const dir = new THREE.Vector3()
    if (fox) dir.subVectors(fox.position, ball.position).normalize()
    else camera.getWorldDirection(dir)
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    dir.addScaledVector(right, sideways * 0.6)
    const dist = fox ? ball.position.distanceTo(fox.position) : 2
    const speed = THREE.MathUtils.clamp(2.2 + dist * 1.1 * power, 2, 7)
    const vel = dir.clone().multiplyScalar(speed)
    vel.y = 1.6 + dist * 0.9 * power
    ball.userData = { vel, t: 0, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), bounces: 0 }
    scene.add(ball); balls.push(ball)
    state = 'thrown'
    ui.ball.classList.add('hide')
    setHint('')
  }

  const updateBalls = (dt) => {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], u = b.userData
      u.t += dt
      u.vel.y -= 9.8 * dt
      b.position.addScaledVector(u.vel, dt)
      b.rotateOnAxis(u.spin, u.vel.length() * dt * 6)
      if (b.position.y < groundY + 0.045) { b.position.y = groundY + 0.045; u.vel.y *= -0.45; u.vel.x *= 0.7; u.vel.z *= 0.7; u.bounces++ }
      // hit?
      if (state === 'thrown' && fox) {
        tmp.copy(fox.position); tmp.y += 0.28 * FOX_SCALE
        if (b.position.distanceTo(tmp) < CATCH_RADIUS) { onHit(b); continue }
      }
      if (u.t > 3.5 || (u.bounces > 2 && u.vel.length() < 0.3)) {
        scene.remove(b); balls.splice(i, 1)
        if (state === 'thrown' && balls.length === 0) onMiss()
      }
    }
  }

  const onMiss = () => {
    state = 'wild'
    setHint('Missed! Swipe up to throw another apple')
    ui.ball.classList.remove('hide')
    play('IdleLookAround')
    faceCamera()
    wander.target = null; wander.t = 1
  }

  const onHit = (ball) => {
    state = 'caught'
    balls.length = 0
    faceCamera()
    const foxPos = fox.position.clone()
    // apple drops to the fox's mouth
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fox.quaternion)
    const mouth = foxPos.clone().addScaledVector(fwd, 0.5 * FOX_SCALE).setY(groundY + 0.1 * FOX_SCALE)
    const from = ball.position.clone()
    play('Bite', { loop: false, fade: 0.15 })
    const start = clock.elapsedTime
    let bites = 0
    const seq = () => {
      if (!fox) return
      const t = clock.elapsedTime - start
      if (t < 0.35) { ball.position.lerpVectors(from, mouth, t / 0.35); ball.position.y += Math.sin(t / 0.35 * Math.PI) * 0.15; requestAnimationFrame(seq); return }
      ball.position.copy(mouth)
      if (t < 2.0) { // chomp chomp
        const phase = Math.floor((t - 0.35) / 0.55)
        if (phase > bites) { bites = phase; actions.Bite.reset().play(); burst(mouth.clone().add(new THREE.Vector3(0, 0.05, 0)), 0xffe08a, 10) }
        ball.scale.setScalar(Math.max(0.05, 1 - (t - 0.35) / 1.65))
        ball.rotation.y += 0.1
        requestAnimationFrame(seq); return
      }
      if (ball.parent) {
        scene.remove(ball); burst(mouth.clone().add(new THREE.Vector3(0, 0.1, 0)), 0xff5c7a, 30)
        caught++
        ui.count.textContent = caught
        ui.bannerTitle.textContent = 'Yum!'
        ui.bannerSub.textContent = 'Fox #' + caught + ' is your friend now'
        ui.banner.classList.add('show')
        setStatus(caught + ' fed')
        play('JumpBite', { loop: false, fade: 0.2 })
      }
      if (t < 3.2) { requestAnimationFrame(seq); return }
      if (state === 'caught') { // run off away from the player
        state = 'fleeing'
        const dir = foxPos.clone().sub(camera.position).setY(0).normalize()
        fox.userData.fleeDir = dir
        fox.lookAt(fox.position.clone().add(dir))
        play('Run', { fade: 0.15 })
        ui.banner.classList.remove('show')
      }
      if (t < 5.2) { requestAnimationFrame(seq); return }
      scene.remove(fox); fox = null; shadow.visible = false
      state = 'scan'
      setHint('Tap the floor to find another Fox')
      ui.ring.classList.add('show')
      setStatus('Searching…')
    }
    seq()
  }

  // ---------- particles ----------
  const pGeo = new THREE.SphereGeometry(0.012, 6, 6)
  const burst = (pos, color, n) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true })
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(pGeo, mat.clone())
      m.position.copy(pos)
      m.userData = { vel: new THREE.Vector3(Math.random() - .5, Math.random() * .8, Math.random() - .5).normalize().multiplyScalar(0.8 + Math.random() * 1.6), life: 0.8 + Math.random() * 0.5 }
      scene.add(m); particles.push(m)
    }
  }
  const updateParticles = (dt) => {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i], u = p.userData
      u.life -= dt
      if (u.life <= 0) { scene.remove(p); particles.splice(i, 1); continue }
      u.vel.y -= 3 * dt
      p.position.addScaledVector(u.vel, dt)
      p.material.opacity = Math.min(1, u.life * 2)
    }
  }

  // ---------- input ----------
  const screenToGround = (x, y) => {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null
  }

  const onDown = (e) => {
    const t = e.touches ? e.touches[0] : e
    lastTouch = { x: t.clientX, y: t.clientY, t: performance.now() }
    if (state === 'wild') ui.ball.classList.add('armed')
  }
  const onUp = (e) => {
    if (!lastTouch) return
    const t = e.changedTouches ? e.changedTouches[0] : e
    const dx = t.clientX - lastTouch.x, dy = t.clientY - lastTouch.y, dtms = performance.now() - lastTouch.t
    ui.ball.classList.remove('armed')
    const isTap = Math.hypot(dx, dy) < 18
    if (state === 'scan' && isTap) {
      let g = null
      try {
        const hits = XR8.XrController.hitTest(t.clientX / innerWidth, t.clientY / innerHeight, ['DETECTED_SURFACE', 'ESTIMATED_SURFACE', 'FEATURE_POINT'])
        const h = hits && hits.find((x) => x.type !== 'FEATURE_POINT') || (hits && hits[0])
        if (h && Math.abs(h.position.y - camera.position.y) > 0.3 && h.position.y < camera.position.y) {
          groundY = h.position.y
          groundPlane.constant = -groundY
          g = new THREE.Vector3(h.position.x, groundY, h.position.z)
        }
      } catch (e) { console.warn('hitTest failed', e) }
      if (!g) g = screenToGround(t.clientX, t.clientY)
      if (!g) { setHint('Aim lower — at the floor'); return }
      const d = Math.hypot(g.x - camera.position.x, g.z - camera.position.z)
      const clampTo = (r) => g.sub(camera.position).setY(0).normalize().multiplyScalar(r).add(new THREE.Vector3(camera.position.x, 0, camera.position.z))
      if (d > 2.4) clampTo(2.2)
      if (d < 1.0) clampTo(1.1)
      g.y = groundY
      spawnFox(g)
    } else if (state === 'wild' && dy < -40 && dtms < 900) {
      const power = THREE.MathUtils.clamp((-dy / innerHeight) * 2.2 + (-dy / dtms) * 0.6, 0.6, 1.6)
      const side = THREE.MathUtils.clamp(dx / innerWidth * 2, -1, 1)
      throwBall(power, side)
    } else if (state === 'wild' && isTap) {
      setHint('Swipe up to throw an apple')
    }
    lastTouch = null
  }
  const canvas = $('xr')
  const fitCanvas = () => {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:' + w + 'px;height:' + h + 'px;'
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph }
    if (renderer) renderer.setSize(pw, ph, false)
  }
  window.addEventListener('resize', () => { fitCanvas(); setTimeout(fitCanvas, 300) })
  window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 300))
  fitCanvas()
  canvas.addEventListener('touchstart', onDown, { passive: true })
  canvas.addEventListener('touchend', onUp, { passive: true })
  canvas.addEventListener('mousedown', onDown)
  canvas.addEventListener('mouseup', onUp)

  // ---------- 8th Wall pipeline ----------
  const foxGoPipelineModule = () => ({
    name: 'foxgo',
    onStart: ({ canvasWidth, canvasHeight }) => {
      ({ scene, camera, renderer } = XR8.Threejs.xrScene())
      clock = new THREE.Clock()
      renderer.outputEncoding = THREE.sRGBEncoding
      renderer.physicallyCorrectLights = true

      scene.add(new THREE.HemisphereLight(0xffffff, 0x886644, 2.2))
      const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(1, 4, 2); scene.add(sun)

      shadow = new THREE.Object3D() // no ground marker

      camera.position.set(0, CAMERA_HEIGHT, 0)
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion })
      renderer.setSize(canvasWidth, canvasHeight, false)

      ui.loader.classList.add('hide')
      ui.ring.classList.add('show')
      ui.ball.classList.add('hide')
      setHint('Point at the floor and tap to find a Fox')
    },
    onCanvasSizeChange: ({ canvasWidth, canvasHeight }) => {
      if (renderer) renderer.setSize(canvasWidth, canvasHeight, false)
    },
    onUpdate: () => {
      if (!clock) return
      const dt = Math.min(clock.getDelta(), 0.05)
      if (mixer) mixer.update(dt)
      updateFox(dt)
      updateBalls(dt)
      updateParticles(dt)
    },
  })

  const boot = async () => {
    ui.loadMsg.textContent = 'Loading Fox…'
    await Promise.all([loadFox(), loadApple(), loadBlackTex()])
    // iOS 13+ needs motion permission from a user gesture, and camera prompts are more reliable after a tap
    await new Promise((resolve) => {
      ui.loadMsg.textContent = 'Ready'
      const btn = document.getElementById('startBtn')
      btn.classList.add('show')
      btn.addEventListener('click', async () => {
        btn.classList.remove('show')
        try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission() } catch (e) { console.warn('motion permission', e) }
        resolve()
      }, { once: true })
    })
    ui.loadMsg.textContent = 'Starting camera…'
    XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' })
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      foxGoPipelineModule(),
    ])
    XR8.addCameraPipelineModule({
      name: 'errors',
      onCameraStatusChange: ({ status }) => {
        if (status === 'requesting') ui.loadMsg.textContent = 'Allow camera access…'
        if (status === 'failed') { ui.loadMsg.textContent = 'Camera blocked — allow camera in browser settings and reload'; ui.loader.classList.remove('hide') }
      },
      onException: (e) => { ui.loadMsg.textContent = 'Error: ' + (e && e.message || e); ui.loader.classList.remove('hide'); console.error(e) },
    })
    XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY })
  }

  const whenXR8 = () => (window.XR8 ? boot() : window.addEventListener('xrloaded', boot, { once: true }))
  whenXR8()
})()
