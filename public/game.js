import * as THREE from 'three';

// ========== Ses Yöneticisi (Web Audio API) ==========
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

// ========== Pist Noktaları (Sunucu ile aynı) ==========
const WAYPOINTS = [
    { x: 0, z: 10 }, { x: 15, z: 8 }, { x: 25, z: 0 },
    { x: 20, z: -15 }, { x: 5, z: -22 }, { x: -10, z: -18 },
    { x: -20, z: -5 }, { x: -15, z: 10 }, { x: -5, z: 18 }
];

const TRACK_WIDTH = 8;
const TRACK_HALF = TRACK_WIDTH / 2;

// ========== Three.js Sahnesi ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 120);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 200);
camera.position.set(0, 10, 20);
camera.lookAt(0, 0, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('gameUI').appendChild(renderer.domElement);

// Işıklandırma
const ambientLight = new THREE.AmbientLight(0x404066);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(20, 30, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 512;
dirLight.shadow.mapSize.height = 512;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
scene.add(dirLight);

// Yer düzlemi
const groundGeom = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ========== Pist ve Duvarlar ==========
function createTrack() {
    const trackGroup = new THREE.Group();

    // Yol yüzeyi (tube)
    const points = WAYPOINTS.map(wp => new THREE.Vector3(wp.x, 0.01, wp.z));
    const curve = new THREE.CatmullRomCurve3(points, true);
    const tubeGeom = new THREE.TubeGeometry(curve, 100, TRACK_HALF, 8, true);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    const trackMesh = new THREE.Mesh(tubeGeom, tubeMat);
    trackMesh.receiveShadow = true;
    trackGroup.add(trackMesh);

    // Kenar çizgileri (beyaz kesikli)
    const edgePoints = curve.getPoints(200);
    for (let i = 0; i < edgePoints.length - 1; i++) {
        const p1 = edgePoints[i];
        const p2 = edgePoints[i + 1];
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        const leftPos = mid.clone().addScaledVector(perp, TRACK_HALF);
        const rightPos = mid.clone().addScaledVector(perp, -TRACK_HALF);
        if (i % 4 === 0) {
            const lineGeom = new THREE.BoxGeometry(0.3, 0.05, 2);
            const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const leftLine = new THREE.Mesh(lineGeom, lineMat);
            leftLine.position.copy(leftPos);
            leftLine.position.y = 0.03;
            trackGroup.add(leftLine);
            const rightLine = new THREE.Mesh(lineGeom, lineMat);
            rightLine.position.copy(rightPos);
            rightLine.position.y = 0.03;
            trackGroup.add(rightLine);
        }
    }

    // Bitiş çizgisi
    const finishGeom = new THREE.BoxGeometry(0.5, 0.1, 3);
    const finishMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const finishLine = new THREE.Mesh(finishGeom, finishMat);
    finishLine.position.set(0, 0.03, 10.5);
    trackGroup.add(finishLine);

    // ====== DUVARLAR ======
    const wallHeight = 1.2;
    const wallThickness = 0.3;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });

    // Kenar noktalarını daha sık hesapla
    const wallEdgePoints = curve.getPoints(300);
    for (let i = 0; i < wallEdgePoints.length - 1; i++) {
        const p1 = wallEdgePoints[i];
        const p2 = wallEdgePoints[i + 1];
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const length = dir.length();
        dir.normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        // Sol duvar
        const leftWallPos = mid.clone().addScaledVector(perp, TRACK_HALF);
        const leftWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, length);
        const leftWall = new THREE.Mesh(leftWallGeom, wallMat);
        leftWall.position.copy(leftWallPos);
        leftWall.position.y = wallHeight / 2;
        leftWall.rotation.y = Math.atan2(dir.x, dir.z);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        trackGroup.add(leftWall);

        // Sağ duvar
        const rightWallPos = mid.clone().addScaledVector(perp, -TRACK_HALF);
        const rightWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, length);
        const rightWall = new THREE.Mesh(rightWallGeom, wallMat);
        rightWall.position.copy(rightWallPos);
        rightWall.position.y = wallHeight / 2;
        rightWall.rotation.y = Math.atan2(dir.x, dir.z);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        trackGroup.add(rightWall);
    }

    scene.add(trackGroup);
}
createTrack();

// Ağaçlar
for (let i = 0; i < 30; i++) {
    const treeGroup = new THREE.Group();
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.4, 2);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);
    const foliageGeom = new THREE.ConeGeometry(0.8, 2, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 2.5;
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    treeGroup.add(foliage);
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * 25;
    treeGroup.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    scene.add(treeGroup);
}

// Araba modeli
function createCarModel(color = 0xff4500) {
    const car = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(1.6, 0.6, 3.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    body.receiveShadow = true;
    car.add(body);
    const cabinGeom = new THREE.BoxGeometry(1.2, 0.4, 1.6);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.set(0, 0.9, -0.3);
    cabin.castShadow = true;
    car.add(cabin);
    const wheelGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const positions = [[-0.9, 0.3, 1.2], [0.9, 0.3, 1.2], [-0.9, 0.3, -1.2], [0.9, 0.3, -1.2]];
    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        car.add(wheel);
    });
    return car;
}

const carMeshes = new Map();
const playerCar = createCarModel(0xff4500);
scene.add(playerCar);

// ========== İstemci Durumu ve Ağ ==========
let gameMode = null;
let localGame = null;
let networkGame = null;
let socket = null;

const keys = { up: false, down: false, left: false, right: false };

// Klavye
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
    const steerLeft = document.getElementById('steerLeft');
    const steerRight = document.getElementById('steerRight');
    const gasBtn = document.getElementById('gasBtn');
    const brakeBtn = document.getElementById('brakeBtn');

    function setInput(btn, key) {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[key] = true;
            if (networkGame) networkGame.sendInput();
        });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[key] = false;
            if (networkGame) networkGame.sendInput();
        });
        btn.addEventListener('touchcancel', (e) => {
            keys[key] = false;
            if (networkGame) networkGame.sendInput();
        });
    }
    setInput(steerLeft, 'left');
    setInput(steerRight, 'right');
    setInput(gasBtn, 'up');
    setInput(brakeBtn, 'down');
}
setupTouchControls();

// Kamera takip
function updateCamera(targetPosition, targetAngle) {
    const distance = 8;
    const height = 4;
    const backX = targetPosition.x - Math.sin(targetAngle) * distance;
    const backZ = targetPosition.z - Math.cos(targetAngle) * distance;
    camera.position.lerp(new THREE.Vector3(backX, targetPosition.y + height, backZ), 0.1);
    camera.lookAt(targetPosition.x, targetPosition.y + 0.5, targetPosition.z);
}

// ========== Yerel Tek Oyuncu (Botlarla) ==========
class Car {
    constructor(x, z, angle, color) {
        this.x = x;
        this.z = z;
        this.angle = angle;
        this.speed = 0;
        this.color = color;
        this.lap = 0;
        this.waypointIndex = 0;
        this.finished = false;
        this.prevX = x;
        this.prevZ = z;
    }
    update(dt, input) {
        this.prevX = this.x;
        this.prevZ = this.z;
        if (input.left) this.angle -= 2.8 * dt;
        if (input.right) this.angle += 2.8 * dt;
        if (input.up) this.speed += 12 * dt;
        else if (input.down) this.speed -= 18 * dt;
        else this.speed *= 0.96;
        if (this.speed > 22) this.speed = 22;
        if (this.speed < -11) this.speed = -11;
        this.x += Math.sin(this.angle) * this.speed * dt;
        this.z += Math.cos(this.angle) * this.speed * dt;

        // Pist dışı kontrolü
        let minDist = Infinity;
        for (const wp of WAYPOINTS) {
            const d = Math.hypot(wp.x - this.x, wp.z - this.z);
            if (d < minDist) minDist = d;
        }
        if (minDist > TRACK_HALF + 1.5) {
            this.speed *= -0.3;
            sound.playCrash();
        }
    }
}

class BotAI {
    constructor(car) {
        this.car = car;
    }
    update(dt) {
        if (this.car.finished) return;
        const target = WAYPOINTS[this.car.waypointIndex];
        const dx = target.x - this.car.x;
        const dz = target.z - this.car.z;
        const dist = Math.hypot(dx, dz);
        const desiredAngle = Math.atan2(dx, dz);
        let diff = desiredAngle - this.car.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (dist < 3.5) {
            this.car.waypointIndex = (this.car.waypointIndex + 1) % WAYPOINTS.length;
            if (this.car.waypointIndex === 0) {
                this.car.lap++;
                if (this.car.lap >= 3) this.car.finished = true;
            }
        }
        const input = { up: true, down: false, left: false, right: false };
        if (Math.abs(diff) > 0.9 && this.car.speed > 14) {
            input.up = false;
            input.down = true;
        }
        if (diff > 0.2) input.right = true;
        else if (diff < -0.2) input.left = true;
        this.car.update(dt, input);
    }
}

class LocalRace {
    constructor() {
        this.player = new Car(0, 11, Math.atan2(15, -2), '#ff4500');
        this.bots = [];
        const colors = ['#1e90ff', '#32cd32', '#ffd700'];
        for (let i = 0; i < 3; i++) {
            const botCar = new Car(1.5 + i * 0.8, 12, this.player.angle, colors[i]);
            this.bots.push({ car: botCar, ai: new BotAI(botCar) });
        }
        this.state = 'countdown';
        this.countdown = 3;
        this.countdownStart = 0;
        this.lastTime = performance.now();
        this.finished = false;
    }

    startCountdown() {
        this.state = 'countdown';
        this.countdown = 3;
        this.countdownStart = performance.now();
        sound.playBeep(440, 0.2);
    }

    update() {
        const now = performance.now();
        if (this.state === 'countdown') {
            const elapsed = (now - this.countdownStart) / 1000;
            const newCount = 3 - Math.floor(elapsed);
            if (newCount !== this.countdown && newCount >= 0) {
                sound.playBeep(440, 0.2);
                document.getElementById('countdownDisplay').textContent = newCount > 0 ? newCount : 'BAŞLA!';
            }
            if (elapsed >= 3) {
                this.state = 'racing';
                this.lastTime = performance.now(); // İlk frame sıçramasını önle
                document.getElementById('countdownDisplay').classList.add('hidden');
                sound.startEngine();
            }
            return;
        }

        const dt = Math.min(0.05, (now - this.lastTime) / 1000);
        this.lastTime = now;

        if (this.state === 'racing') {
            this.player.update(dt, keys);
            sound.updateEngine(this.player.speed, 22);
            for (const bot of this.bots) bot.ai.update(dt);

            if (this.player.finished && !this.finished) {
                this.finished = true;
                this.state = 'finished';
                sound.stopEngine();
                sound.playFinish();
                document.getElementById('messageBox').textContent = 'Yarış Bitti!';
                document.getElementById('messageBox').classList.remove('hidden');
            }
        }

        document.getElementById('lapCounter').textContent = `Tur: ${this.player.lap}/3`;
        document.getElementById('speedometer').textContent = `${Math.abs(this.player.speed * 3.6).toFixed(0)} km/h`;
    }

    render() {
        playerCar.position.set(this.player.x, 0.3, this.player.z);
        playerCar.rotation.y = this.player.angle;
        for (let i = 0; i < this.bots.length; i++) {
            const bot = this.bots[i].car;
            if (!carMeshes.has(`bot_${i}`)) {
                const mesh = createCarModel(bot.color);
                scene.add(mesh);
                carMeshes.set(`bot_${i}`, mesh);
            }
            const mesh = carMeshes.get(`bot_${i}`);
            mesh.position.set(bot.x, 0.3, bot.z);
            mesh.rotation.y = bot.angle;
        }
        updateCamera(playerCar.position, this.player.angle);
    }
}

// ========== Çok Oyunculu Ağ (İstemci Tahmini & Interpolasyon) ==========
class NetworkGame {
    constructor(socket) {
        this.socket = socket;
        this.state = 'waiting';
        this.serverState = null;
        this.lastServerUpdate = 0;
        this.myId = socket.id;
        this.entities = new Map();
        this.playerEntity = null;
        this.predictedPosition = { x: 0, z: 0, angle: 0, speed: 0 };
        this.serverPosition = { x: 0, z: 0, angle: 0, speed: 0 };

        this.socket.on('room-created', (data) => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
            document.getElementById('roomIdInput').value = data.roomId;
        });
        this.socket.on('joined-room', (data) => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
            document.getElementById('roomIdInput').value = data.roomId;
        });
        this.socket.on('player-joined', (data) => console.log('Katıldı:', data.name));
        this.socket.on('player-left', (id) => {
            if (this.entities.has(id)) {
                scene.remove(this.entities.get(id).mesh);
                this.entities.delete(id);
            }
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
            playerCar.position.set(0, 0.3, 11);
            playerCar.rotation.y = 0;
        });
        this.socket.on('game-state', (state) => {
            this.serverState = state;
            this.lastServerUpdate = performance.now();
            const me = state.players.find(p => p.id === this.myId);
            if (me) {
                this.serverPosition = { x: me.x, z: me.z, angle: me.angle, speed: me.speed };
                this.predictedPosition.x += (me.x - this.predictedPosition.x) * 0.3;
                this.predictedPosition.z += (me.z - this.predictedPosition.z) * 0.3;
                this.predictedPosition.angle = me.angle;
                this.predictedPosition.speed = me.speed;
            }
            state.players.forEach(p => {
                if (p.id === this.myId) return;
                if (!this.entities.has(p.id)) {
                    const mesh = createCarModel(0x1e90ff);
                    scene.add(mesh);
                    this.entities.set(p.id, {
                        mesh,
                        target: { x: p.x, z: p.z, angle: p.angle },
                        current: { x: p.x, z: p.z, angle: p.angle },
                        lastUpdate: performance.now()
                    });
                } else {
                    const entity = this.entities.get(p.id);
                    entity.target = { x: p.x, z: p.z, angle: p.angle };
                    entity.lastUpdate = performance.now();
                }
            });
            state.bots.forEach(b => {
                if (!this.entities.has(b.id)) {
                    const mesh = createCarModel(0x32cd32);
                    scene.add(mesh);
                    this.entities.set(b.id, {
                        mesh,
                        target: { x: b.x, z: b.z, angle: b.angle },
                        current: { x: b.x, z: b.z, angle: b.angle },
                        lastUpdate: performance.now()
                    });
                } else {
                    const entity = this.entities.get(b.id);
                    entity.target = { x: b.x, z: b.z, angle: b.angle };
                    entity.lastUpdate = performance.now();
                }
            });
        });
        this.socket.on('race-end', (results) => {
            this.state = 'finished';
            sound.stopEngine();
            sound.playFinish();
            document.getElementById('messageBox').textContent = 'Yarış Bitti!';
            document.getElementById('messageBox').classList.remove('hidden');
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
        // İstemci tahmini
        let angle = this.predictedPosition.angle;
        let speed = this.predictedPosition.speed;
        if (keys.left) angle -= 2.8 * dt;
        if (keys.right) angle += 2.8 * dt;
        if (keys.up) speed += 12 * dt;
        else if (keys.down) speed -= 18 * dt;
        else speed *= 0.96;
        if (speed > 22) speed = 22;
        if (speed < -11) speed = -11;
        this.predictedPosition.x += Math.sin(angle) * speed * dt;
        this.predictedPosition.z += Math.cos(angle) * speed * dt;
        this.predictedPosition.angle = angle;
        this.predictedPosition.speed = speed;

        playerCar.position.set(this.predictedPosition.x, 0.3, this.predictedPosition.z);
        playerCar.rotation.y = this.predictedPosition.angle;
        updateCamera(playerCar.position, this.predictedPosition.angle);
        sound.updateEngine(speed, 22);

        // Diğer varlıkların interpolasyonu
        const now = performance.now();
        for (const [id, entity] of this.entities) {
            const t = Math.min((now - entity.lastUpdate) / 50, 1);
            entity.current.x += (entity.target.x - entity.current.x) * t;
            entity.current.z += (entity.target.z - entity.current.z) * t;
            entity.current.angle += (entity.target.angle - entity.current.angle) * t;
            entity.mesh.position.set(entity.current.x, 0.3, entity.current.z);
            entity.mesh.rotation.y = entity.current.angle;
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

// ========== Menü ve Oyun Başlatma ==========
const menuDiv = document.getElementById('menu');
const gameUIDiv = document.getElementById('gameUI');
const touchControls = document.getElementById('touchControls');

document.getElementById('singlePlayerBtn').addEventListener('click', () => {
    sound.init();
    menuDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    if ('ontouchstart' in window) touchControls.classList.remove('hidden');
    gameMode = 'single';
    localGame = new LocalRace();
    localGame.startCountdown();
    document.getElementById('countdownDisplay').classList.remove('hidden');
    animateLoop();
});

document.getElementById('multiplayerBtn').addEventListener('click', () => {
    document.getElementById('multiplayerPanel').classList.remove('hidden');
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
    const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu';
    connectAndCreateRoom(name);
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu';
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (roomId) connectAndJoinRoom(roomId, name);
});

document.getElementById('startRaceBtn').addEventListener('click', () => {
    if (networkGame && networkGame.socket) {
        networkGame.socket.emit('start-race');
    }
});

function connectAndCreateRoom(name) {
    sound.init();
    socket = io();
    networkGame = new NetworkGame(socket);
    menuDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    if ('ontouchstart' in window) touchControls.classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('create-room', name);
    animateLoop();
}

function connectAndJoinRoom(roomId, name) {
    sound.init();
    socket = io();
    networkGame = new NetworkGame(socket);
    menuDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    if ('ontouchstart' in window) touchControls.classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('join-room', { roomId, playerName: name });
    animateLoop();
}

// Ana döngü
let lastFrameTime = performance.now();
function animateLoop() {
    requestAnimationFrame(animateLoop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (gameMode === 'single' && localGame) {
        localGame.update();
        localGame.render();
    } else if (gameMode === 'multiplayer' && networkGame) {
        networkGame.update(dt);
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});