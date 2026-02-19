import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { update } from "three/examples/jsm/libs/tween.module.js";

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
scene.background = new THREE.Color(0x87CEEB);

// ---------- Camera (perspective) ----------
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

// ---------- Static camera position + static view ----------
//const playerPos = new THREE.Vector3(500, 650, 240);
const playerPos = new THREE.Vector3(-95, 760, 445);
camera.position.copy(playerPos);

camera.rotation.order = "YXZ";
camera.rotation.set(
  THREE.MathUtils.degToRad(0), // pitch (up/down)
  THREE.MathUtils.degToRad(0),  // yaw (left/right)
  0
);


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

      /*if (fitCamera) fitCameraToObject(camera, object);*/

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

/*
// Fits camera to your loaded level
function fitCameraToObject(camera, object, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
  cameraZ *= 1.2;

  camera.position.set(center.x, center.y + maxDim * 0.2, center.z + cameraZ);
  camera.near = Math.max(0.01, maxDim / 1000);
  camera.far = Math.max(1000, maxDim * 10);
  camera.updateProjectionMatrix();
}
  */

// ---------- “Player” placeholder ----------
const player = {
  position: new THREE.Vector3(496.635, 615.974, 155.027),
  velocity: new THREE.Vector3(),
};

// ---------- Animation loop ----------
let cannonballs = [];
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.33);
  updateElephants(dt);
  for (const ball of cannonballs) {
    ball.mesh.position.addScaledVector(ball.velocity, dt);
  }
  checkCannonballElephantCollisions();
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

const elephantTemplate = await loadLevelOBJ({
  objPath: "/models/elephant.obj",
  mtlPath: "/models/elephant.mtl",
  scale: .1, // you may need 0.01 or 0.1
  rotation: new THREE.Euler(3*Math.PI/2, 0, 0),
  fitCamera: false,
});

elephantTemplate.visible = false; // hide the template, we will clone it for each elephant
// ---- Collision Radii ----
const elephantSphere = new THREE.Sphere();
new THREE.Box3().setFromObject(elephantTemplate).getBoundingSphere(elephantSphere);
const ELEPHANT_RADIUS = elephantSphere.radius;

const CANNONBALL_RADIUS = 2; // matches SphereGeometry(2, ...)

function checkCannonballElephantCollisions() {
  // iterate backwards because we may splice arrays
  for (let bi = cannonballs.length - 1; bi >= 0; bi--) {
    const b = cannonballs[bi];
    const bPos = b.mesh.position;

    for (let ei = elephants.length - 1; ei >= 0; ei--) {
      const e = elephants[ei];
      const ePos = e.mesh.position;

      // distance check (sphere-sphere)
      const hitDist = CANNONBALL_RADIUS + ELEPHANT_RADIUS;
      if (bPos.distanceToSquared(ePos) <= hitDist * hitDist) {
        // ✅ remove cannonball
        scene.remove(b.mesh);
        cannonballs.splice(bi, 1);

        // ✅ remove elephant (uses your respawn rules)
        removeElephant(e.mesh);

        // stop checking this ball (it's gone)
        break;
      }
    }
  }
}


const elephantSpawnPoints = [
  new THREE.Vector3(-303.978, 1032.740, -317.149),
  new THREE.Vector3(-4.669, 400, 89),
  new THREE.Vector3(575, 999, -544),
  new THREE.Vector3(46, 650, -4),
  new THREE.Vector3(-41, 650, -10),
  new THREE.Vector3(-118, 650, -2.45),
  new THREE.Vector3(-455, 650, 117),
  new THREE.Vector3(267, 554, 278),
];

const elephantTargetPoints = [
  new THREE.Vector3(-303.978, 1032.740, -317.149),
  new THREE.Vector3(-4.669, 650, 89),
  new THREE.Vector3(436, 999, -434),
  new THREE.Vector3(46, 730, -4),
  new THREE.Vector3(-41, 730, -10),
  new THREE.Vector3(-118, 730, -2.45),
  new THREE.Vector3(-455, 755, 117),
  new THREE.Vector3(-153, 554, 254),

];
const elephants = [];
const occupiedSpawnIndices = new Set();

function pickFreeSpawnIndex() {
  const free = [];
  for (let i = 0; i < elephantSpawnPoints.length; i++) {
    if (!occupiedSpawnIndices.has(i)) free.push(i);
  }
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function spawnElephantAtIndex(i) {
  const spawn = elephantSpawnPoints[i];
  const target = elephantTargetPoints[i];

  const e = elephantTemplate.clone(true);
  e.visible = true;
  e.position.copy(spawn);
  e.rotation.copy(elephantTemplate.rotation);
  e.scale.copy(elephantTemplate.scale);

  // Mark this as the root and store which spawn index it owns (useful later)
  e.userData.isElephantRoot = true;
  e.userData.spawnIndex = i;

  scene.add(e);

  elephants.push({
    mesh: e,
    target: target.clone(),
    speed: 25,
    arrived: false,
    spawnIndex: i,
  });

  occupiedSpawnIndices.add(i);
}

function spawnElephantsBatch() {
  for (let i = 0; i < elephantSpawnPoints.length; i++) {
    if (!occupiedSpawnIndices.has(i)) {
      spawnElephantAtIndex(i);
    }
  }
}

spawnElephantsBatch();

function removeElephant(elephantRoot) {
  // Find its record
  const idx = elephants.findIndex(e => e.mesh === elephantRoot);
  if (idx === -1) return;

  const spawnIndex = elephants[idx].spawnIndex;

  // Remove from scene + arrays
  scene.remove(elephantRoot);
  elephants.splice(idx, 1);
  occupiedSpawnIndices.delete(spawnIndex);

  // Rule: if all elephants are deleted, spawn a whole new batch
  if (elephants.length === 0) {
    spawnElephantsBatch();
    return;
  }

  // Otherwise spawn ONE new elephant at a currently-free spawn point
  const freeIndex = pickFreeSpawnIndex();
  if (freeIndex !== null) {
    spawnElephantAtIndex(freeIndex);
  }
}

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

const cannon = await loadLevelOBJ({
  objPath: "/models/cannon.obj",
  scale: 5, // you may need 0.01 or 0.1
  position: new THREE.Vector3(-70, 735, 410),
  rotation: new THREE.Euler(Math.PI/16, -Math.PI * 31/32, 0),
  fitCamera: false,
});

const cannonballGeom = new THREE.SphereGeometry(2, 24, 24);
const cannonballMat = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 100 });

const ball = new THREE.Mesh(cannonballGeom, cannonballMat);
ball.position.copy(new THREE.Vector3(-70, 740, 405));



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
    cannonballs.push({
      mesh: ball.clone(),
      // velocity: new THREE.Vector3().subVectors(p, new THREE.Vector3(-70, 740, 405)).setLength(5)
      velocity: new THREE.Vector3()
        .subVectors(p, new THREE.Vector3(-70, 740, 405))
        .normalize()
        .multiplyScalar(300) // adjust speed here
    });
    scene.add(cannonballs[cannonballs.length - 1].mesh);

    console.log(
      "Castle point (world):",
      `x=${p.x.toFixed(3)} y=${p.y.toFixed(3)} z=${p.z.toFixed(3)}`
    );

    // Optional: also log which mesh you clicked
    console.log("Mesh:", hit.object.name || hit.object.uuid);
  }
});

animate();