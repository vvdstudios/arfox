// Copies the 8th Wall engine binary and three.js into public/ after npm install.
const fs = require('fs'), path = require('path')
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.cpSync(src, dst, { recursive: true }) }
cp('node_modules/@8thwall/engine-binary/dist', 'public/xr')
cp('node_modules/three/build/three.min.js', 'public/lib/three.min.js')
cp('node_modules/three/examples/js/loaders/GLTFLoader.js', 'public/lib/GLTFLoader.js')
fs.mkdirSync('certs', { recursive: true })
console.log('copied engine + three.js into public/')
