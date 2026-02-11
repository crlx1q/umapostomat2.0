import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const hintEl = document.getElementById('hint');
const statusEl = document.getElementById('status');
const terminalEl = document.getElementById('terminal');
const phoneEl = document.getElementById('phone');
const shipmentsEl = document.getElementById('shipments');
const sessionStateEl = document.getElementById('sessionState');
const sessionTimerEl = document.getElementById('sessionTimer');
const usernameModalEl = document.getElementById('usernameModal');
const usernameInputEl = document.getElementById('usernameInput');
const startGameBtnEl = document.getElementById('startGameBtn');

let username = localStorage.getItem('username') || '';
let session = null;
let currentQr = null;
let shipments = [];
let testFlags = { rgb: false, openSeq: false };
let screenMode = { mode: 'qr', color: null };
let focusMonitorMode = false;
const remotePlayers = new Map();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#101318');
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.65, 4.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(6, 10, 4);
sun.castShadow = true;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14),
  new THREE.MeshStandardMaterial({ color: '#c6ccd6', roughness: 0.85, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: '#313842', roughness: 0.8 });
const backWall = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.2), wallMat);
backWall.position.set(0, 2, -6.5);
scene.add(backWall);
const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 14), wallMat);
leftWall.position.set(-7, 2, 0);
scene.add(leftWall);
const rightWall = leftWall.clone();
rightWall.position.x = 7;
scene.add(rightWall);

for (let i = -2; i <= 2; i += 1) {
  const deco = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.4, 0.4),
    new THREE.MeshStandardMaterial({ color: '#8ea0b8', roughness: 0.5, metalness: 0.15 })
  );
  deco.position.set(i * 2.2, 0.7, -5.8);
  deco.castShadow = true;
  scene.add(deco);
}

const postomatRoot = new THREE.Group();
postomatRoot.position.set(0, 0, -4.5);
scene.add(postomatRoot);

const lockerBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 1.85, 0.55, 4, 4, 4),
  new THREE.MeshStandardMaterial({ color: '#0f1115', roughness: 0.35, metalness: 0.82 })
);
lockerBody.castShadow = true;
lockerBody.receiveShadow = true;
lockerBody.position.y = 0.925;
postomatRoot.add(lockerBody);

// Top left logo area (fixed proportions)
const logoMap = new THREE.TextureLoader().load('https://uma.reflexai.pro/logotip.png');
logoMap.colorSpace = THREE.SRGBColorSpace;
const badge = new THREE.Mesh(
  new THREE.PlaneGeometry(0.3, 0.08),
  new THREE.MeshBasicMaterial({ map: logoMap, transparent: true })
);
badge.position.set(-0.48, 1.76, 0.279);
postomatRoot.add(badge);

const brandName = new THREE.Mesh(
  new THREE.PlaneGeometry(0.44, 0.06),
  new THREE.MeshBasicMaterial({ color: '#d7dde9', transparent: true, opacity: 0.9 })
);
brandName.position.set(0.12, 1.76, 0.279);
postomatRoot.add(brandName);

const sensor = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.08),
  new THREE.MeshStandardMaterial({ color: '#202831', emissive: '#3388ff', emissiveIntensity: 0.3 })
);
sensor.position.set(0.66, 1.84, 0.24);
postomatRoot.add(sensor);

// Dedicated monitor terminal stand near locker (like payment kiosk)
const kioskRoot = new THREE.Group();
kioskRoot.position.set(1.3, 0, -4.52);
scene.add(kioskRoot);

const kioskBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.58, 1.8, 0.62),
  new THREE.MeshStandardMaterial({ color: '#0f1115', roughness: 0.4, metalness: 0.55 })
);
kioskBody.position.y = 0.9;
kioskBody.castShadow = true;
kioskRoot.add(kioskBody);

const kioskTop = new THREE.Mesh(
  new THREE.BoxGeometry(0.56, 0.34, 0.54),
  new THREE.MeshStandardMaterial({ color: '#151a22', roughness: 0.35, metalness: 0.45 })
);
kioskTop.position.set(0, 1.57, -0.04);
kioskRoot.add(kioskTop);

const kioskScreenFrame = new THREE.Mesh(
  new THREE.BoxGeometry(0.44, 0.28, 0.05),
  new THREE.MeshStandardMaterial({ color: '#05080d', roughness: 0.3, metalness: 0.75 })
);
kioskScreenFrame.position.set(0, 1.53, 0.24);
kioskRoot.add(kioskScreenFrame);

const screenGroup = new THREE.Group();
screenGroup.position.set(0, 1.53, 0.266);
kioskRoot.add(screenGroup);

const screenCanvas = document.createElement('canvas');
screenCanvas.width = 680;
screenCanvas.height = 420;
const sctx = screenCanvas.getContext('2d');
const screenTexture = new THREE.CanvasTexture(screenCanvas);
const screenMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.4, 0.24),
  new THREE.MeshStandardMaterial({ map: screenTexture, emissive: '#6ab3ff', emissiveIntensity: 0.35 })
);
screenMesh.userData.interactive = { type: 'screen' };
screenGroup.add(screenMesh);

const paymentSlot = new THREE.Mesh(
  new THREE.BoxGeometry(0.24, 0.03, 0.03),
  new THREE.MeshStandardMaterial({ color: '#1c2430', metalness: 0.8, roughness: 0.2 })
);
paymentSlot.position.set(0, 1.23, 0.31);
kioskRoot.add(paymentSlot);

const cashSlot = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.045, 0.06),
  new THREE.MeshStandardMaterial({ color: '#222d3c', metalness: 0.7, roughness: 0.28 })
);
cashSlot.position.set(-0.14, 1.1, 0.3);
kioskRoot.add(cashSlot);

const cardReader = new THREE.Mesh(
  new THREE.BoxGeometry(0.13, 0.08, 0.11),
  new THREE.MeshStandardMaterial({ color: '#2a3648', roughness: 0.3, metalness: 0.7 })
);
cardReader.position.set(0.17, 1.08, 0.29);
kioskRoot.add(cardReader);

const camLens = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24),
  new THREE.MeshStandardMaterial({ color: '#020304', emissive: '#4aa4ff', emissiveIntensity: 0.22 })
);
camLens.rotation.x = Math.PI / 2;
camLens.position.set(0, 1.69, 0.24);
kioskRoot.add(camLens);

const lockMat = new THREE.MeshStandardMaterial({ color: '#151a20', metalness: 0.7, roughness: 0.45 });
const doorMat = new THREE.MeshStandardMaterial({ color: '#131821', metalness: 0.8, roughness: 0.35 });
const doors = new Map();
const packages = new Map();

async function fetchCells() {
  const rows = await fetch('/api/cells').then((r) => r.json());
  buildDoors(rows);
}

function buildDoors(cells) {
  const originX = -0.8;
  const originY = 1.62;
  const unitW = 1.6 / 10;
  const unitH = 1.46 / 8;

  cells.forEach((c) => {
    const pivot = new THREE.Group();
    const w = c.w * unitW - 0.004;
    const h = c.h * unitH - 0.004;
    const x = originX + c.x * unitW;
    const yTop = originY - c.y * unitH;
    pivot.position.set(x, yTop - h / 2, 0.278);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.018), doorMat.clone());
    mesh.position.x = w / 2;
    mesh.castShadow = true;
    mesh.userData.interactive = { type: 'door', cellId: c.id };
    pivot.add(mesh);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02), lockMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(w - 0.02, 0, 0.013);
    pivot.add(handle);

    const seam = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.018)),
      new THREE.LineBasicMaterial({ color: '#2b323f' })
    );
    seam.position.copy(mesh.position);
    pivot.add(seam);

    postomatRoot.add(pivot);
    doors.set(c.id, { cell: c, pivot, mesh, angle: 0, target: c.state === 'open' ? -Math.PI / 2 : 0 });

    if (c.shipmentId) spawnPackage(c.id, c.shipmentId);
  });
}

function spawnPackage(cellId, shipmentId) {
  if (packages.has(cellId)) return;
  const door = doors.get(cellId);
  if (!door) return;
  const pkg = new THREE.Group();

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.13),
    new THREE.MeshStandardMaterial({ color: '#f7f9ff', roughness: 0.75, metalness: 0.05 })
  );
  box.castShadow = true;
  box.receiveShadow = true;
  pkg.add(box);

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(0.102, 0.014, 0.132),
    new THREE.MeshStandardMaterial({ color: '#dce6ff' })
  );
  tape.position.y = 0.028;
  pkg.add(tape);

  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 0.03),
    new THREE.MeshBasicMaterial({ color: '#1f2f57' })
  );
  sticker.position.set(0, 0.005, 0.066);
  pkg.add(sticker);

  pkg.position.set(door.pivot.position.x + 0.05, door.pivot.position.y - 0.01, postomatRoot.position.z + 0.14);
  pkg.userData.interactive = { type: 'package', shipmentId, cellId };
  scene.add(pkg);
  packages.set(cellId, pkg);
}

function removePackage(cellId) {
  const box = packages.get(cellId);
  if (box) {
    scene.remove(box);
    packages.delete(cellId);
  }
}

function drawScreen() {
  sctx.clearRect(0, 0, screenCanvas.width, screenCanvas.height);
  if (screenMode.mode === 'rgb') {
    sctx.fillStyle = screenMode.color || '#000';
    sctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
  } else {
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
    sctx.fillStyle = '#111';
    sctx.font = 'bold 32px Arial';
    sctx.textAlign = 'center';
    sctx.fillText('Сканируйте QR, чтобы получить заказ', screenCanvas.width / 2, 48);
    if (currentQr?.image) {
      const img = new Image();
      img.onload = () => {
        sctx.drawImage(img, 240, 74, 200, 200);
        sctx.fillStyle = '#111';
        sctx.font = '20px Arial';
        sctx.fillText('Терминал: оплата / снятие / выдача', screenCanvas.width / 2, 320);
        sctx.fillStyle = '#f04';
        sctx.beginPath();
        sctx.arc(screenCanvas.width / 2, 174, 10, 0, Math.PI * 2);
        sctx.fill();
        screenTexture.needsUpdate = true;
      };
      img.src = currentQr.image;
    }
    sctx.fillStyle = '#444';
    sctx.font = '20px Arial';
    sctx.fillText(`Обновление: ${(currentQr?.ttlMs / 1000 || 0).toFixed(0)} c`, screenCanvas.width / 2, 382);
  }
  screenTexture.needsUpdate = true;
}

const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
ws.onmessage = (msg) => {
  const { event, payload } = JSON.parse(msg.data);
  if (event === 'bootstrap') {
    currentQr = payload.qr;
    screenMode = payload.screenMode;
    testFlags = payload.tests;
    drawScreen();
  }
  if (event === 'qrUpdated') {
    currentQr = payload.qr;
    ping(900, 0.07);
    drawScreen();
  }
  if (event === 'cellOpened') {
    const d = doors.get(payload.cellId);
    if (d) d.target = -Math.PI * 0.45;
    if (payload.shipmentId) spawnPackage(payload.cellId, payload.shipmentId);
    ping(320, 0.08);
  }
  if (event === 'cellClosed') {
    const d = doors.get(payload.cellId);
    if (d) d.target = 0;
    ping(220, 0.06);
  }
  if (event === 'shipmentUpdated') loadShipments();
  if (event === 'screenModeChanged') {
    screenMode = payload;
    drawScreen();
  }
  if (event === 'playersUpdated') updateRemotePlayers(payload.players || []);
};

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Tab' || e.code === 'KeyM') {
    e.preventDefault();
    togglePhone();
  }
  if (e.code === 'KeyE') handleInteract();
  if (e.code === 'KeyF') toggleMonitorFocus();
});
addEventListener('keyup', (e) => (keys[e.code] = false));

let yaw = 0;
let pitch = 0;
let lockEnabled = false;
renderer.domElement.addEventListener('click', () => {
  if (!hasIdentity() || !terminalEl.classList.contains('hidden') || !phoneEl.classList.contains('hidden')) return;
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  lockEnabled = document.pointerLockElement === renderer.domElement;
});

document.addEventListener('mousemove', (e) => {
  if (!lockEnabled || focusMonitorMode) return;
  yaw -= e.movementX * 0.002;
  pitch -= e.movementY * 0.002;
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
});

function openPanel(panel) {
  panel.classList.remove('hidden');
  document.exitPointerLock();
}
function closePanel(panel) {
  panel.classList.add('hidden');
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    closePanel(terminalEl);
    closePanel(phoneEl);
    if (focusMonitorMode) toggleMonitorFocus(false);
  }
});

document.getElementById('closeTerminal').onclick = () => closePanel(terminalEl);
document.getElementById('scanBtn').onclick = async () => {
  if (!currentQr || !hasIdentity()) return;
  const res = await fetch('/api/qr/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: currentQr.token, userId: username, deviceId: 'web-client' })
  });
  if (!res.ok) return;
  session = await res.json();
  ping(1300, 0.09);
  loadShipments();
  refreshPhoneHeader();
};

document.getElementById('closePhone').onclick = () => closePanel(phoneEl);

function togglePhone() {
  if (!hasIdentity()) return;
  if (phoneEl.classList.contains('hidden')) {
    openPanel(phoneEl);
    loadShipments();
  } else {
    closePanel(phoneEl);
  }
}

async function loadShipments() {
  if (!session) {
    shipmentsEl.innerHTML = '<p>Сначала отсканируйте QR на терминале.</p>';
    refreshPhoneHeader();
    return;
  }
  const res = await fetch(`/api/user/${session.userId}/shipments`, { headers: { sessionid: session.sessionId } });
  if (!res.ok) {
    shipmentsEl.innerHTML = '<p>Сессия недоступна.</p>';
    return;
  }
  shipments = await res.json();
  shipmentsEl.innerHTML = '';
  shipments.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'shipment';
    card.innerHTML = `<strong>${s.title}</strong>
      <div class="meta">${s.description || ''}</div>
      <div class="meta">Размер: ${s.size} · Ячейка: ${s.cellId} · Статус: ${s.status}</div>`;
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Открыть ячейку';
    openBtn.disabled = s.status === 'picked';
    openBtn.onclick = async () => {
      await fetch(`/api/shipment/${s.id}/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId })
      });
      loadShipments();
    };
    card.appendChild(openBtn);
    shipmentsEl.appendChild(card);
  });
  refreshPhoneHeader();
}

function refreshPhoneHeader() {
  if (!session) {
    sessionStateEl.textContent = 'Подключение к постомату: не активно';
    sessionTimerEl.textContent = '';
    return;
  }
  const left = Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000));
  sessionStateEl.textContent = 'Подключение к постомату: активно';
  sessionTimerEl.textContent = `Сессия: ${left} сек`;
}
setInterval(refreshPhoneHeader, 1000);

let currentInteractive = null;
const raycaster = new THREE.Raycaster();
function updateInteraction() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [screenMesh, ...[...doors.values()].map((d) => d.mesh), ...packages.values()];
  const hit = raycaster.intersectObjects(targets, true)[0];
  if (!hit) {
    hintEl.textContent = focusMonitorMode ? 'F — вернуть свободную камеру' : '';
    currentInteractive = null;
    return;
  }
  const dist = hit.distance;
  if (dist > 1.6) {
    hintEl.textContent = focusMonitorMode ? 'F — вернуть свободную камеру' : '';
    currentInteractive = null;
    return;
  }
  currentInteractive = hit.object.userData.interactive;
  if (currentInteractive?.type === 'screen') {
    hintEl.textContent = focusMonitorMode ? 'E — терминал · F — вернуть свободную камеру' : 'E — терминал · F — фокус на монитор';
  }
  if (currentInteractive?.type === 'door') {
    const d = doors.get(currentInteractive.cellId);
    hintEl.textContent = d && d.target < -0.1 ? 'E — закрыть дверцу' : 'E — взаимодействовать';
  }
  if (currentInteractive?.type === 'package') hintEl.textContent = 'E — забрать посылку';
}

async function handleInteract() {
  if (!currentInteractive) return;
  if (currentInteractive.type === 'screen') {
    openPanel(terminalEl);
    return;
  }
  if (currentInteractive.type === 'door') {
    const d = doors.get(currentInteractive.cellId);
    if (d && d.target < -0.1 && session) {
      await fetch(`/api/cells/${currentInteractive.cellId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId })
      });
    }
    return;
  }
  if (currentInteractive.type === 'package' && session) {
    await fetch(`/api/shipment/${currentInteractive.shipmentId}/pickup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId })
    });
    removePackage(currentInteractive.cellId);
    loadShipments();
  }
}

function toggleMonitorFocus(force) {
  const next = typeof force === 'boolean' ? force : !focusMonitorMode;
  focusMonitorMode = next;
  if (focusMonitorMode) {
    camera.position.set(1.3, 1.48, -3.42);
    yaw = Math.PI;
    pitch = -0.04;
  }
}

function ping(freq, duration) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.value = 0.03;
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + duration);
}

function updateRemotePlayers(players) {
  const known = new Set();
  players.forEach((p) => {
    if (p.userId === username) return;
    known.add(p.userId);
    let model = remotePlayers.get(p.userId);
    if (!model) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.6, 4, 8),
        new THREE.MeshStandardMaterial({ color: '#4a84ff', roughness: 0.65 })
      );
      body.position.y = 1.1;
      group.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshStandardMaterial({ color: '#f4dfc6', roughness: 0.9 })
      );
      head.position.y = 1.55;
      group.add(head);
      scene.add(group);
      model = group;
      remotePlayers.set(p.userId, model);
    }
    model.position.set(p.x, 0, p.z);
    model.rotation.y = p.yaw;
  });

  for (const [id, model] of remotePlayers.entries()) {
    if (!known.has(id)) {
      scene.remove(model);
      remotePlayers.delete(id);
    }
  }
}

let lastPresence = 0;
async function sendPresence() {
  if (!hasIdentity()) return;
  const now = performance.now();
  if (now - lastPresence < 250) return;
  lastPresence = now;
  fetch('/api/presence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: username, x: camera.position.x, z: camera.position.z, yaw, pitch })
  }).catch(() => {});
}

const colliders = [
  new THREE.Box3(new THREE.Vector3(-7, -1, -7), new THREE.Vector3(7, 3, 7)),
  new THREE.Box3(new THREE.Vector3(-0.85, 0, -4.8), new THREE.Vector3(0.85, 1.9, -4.2)),
  new THREE.Box3(new THREE.Vector3(1.01, 0, -4.84), new THREE.Vector3(1.59, 1.9, -4.18))
];

function animate() {
  requestAnimationFrame(animate);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  const speed = keys.ShiftLeft ? 0.08 : 0.045;
  const dir = new THREE.Vector3();
  if (!focusMonitorMode) {
    if (keys.KeyW) dir.z -= 1;
    if (keys.KeyS) dir.z += 1;
    if (keys.KeyA) dir.x -= 1;
    if (keys.KeyD) dir.x += 1;
  }
  dir.normalize();
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  const prev = camera.position.clone();
  camera.position.addScaledVector(dir, speed);
  const playerBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(camera.position.x, 1, camera.position.z),
    new THREE.Vector3(0.5, 2, 0.5)
  );
  const outside = !colliders[0].containsPoint(camera.position);
  const hitLocker = playerBox.intersectsBox(colliders[1]);
  const hitKiosk = playerBox.intersectsBox(colliders[2]);
  if (outside || hitLocker || hitKiosk) camera.position.copy(prev);

  doors.forEach((d) => {
    d.angle += (d.target - d.angle) * 0.12;
    d.pivot.rotation.y = d.angle;

    if (currentInteractive?.cellId === d.cell.id) {
      d.mesh.material.emissive = new THREE.Color('#2955ff');
      d.mesh.material.emissiveIntensity = 0.45;
    } else {
      d.mesh.material.emissiveIntensity = 0;
    }
  });

  sendPresence();
  updateInteraction();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function hasIdentity() {
  return Boolean(username && username.trim());
}

startGameBtnEl.onclick = async () => {
  const name = usernameInputEl.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  username = name;
  localStorage.setItem('username', username);
  usernameModalEl.classList.add('hidden');
  statusEl.textContent = `Онлайн: ${username}`;
  await fetch('/api/user/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: username, name: username })
  });
};

(async function init() {
  await fetchCells();
  const qr = await fetch('/api/qr/current').then((r) => r.json());
  currentQr = qr;
  drawScreen();

  if (hasIdentity()) {
    usernameInputEl.value = username;
    usernameModalEl.classList.add('hidden');
    statusEl.textContent = `Онлайн: ${username}`;
    await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: username, name: username })
    });
  } else {
    statusEl.textContent = 'Введите имя пользователя для старта';
    usernameModalEl.classList.remove('hidden');
  }

  animate();
})();
