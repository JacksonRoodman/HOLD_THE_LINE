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
const scoreText = document.createElement("div");
scoreText.style.position = "absolute";
scoreText.style.top = "20px";
scoreText.style.left = "20px";
scoreText.style.fontSize = "24px";
scoreText.style.color = "white";
scoreText.style.fontFamily = "fantasy";
scoreText.style.pointerEvents = "none";
scoreText.innerText = "Score: 0";
document.body.appendChild(scoreText);
let score = 0;

// ---------- Scene ----------
const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x87CEEB);

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
  THREE.MathUtils.degToRad(0), 
  THREE.MathUtils.degToRad(0),  
  0
);

const textureLoader = new THREE.TextureLoader();
const skyTexture = textureLoader.load(
  "/models/sky.png",
  () => {
    console.log("Sky texture loaded");
  },
  undefined,
  (err) => {
    console.error("Sky texture failed to load:", err);
  }
);
skyTexture.colorSpace = THREE.SRGBColorSpace;
skyTexture.wrapS = THREE.RepeatWrapping;
skyTexture.wrapT = THREE.ClampToEdgeWrapping;
skyTexture.repeat.set(2, 5);
const skyGeometry = new THREE.SphereGeometry(2500, 64, 64);
const skyMaterial = new THREE.MeshBasicMaterial({
  map: skyTexture,
  side: THREE.BackSide
});

const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(skyDome);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.2);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0x87aaff, 0.35);
scene.add(ambient);

// const dir = new THREE.DirectionalLight(0xffffff, 1.0);
// dir.position.set(10, 20, 10);
// dir.castShadow = true;
// dir.shadow.mapSize.set(2048, 2048);
// scene.add(dir);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(200, 500, 200); 
sun.castShadow = true;

scene.add(sun);
scene.add(sun.target);
sun.target.position.set(0, 0, 0);
sun.shadow.mapSize.width = 4096;
sun.shadow.mapSize.height = 4096;

sun.shadow.camera.left = -1000;
sun.shadow.camera.right = 1000;
sun.shadow.camera.top = 1000;
sun.shadow.camera.bottom = -1000;

sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 3000;

sun.shadow.bias = -0.0005;

// const fill = new THREE.DirectionalLight(0xffffff, 0.6);
// fill.position.set(-10, 10, -5);
// scene.add(fill);

const grid = new THREE.GridHelper(50, 50);
grid.position.y = 0;
scene.add(grid);

async function loadLevelOBJ({
  objPath,
  mtlPath = null,
  scale = 1,
  position = new THREE.Vector3(0, 0, 0),
  rotation = new THREE.Euler(0, 0, 0),
  fitCamera = false, 
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

      resolve(object);
    };

    if (mtlPath) {
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

const player = {
  position: new THREE.Vector3(496.635, 615.974, 155.027),
  velocity: new THREE.Vector3(),
};

let cannonballs = [];
const clock = new THREE.Clock();
const wallRaycaster = new THREE.Raycaster();
function checkCannonballWallCollisions(dt) {
  for (let i = cannonballs.length -1; i>= 0; i--){
    const ball = cannonballs[i];
    const start = ball.mesh.position.clone();
    const movement = ball.velocity.clone().multiplyScalar(dt);
    const distance = movement.length();
    if (distance === 0) continue;
    const direction = movement.clone().normalize();
    wallRaycaster.set(start,direction);
    wallRaycaster.far = distance + CANNONBALL_RADIUS;

    const hits = wallRaycaster.intersectObject(castle, true);
    if(hits.length >0 && hits[0].distance > 2){
      removeCannonball(i);
      continue;
    }
    ball.mesh.position.add(movement);
  }
  // console.log("wall hits:", hits.length, hits[0]?.distance);
}

function animate() {
  requestAnimationFrame(animate);
  skyTexture.offset.x += 0.00005; 
  skyDome.position.copy(camera.position);
  const dt = Math.min(clock.getDelta(), 0.33);
  updateElephants(dt);
  for (let i = cannonballs.length - 1; i >= 0; i--) {
    const ball = cannonballs[i];

    ball.elapsed += dt;
    const t = Math.min(ball.elapsed / ball.duration, 1);

    // Base position along straight line
    const pos = new THREE.Vector3().lerpVectors(ball.start, ball.end, t);

    // Add vertical arc
    pos.y += 4 * ball.arcHeight * t * (1 - t);

    ball.mesh.position.copy(pos);

    if (t >= 1) {
      scene.remove(ball.mesh);
      cannonballs.splice(i, 1);
    }
  }
  checkCannonballElephantCollisions();
  renderer.render(scene, camera);
}


window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const castle = await loadLevelOBJ({
  objPath: "/models/preview.obj",
  mtlPath: "/models/preview.mtl",
  scale: 1,
  fitCamera: true,
});

const elephantTemplate = await loadLevelOBJ({
  objPath: "/models/cent.obj",
  mtlPath: "/models/cent.mtl",
  scale: 1, 
  rotation: new THREE.Euler(0, 0, 0),
  fitCamera: false,
});

elephantTemplate.visible = false; 
const elephantSphere = new THREE.Sphere();
new THREE.Box3().setFromObject(elephantTemplate).getBoundingSphere(elephantSphere);
const ELEPHANT_RADIUS = elephantSphere.radius + 7;

const CANNONBALL_RADIUS = 2; 

function checkCannonballElephantCollisions() {
  for (let bi = cannonballs.length - 1; bi >= 0; bi--) {
    const b = cannonballs[bi];
    const bPos = b.mesh.position;

    for (let ei = elephants.length - 1; ei >= 0; ei--) {
      const e = elephants[ei];
      const ePos = e.mesh.position;

      const hitDist = CANNONBALL_RADIUS + ELEPHANT_RADIUS;
      if (bPos.distanceToSquared(ePos) <= hitDist * hitDist) {
        scene.remove(b.mesh);
        cannonballs.splice(bi, 1);

        removeElephant(e.mesh);
        score++;
        scoreText.innerText = `Score: ${score}`;

        break;
      }
    }
  }
}

function removeCannonball(index){
  scene.remove(cannonballs[index].mesh);
  cannonballs.splice(index, 1);
}

const elephantSpawnPoints = [
  new THREE.Vector3(-303.978, 1000, -317.149),
  new THREE.Vector3(-4.669, 400, 89),
  new THREE.Vector3(575, 999, -544),
  new THREE.Vector3(46, 650, -4),
  new THREE.Vector3(-41, 650, -10),
  new THREE.Vector3(-118, 650, -2.45),
  new THREE.Vector3(-455, 650, 117),
  new THREE.Vector3(267, 554, 278),
  new THREE.Vector3(197, 656, 431),
  new THREE.Vector3(669.224, 554.696, -142.085),
  new THREE.Vector3( -660.388, 1052.297, -522.717),
  new THREE.Vector3( 101.020, 663.263, 123.801),
  new THREE.Vector3( -259.169, 554.696, 115.403),
  new THREE.Vector3( -429.870, 450.085, 180.441),
  new THREE.Vector3( 226.665, 663.263, 117.342),
  new THREE.Vector3( -434.873, 1000, -205.446),
  new THREE.Vector3( -381.960, 1000, -252.747),
  new THREE.Vector3( -203.646, 1000, -419.063),
  new THREE.Vector3( -259.792, 1000, -367.821),
  new THREE.Vector3( -360.468, 680.477, 18.428),
  new THREE.Vector3( -281.417, 680.477, 18.947),
  new THREE.Vector3( -226.299, 690.783, -195.286),
  new THREE.Vector3( 558.486, 999.628, -501.870),
  new THREE.Vector3( 53.320, 705.908, -256.788),
  new THREE.Vector3( -295.128, 863.092, -516.620),
];

const elephantTargetPoints = [
  new THREE.Vector3(-303.978, 1032.740, -317.149),
  new THREE.Vector3(-4.669, 650, 89),
  new THREE.Vector3(436, 999, -434),
  new THREE.Vector3(46, 730, -4),
  new THREE.Vector3(-41, 730, -10),
  new THREE.Vector3(-118, 730, -2.45),
  new THREE.Vector3(-455, 755, 117),
  new THREE.Vector3(-148, 554, 141),
  new THREE.Vector3(204, 656, 195),
  new THREE.Vector3(650, 550, -100),
  new THREE.Vector3( -649.580, 1052.297, -285.888),
  new THREE.Vector3( 101.020, 763.263, 123.801),
  new THREE.Vector3(-376.770, 554.696, 112.117),
  new THREE.Vector3( -429.870, 588.085, 180.441),
  new THREE.Vector3( 226.665, 763.263, 117.342),
  new THREE.Vector3( -405.491, 1032.820, -183.197),
  new THREE.Vector3( -353.692, 1032.820, -239.315),
  new THREE.Vector3( -182.246, 1032.820, -400.552),
  new THREE.Vector3( -232.765, 1032.820, -347.828),
  new THREE.Vector3( -360.468, 740.477, 18.428),
  new THREE.Vector3( -281.417, 740.477, 18.947),
  new THREE.Vector3( -226.299, 751.783, -195.286),
  new THREE.Vector3( 569.990, 999.628, -411.636),
  new THREE.Vector3( 76.108, 705.908, -218.888),
  new THREE.Vector3( -183.977, 863.092, -624.446),
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

let MAX_ACTIVE_ELEPHANTS = elephantSpawnPoints.length;

function spawnElephantsBatch() {
  const freeIndices = [];

  for (let i = 0; i < elephantSpawnPoints.length; i++) {
    if (!occupiedSpawnIndices.has(i)) {
      freeIndices.push(i);
    }
  }

  for (let i = freeIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [freeIndices[i], freeIndices[j]] = [freeIndices[j], freeIndices[i]];
  }

  const numToSpawn = Math.min(
    MAX_ACTIVE_ELEPHANTS - elephants.length,
    freeIndices.length
  );

  for (let i = 0; i < numToSpawn; i++) {
    spawnElephantAtIndex(freeIndices[i]);
  }
}

spawnElephantsBatch();

function removeElephant(elephantRoot) {
  const idx = elephants.findIndex(e => e.mesh === elephantRoot);
  if (idx === -1) return;

  const spawnIndex = elephants[idx].spawnIndex;

  scene.remove(elephantRoot);
  elephants.splice(idx, 1);
  occupiedSpawnIndices.delete(spawnIndex);

  if (elephants.length === 0) {
    spawnElephantsBatch();
    return;
  }

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
  scale: 5,
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
  let hits = [];
  for (const elephant of elephants){
    hits = raycaster.intersectObject(elephant.mesh, true);
    if (hits.length > 0) {
      break;
    }
  }
  if (hits.length <= 0) {
    hits = raycaster.intersectObject(castle, true);
  }

  if (hits.length <= 0) {
    hits = raycaster.intersectObject(skyDome, true);
  }

  if (hits.length > 0) {
    const hit = hits[0];
    const p = hit.point; // <-- WORLD COORDINATES

    marker.visible = true;
    marker.position.copy(p);
    
    const cannonStart = new THREE.Vector3(-70, 740, 405);
    const cannonballMesh = ball.clone();
    cannonballMesh.position.copy(cannonStart);

    cannonballs.push({
      mesh: cannonballMesh,
      start: cannonStart.clone(),
      end: p.clone(),
      elapsed: 0,
      duration: 1.2,   // same total travel time each shot
      arcHeight: 25    // same curve height each shot
    });

    scene.add(cannonballMesh);
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