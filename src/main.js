import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;


renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;

document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);

// ---------- Camera (perspective) ----------
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 2, 6);

// ---------- FPS-style fixed player + mouse look ----------
const playerPos = new THREE.Vector3(567, 640, 254); // static user position
camera.position.copy(playerPos);

// yaw (left/right) and pitch (up/down), in radians
let yaw = 0;
let pitch = 0;

// clamp to ±30 degrees
const MAX_ANGLE = THREE.MathUtils.degToRad(360);

// tweak feel
const SENSITIVITY = 0.002;

// lock pointer on click so mouse controls view
renderer.domElement.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

function applyLook() {
  // yaw around world Y
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
}

// mouse move => update yaw/pitch (only when pointer is locked)
window.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;

  yaw   -= e.movementX * SENSITIVITY;
  pitch -= e.movementY * SENSITIVITY;

  // clamp BOTH yaw + pitch to ±30°
  yaw = THREE.MathUtils.clamp(yaw, -MAX_ANGLE, MAX_ANGLE);
  pitch = THREE.MathUtils.clamp(pitch, -MAX_ANGLE, MAX_ANGLE);

  applyLook();
});

// keep camera fixed (static player)
function syncCameraToPlayer() {
  camera.position.copy(playerPos);
}


// ---------- Lights ----------
// ✅ Stronger hemisphere (soft sky/ground fill)
const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.2);
scene.add(hemi);

// ✅ Ambient fill (prevents crushed shadows)
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

// ✅ Main directional (key light)
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(10, 20, 10);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
scene.add(dir);

// ✅ Extra directional (fill light from opposite side)
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-10, 10, -5);
scene.add(fill);

// Optional helper grid while you’re debugging scale/orientation
const grid = new THREE.GridHelper(50, 50);
grid.position.y = 0;
scene.add(grid);

// ---------- Load OBJ (with optional MTL) ----------
async function loadLevelOBJ({
  objPath,
  mtlPath = null,
  scale = 1,
  position = new THREE.Vector3(0, 0, 0),
  rotation = new THREE.Euler(0, 0, 0),
  fitCamera = false,   // important: don’t refit camera for elephant
} = {}) {
  return new Promise((resolve, reject) => {
    const onLoaded = (object) => {
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (!child.material) {
            child.material = new THREE.MeshStandardMaterial({ color: 0x888888 });
          }
        }
      });

      object.scale.setScalar(scale);
      object.position.copy(position);
      object.rotation.copy(rotation);

      scene.add(object);

      if (fitCamera) fitCameraToObject(camera, object);

      resolve(object);
    };

    if (mtlPath) {
      // Make textures referenced by the .mtl resolve correctly:
      const baseDir = mtlPath.substring(0, mtlPath.lastIndexOf("/") + 1);

      const mtlLoader = new MTLLoader();
      mtlLoader.setPath(baseDir);

      mtlLoader.load(
        mtlPath.split("/").pop(),
        (mtl) => {
          mtl.preload();
          const loader = new OBJLoader();
          loader.setMaterials(mtl);
          loader.load(objPath, onLoaded, undefined, reject);
        },
        undefined,
        reject
      );
    } else {
      const loader = new OBJLoader();
      loader.load(objPath, onLoaded, undefined, reject);
    }
  });
}


// Fits camera to your loaded level
function fitCameraToObject(camera, object, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) ;
  let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
  cameraZ *= 1.2;

  camera.position.set(center.x, center.y + maxDim * 0.2, center.z + cameraZ);
  camera.near = Math.max(0.01, maxDim / 1000);
  camera.far = Math.max(1000, maxDim * 10);
  camera.updateProjectionMatrix();
}

// ---------- “Player” placeholder ----------
const player = {
  position: new THREE.Vector3(0, 1.7, 0),
  velocity: new THREE.Vector3(),
};

// ---------- Animation loop ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  syncCameraToPlayer();
  updateElephants(dt);
  renderer.render(scene, camera);
}



// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Start loading ----------
const castle = await loadLevelOBJ({
  objPath: "/models/preview.obj",
  mtlPath: "/models/preview.mtl",
  scale: 1,
  fitCamera: true,
});

const elephantSpawnPoints = [
  new THREE.Vector3(-303.978, 1032.740, -317.149),
];

const elephantTargetPoints = [
  new THREE.Vector3(567, 640, 254),
];
const elephants = [];

const elephantTemplate = await loadLevelOBJ({
  objPath: "/models/elephant.obj",
  mtlPath: "/models/elephant.mtl",
  scale: .1, // you may need 0.01 or 0.1
  rotation: new THREE.Euler(3*Math.PI/2, 0, 0),
  fitCamera: false,
});

elephantTemplate.visible = false; 

function spawnElephants() {
  for (let i = 0; i < elephantSpawnPoints.length; i++) {
    const spawn = elephantSpawnPoints[i];
    const target = elephantTargetPoints[i];
    const e = elephantTemplate.clone(true);
    e.visible = true;
    e.position.copy(spawn);
    e.rotation.copy(elephantTemplate.rotation);
    e.scale.copy(elephantTemplate.scale);
    scene.add(e);
    elephants.push({
      mesh: e,
      target: target.clone(),
      speed: 25,
      arrived: false,
    });
  }
}

spawnElephants(2);

function updateElephants(dt){
  for (const e of elephants) {
    if(e.arrived) continue;
    const pos = e.mesh.position;
    const toTarget = new THREE.Vector3().subVectors(e.target, pos);
    const dist = toTarget.length();
    const stopRadius = 1.0;
    if(dist <= stopRadius){
      e.mesh.position.copy(e.target);
      e.arrived = true;
      continue;
    } 
    toTarget.normalize();
    const step = e.speed * dt;
    if(step >= dist){
      pos.copy(e.target);
      e.arrived = true;
    } else {
      pos.addScaledVector(toTarget, step);
    }
  }
}
// const elephant = await loadLevelOBJ({
  //   objPath: "/models/elephant.obj",
  //   mtlPath: "/models/elephant.mtl",
  //   scale: .1, // you may need 0.01 or 0.1
//   position: new THREE.Vector3(-56.453, 616.633, 175.618),
//   rotation: new THREE.Euler(3*Math.PI/2, 0, 0),
//   fitCamera: false,
// });

// const elephant_2 = await loadLevelOBJ({
  //   objPath: "/models/elephant.obj",
  //   mtlPath: "/models/elephant.mtl",
  //   scale: .1, // you may need 0.01 or 0.1
  //   position: new THREE.Vector3(-303.978, 1032.740, -317.149),
  //   rotation: new THREE.Euler(3*Math.PI/2, 0, 0),
  //   fitCamera: false,
  // });
  
  
  
  
  
  
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  
  // a visible marker to show where you clicked
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff3333 })
  );
  marker.visible = false;
  scene.add(marker);
  
  window.addEventListener("pointerdown", (e) => {
    if (!castle) return;
    
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
  // hit test against the castle mesh
  const hits = raycaster.intersectObject(castle, true);

  if (hits.length > 0) {
    const hit = hits[0];
    const p = hit.point; // <-- WORLD COORDINATES
    
    marker.visible = true;
    marker.position.copy(p);
    
    console.log(
      "Castle point (world):",
      `x=${p.x.toFixed(3)} y=${p.y.toFixed(3)} z=${p.z.toFixed(3)}`
    );
    
    // Optional: also log which mesh you clicked
    console.log("Mesh:", hit.object.name || hit.object.uuid);
  }
});




animate();