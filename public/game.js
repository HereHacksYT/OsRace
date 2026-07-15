import * as THREE from 'three';

// ========== Ses Yöneticisi ==========
class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.engineOsc = null;
        this.engineGain = null;
    }

    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }

    startEngine() {
        if (!this.ctx || this.engineOsc) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 60;
        this.engineGain.gain.value = 0.04;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
    }

    updateEngine(speed, maxSpeed) {
        if (!this.engineOsc) return;
        const freq = 50 + (Math.abs(speed) / maxSpeed) * 180;
        this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        const gain = 0.02 + (Math.abs(speed) / maxSpeed) * 0.06;
        this.engineGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1);
    }

    stopEngine() {
        if (this.engineOsc) {
            this.engineOsc.stop();
            this.engineOsc.disconnect();
            this.engineOsc = null;
            this.engineGain = null;
        }
    }

    playBeep(freq = 440, duration = 0.15) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCrash() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.25;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.15;
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start();
    }

    playFinish() {
        this.playBeep(660, 0.1);
        setTimeout(() => this.playBeep(880, 0.15), 100);
        setTimeout(() => this.playBeep(1100, 0.2), 200);
    }
}

const sound = new SoundManager();

// ========== Pist Noktaları ==========
const WAYPOINTS = [
    { x: 0, z: 15 }, { x: 25, z: 12 }, { x: 45, z: 5 },
    { x: 55, z: -15 }, { x: 45, z: -35 }, { x: 25, z: -45 },
    { x: -5, z: -40 }, { x: -30, z: -25 }, { x: -45, z: -5 },
    { x: -40, z: 20 }, { x: -20, z: 35 }, { x: 0, z: 15 }
];

const TRACK_WIDTH = 12;
const TRACK_HALF = TRACK_WIDTH / 2;

// ========== Three.js Sahnesi ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 80, 200);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 200);
camera.position.set(0, 12, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('gameUI').appendChild(renderer.domElement);

// Işıklandırma
const ambientLight = new THREE.AmbientLight(0x404066);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(30, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 150;
dirLight.shadow.camera.left = -60;
dirLight.shadow.camera.right = 60;
dirLight.shadow.camera.top = 60;
dirLight.shadow.camera.bottom = -60;
scene.add(dirLight);

// Beton zemin
const groundGeom = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Pist oluştur - TÜNEL YOK, SADECE YAN DUVARLAR
function createTrack() {
    const trackGroup = new THREE.Group();
    const points = WAYPOINTS.map(wp => new THREE.Vector3(wp.x, 0.02, wp.z));
    const curve = new THREE.CatmullRomCurve3(points, true);

    // Asfalt yol
    const tubeGeom = new THREE.TubeGeometry(curve, 200, TRACK_HALF, 8, true);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
    const trackMesh = new THREE.Mesh(tubeGeom, tubeMat);
    trackMesh.receiveShadow = true;
    trackGroup.add(trackMesh);

    // Kenar çizgileri
    const edgePoints = curve.getPoints(400);
    for (let i = 0; i < edgePoints.length - 1; i++) {
        if (i % 6 !== 0) continue;
        const p1 = edgePoints[i];
        const p2 = edgePoints[i + 1];
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const lineGeom = new THREE.BoxGeometry(0.4, 0.05, 2.5);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333 });
        const leftLine = new THREE.Mesh(lineGeom, lineMat);
        leftLine.position.copy(mid.clone().addScaledVector(perp, TRACK_HALF));
        leftLine.position.y = 0.04;
        trackGroup.add(leftLine);
        const rightLine = new THREE.Mesh(lineGeom, lineMat);
        rightLine.position.copy(mid.clone().addScaledVector(perp, -TRACK_HALF));
        rightLine.position.y = 0.04;
        trackGroup.add(rightLine);
    }

    // DUVARLAR: SADECE YANLARDA, ÜST AÇIK (alçak bariyer)
    const wallHeight = 0.8;
    const wallThickness = 0.3;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.5, emissive: 0x330000 });
    const wallEdgePoints = curve.getPoints(500);
    for (let i = 0; i < wallEdgePoints.length - 1; i++) {
        const p1 = wallEdgePoints[i];
        const p2 = wallEdgePoints[i + 1];
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const length = dir.length();
        dir.normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        const leftWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, length);
        const leftWall = new THREE.Mesh(leftWallGeom, wallMat);
        leftWall.position.copy(mid.clone().addScaledVector(perp, TRACK_HALF));
        leftWall.position.y = wallHeight / 2;
        leftWall.rotation.y = Math.atan2(dir.x, dir.z);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        trackGroup.add(leftWall);

        const rightWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, length);
        const rightWall = new THREE.Mesh(rightWallGeom, wallMat);
        rightWall.position.copy(mid.clone().addScaledVector(perp, -TRACK_HALF));
        rightWall.position.y = wallHeight / 2;
        rightWall.rotation.y = Math.atan2(dir.x, dir.z);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        trackGroup.add(rightWall);
    }

    // Bitiş çizgisi
    const finishGeom = new THREE.BoxGeometry(0.6, 0.1, 4);
    const finishMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x553300 });
    const finishLine = new THREE.Mesh(finishGeom, finishMat);
    finishLine.position.set(0, 0.04, 15);
    trackGroup.add(finishLine);

    scene.add(trackGroup);
}
createTrack();

// Ağaçlar
for (let i = 0; i < 40; i++) {
    const treeGroup = new THREE.Group();
    const trunkGeom = new THREE.CylinderGeometry(0.4, 0.5, 2.5);
    const trunk = new THREE.Mesh(trunkGeom, new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
    trunk.position.y = 1.25; trunk.castShadow = true; trunk.receiveShadow = true;
    treeGroup.add(trunk);
    const foliageGeom = new THREE.ConeGeometry(1, 2.5, 8);
    const foliage = new THREE.Mesh(foliageGeom, new THREE.MeshStandardMaterial({ color: 0x228B22 }));
    foliage.position.y = 3; foliage.castShadow = true; foliage.receiveShadow = true;
    treeGroup.add(foliage);
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 40;
    treeGroup.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    scene.add(treeGroup);
}

// Araba modeli
function createCarModel(color = 0xff4500) {
    const car = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(1.8, 0.7, 3.6);
    const body = new THREE.Mesh(bodyGeom, new THREE.MeshStandardMaterial({ color }));
    body.position.y = 0.5; body.castShadow = true; body.receiveShadow = true;
    car.add(body);
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.5, 1.8);
    const cabin = new THREE.Mesh(cabinGeom, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    cabin.position.set(0, 1.05, -0.3); cabin.castShadow = true;
    car.add(cabin);
    const wheelGeom = new THREE.CylinderGeometry(0.45, 0.45, 0.5, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const positions = [[-1, 0.4, 1.4], [1, 0.4, 1.4], [-1, 0.4, -1.4], [1, 0.4, -1.4]];
    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true; wheel.receiveShadow = true;
        car.add(wheel);
    });
    return car;
}

const carMeshes = new Map();
const playerCar = createCarModel(0xff4500);
scene.add(playerCar);

// ========== Kontroller ==========
const keys = { up: false, down: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': keys.up = true; e.preventDefault(); break;
        case 'ArrowDown': case 's': case 'S': keys.down = true; e.preventDefault(); break;
        case 'ArrowLeft': case 'a': case 'A': keys.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'd': case 'D': keys.right = true; e.preventDefault(); break;
    }
    if (networkGame) networkGame.sendInput();
});

window.addEventListener('keyup', (e) => {
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': keys.up = false; e.preventDefault(); break;
        case 'ArrowDown': case 's': case 'S': keys.down = false; e.preventDefault(); break;
        case 'ArrowLeft': case 'a': case 'A': keys.left = false; e.preventDefault(); break;
        case 'ArrowRight': case 'd': case 'D': keys.right = false; e.preventDefault(); break;
    }
    if (networkGame) networkGame.sendInput();
});

// Mobil dokunmatik
function setupTouchControls() {
    const btns = {
        steerLeft: 'left', steerRight: 'right',
        gasBtn: 'up', brakeBtn: 'down'
    };
    for (const [id, key] of Object.entries(btns)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[key] = true;
            if (networkGame) networkGame.sendInput();
        });
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[key] = false;
            if (networkGame) networkGame.sendInput();
        });
        el.addEventListener('touchcancel', (e) => {
            keys[key] = false;
            if (networkGame) networkGame.sendInput();
        });
    }
}
setupTouchControls();

// Kamera takip
function updateCamera(targetPos, targetAngle) {
    const dist = 10, height = 5;
    const backX = targetPos.x - Math.sin(targetAngle) * dist;
    const backZ = targetPos.z - Math.cos(targetAngle) * dist;
    camera.position.lerp(new THREE.Vector3(backX, targetPos.y + height, backZ), 0.08);
    camera.lookAt(targetPos.x, targetPos.y + 0.8, targetPos.z);
}

// ========== Çok Oyunculu ==========
let gameMode = null;
let networkGame = null;
let socket = null;

class NetworkGame {
    constructor(socket) {
        this.socket = socket;
        this.state = 'waiting';
        this.serverState = null;
        this.myId = socket.id;
        this.entities = new Map();
        this.predictedPos = { x: 0, z: 0, angle: 0, speed: 0 };
        this.serverPos = { x: 0, z: 0, angle: 0, speed: 0 };

        this.socket.on('room-created', (data) => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        this.socket.on('joined-room', (data) => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        this.socket.on('player-joined', (data) => {
            document.getElementById('playerCount').textContent = 'Oyuncu: 2/2';
        });
        this.socket.on('player-left', (id) => {
            if (this.entities.has(id)) {
                scene.remove(this.entities.get(id).mesh);
                this.entities.delete(id);
            }
            document.getElementById('playerCount').textContent = 'Oyuncu: 1/2';
        });
        this.socket.on('countdown', (seconds) => {
            this.state = 'countdown';
            const disp = document.getElementById('countdownDisplay');
            disp.classList.remove('hidden');
            disp.textContent = seconds > 0 ? seconds : 'BAŞLA!';
            sound.playBeep(440, 0.2);
        });
        this.socket.on('race-start', () => {
            this.state = 'racing';
            document.getElementById('countdownDisplay').classList.add('hidden');
            sound.startEngine();
        });
        this.socket.on('game-state', (state) => {
            this.serverState = state;
            const me = state.players.find(p => p.id === this.myId);
            if (me) {
                this.serverPos = { x: me.x, z: me.z, angle: me.angle, speed: me.speed };
                this.predictedPos.x += (me.x - this.predictedPos.x) * 0.3;
                this.predictedPos.z += (me.z - this.predictedPos.z) * 0.3;
                this.predictedPos.angle = me.angle;
                this.predictedPos.speed = me.speed;
            }
            for (const p of state.players) {
                if (p.id === this.myId) continue;
                if (!this.entities.has(p.id)) {
                    const mesh = createCarModel(0x1e90ff);
                    scene.add(mesh);
                    this.entities.set(p.id, {
                        mesh, target: { x: p.x, z: p.z, angle: p.angle },
                        current: { x: p.x, z: p.z, angle: p.angle },
                        lastUpdate: performance.now()
                    });
                } else {
                    const e = this.entities.get(p.id);
                    e.target = { x: p.x, z: p.z, angle: p.angle };
                    e.lastUpdate = performance.now();
                }
            }
            if (state.bots) {
                for (const b of state.bots) {
                    if (!this.entities.has(b.id)) {
                        const mesh = createCarModel(0x32cd32);
                        scene.add(mesh);
                        this.entities.set(b.id, {
                            mesh, target: { x: b.x, z: b.z, angle: b.angle },
                            current: { x: b.x, z: b.z, angle: b.angle },
                            lastUpdate: performance.now()
                        });
                    } else {
                        const e = this.entities.get(b.id);
                        e.target = { x: b.x, z: b.z, angle: b.angle };
                        e.lastUpdate = performance.now();
                    }
                }
            }
        });
        this.socket.on('race-end', (results) => {
            this.state = 'finished';
            sound.stopEngine();
            sound.playFinish();
            document.getElementById('messageBox').textContent = 'Yarış Bitti!';
            document.getElementById('messageBox').classList.remove('hidden');
            console.log('Sonuçlar:', results);
        });
        this.socket.on('error', (msg) => alert('Hata: ' + msg));
    }

    sendInput() {
        if (this.socket.connected) {
            this.socket.emit('input', { up: keys.up, down: keys.down, left: keys.left, right: keys.right });
        }
    }

    update(dt) {
        if (this.state !== 'racing') return;
        let angle = this.predictedPos.angle;
        let speed = this.predictedPos.speed;
        if (keys.left) angle -= 2.8 * dt;
        if (keys.right) angle += 2.8 * dt;
        if (keys.up) speed += 12 * dt;
        else if (keys.down) speed -= 18 * dt;
        else speed *= 0.96;
        if (speed > 22) speed = 22;
        if (speed < -11) speed = -11;
        this.predictedPos.x += Math.sin(angle) * speed * dt;
        this.predictedPos.z += Math.cos(angle) * speed * dt;
        this.predictedPos.angle = angle;
        this.predictedPos.speed = speed;

        playerCar.position.set(this.predictedPos.x, 0.4, this.predictedPos.z);
        playerCar.rotation.y = this.predictedPos.angle;
        updateCamera(playerCar.position, this.predictedPos.angle);
        sound.updateEngine(speed, 22);

        const now = performance.now();
        for (const [, e] of this.entities) {
            const t = Math.min((now - e.lastUpdate) / 50, 1);
            e.current.x += (e.target.x - e.current.x) * t;
            e.current.z += (e.target.z - e.current.z) * t;
            e.current.angle += (e.target.angle - e.current.angle) * t;
            e.mesh.position.set(e.current.x, 0.4, e.current.z);
            e.mesh.rotation.y = e.current.angle;
        }

        if (this.serverState) {
            const me = this.serverState.players.find(p => p.id === this.myId);
            if (me) {
                document.getElementById('lapCounter').textContent = `Tur: ${me.lap}/3`;
                document.getElementById('speedometer').textContent = `${Math.abs(me.speed * 3.6).toFixed(0)} km/h`;
            }
        }
    }
}

// ========== MENÜ BUTONLARI ==========
// Botlarla Tek Başına Oyna
document.getElementById('singlePlayerBtn').addEventListener('click', () => {
    sound.init();
    socket = io();
    networkGame = new NetworkGame(socket);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    document.getElementById('roomInfo').classList.add('hidden');
    if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('create-room', 'Oyuncu');
    animateLoop();
});

// Çok Oyunculu paneli aç
document.getElementById('multiplayerBtn').addEventListener('click', () => {
    document.getElementById('multiplayerPanel').classList.remove('hidden');
});

// Oda Oluştur
document.getElementById('createRoomBtn').addEventListener('click', () => {
    sound.init();
    const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu 1';
    socket = io();
    networkGame = new NetworkGame(socket);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('create-room', name);
    animateLoop();
});

// Odaya Katıl
document.getElementById('joinRoomBtn').addEventListener('click', () => {
    sound.init();
    const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu 2';
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) return alert('Oda ID girin!');
    socket = io();
    networkGame = new NetworkGame(socket);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    document.getElementById('roomInfo').classList.add('hidden');
    if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('join-room', { roomId, playerName: name });
    animateLoop();
});

// Yarışı Başlat (manuel)
document.getElementById('startRaceBtn').addEventListener('click', () => {
    if (networkGame && networkGame.socket) {
        networkGame.socket.emit('start-race');
    }
});

// Ana döngü
let lastFrameTime = performance.now();
function animateLoop() {
    requestAnimationFrame(animateLoop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (gameMode === 'multiplayer' && networkGame) networkGame.update(dt);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});