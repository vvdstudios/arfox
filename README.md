# Fox GO

Pokémon GO-style web AR demo: a black fox appears on your floor, you swipe up to throw apples, it eats them and runs off.
Built on the 8th Wall engine binary (world tracking, no app key needed) and three.js r147.

## Run

```
npm install          # also copies engine + three.js into public/
npm run cert         # self-signed HTTPS cert (camera needs HTTPS)
npm start            # https://<your-lan-ip>:8443
```

Open the URL on your phone (same Wi-Fi), accept the certificate warning, allow the camera.
Edit `server.js` if you want a different port or host.

## Assets

- `public/assets/fox.glb` — converted from the Unreal FBX pack with `tools/fbx2glb.py` (Blender 4.2 headless).
- `public/assets/fox_black.jpg` — black fur variant, applied at runtime.
- `public/assets/apple.glb` — the thrown apple.

## Controls

- Tap the floor: spawn a fox on the detected surface.
- Swipe up: throw an apple (swipe speed and sideways drift affect the throw).
