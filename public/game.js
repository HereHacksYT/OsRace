import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

// ========== Pist Noktaları (Sunucu ile aynı) ==========
const WAYPOINTS = [
    { x: 0, z: 20 }, { x: 30, z: 15 }, { x: 60, z: 5 },
    { x: 80, z: -15 }, { x: 70, z: -45 }, { x: 40, z: -60 },
    { x: 0, z: -55 }, { x: -35, z: -40 }, { x: -60, z: -15 },
    { x: -65, z: 15 }, { x: -45, z: 40 }, { x: -15, z: 45 },
    { x: 0, z: 20 }
];
const TRACK_WIDTH = 14;

// ========== Three.js Sahnesi ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 100, 300);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 300);
camera.position.set(0, 10, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('gameUI').appendChild(renderer.domElement);

// Işık
scene.add(new THREE.AmbientLight(0x404066, 0.5));
const sunLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
sunLight.position.set(50, 80, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 300;
sunLight.shadow.camera.left = -120;
sunLight.shadow.camera.right = 120;
sunLight.shadow.camera.top = 120;
sunLight.shadow.camera.bottom = -120;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4);
fillLight.position.set(-30, 20, -20);
scene.add(fillLight);

// ========== GLB MODEL YÜKLEME ==========
const loader = new GLTFLoader();
let modelLoaded = false;

function updateLoadingProgress(percent) {
    const progress = document.getElementById('loadingProgress');
    const text = document.getElementById('loadingText');
    if (progress) progress.style.width = percent + '%';
    if (text) text.textContent = `Harita yükleniyor... %${percent}`;
}

loader.load('/models/RaceMap.glb',
    (gltf) => {
        const model = gltf.scene;
        
        // 1K texture için optimize filtreleme
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                if (child.material.map) {
                    child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
                    child.material.map.magFilter = THREE.LinearFilter;
                    child.material.map.generateMipmaps = true;
                    child.material.map.anisotropy = 4;
                }
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        model.position.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        scene.add(model);
        
        modelLoaded = true;
        console.log('✅ GLB Harita yüklendi! (1K texture)');
        
        // Yükleme ekranını gizle
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.remove(), 500);
            }
        }, 500);
    },
    (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        updateLoadingProgress(percent);
    },
    (error) => {
        console.error('❌ GLB yüklenemedi:', error);
        updateLoadingProgress(100);
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.remove(), 500);
            }
        }, 500);
        createFallbackTrack();
    }
);

// Yedek pist
function createFallbackTrack() {
    console.log('⚠️ Yedek düz pist oluşturuluyor...');
    const groundGeom = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const roadGeom = new THREE.PlaneGeometry(TRACK_WIDTH, 200);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 0);
    road.receiveShadow = true;
    scene.add(road);
}

// Araba modeli
function createCarModel(color = 0xff4500) {
    const car = new THREE.Group();
    
    const bodyGeom = new THREE.BoxGeometry(1.8, 0.6, 3.6);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    car.add(body);
    
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.4, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.3 });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.set(0, 0.95, -0.3);
    cabin.castShadow = true;
    car.add(cabin);
    
    const wheelGeom = new THREE.CylinderGeometry(0.45, 0.45, 0.5, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    [
        [-1, 0.4, 1.4], [1, 0.4, 1.4],
        [-1, 0.4, -1.4], [1, 0.4, -1.4]
    ].forEach((pos) => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        car.add(wheel);
    });
    
    return car;
}

const playerCar = createCarModel(0xff4500);
scene.add(playerCar);
const carMeshes = new Map();

// Kamera takip
function updateCamera(pos, angle) {
    const dist = 12, h = 6;
    const targetX = pos.x - Math.sin(angle) * dist;
    const targetZ = pos.z - Math.cos(angle) * dist;
    camera.position.lerp(new THREE.Vector3(targetX, pos.y + h, targetZ), 0.06);
    camera.lookAt(pos.x, pos.y + 0.8, pos.z);
}

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
    const btnMap = {
        steerLeft: 'left', steerRight: 'right',
        gasBtn: 'up', brakeBtn: 'down'
    };
    for (const [id, key] of Object.entries(btnMap)) {
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

// ========== Ağ Yönetimi ==========
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
        this.predicted = { x: 0, z: 0, angle: 0, speed: 0 };
        this.serverPos = { x: 0, z: 0, angle: 0, speed: 0 };

        this.socket.on('room-created', (data) => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        this.socket.on('joined-room', (data) => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        this.socket.on('player-joined', () => {
            document.getElementById('playerCount').textContent = 'Oyuncu: 2/2';
        });
        this.socket.on('player-left', (id) => {
            if (this.entities.has(id)) {
                scene.remove(this.entities.get(id).mesh);
                this.entities.delete(id);
            }
            document.getElementById('playerCount').textContent = 'Oyuncu: 1/2';
        });
        this.socket.on('countdown', (sec) => {
            this.state = 'countdown';
            const disp = document.getElementById('countdownDisplay');
            disp.classList.remove('hidden');
            disp.textContent = sec > 0 ? sec : 'BAŞLA!';
            sound.playBeep(440, 0.2);
        });
        this.socket.on('race-start', () => {
            this.state = 'racing';
            document.getElementById('countdownDisplay').classList.add('hidden');
            document.getElementById('messageBox').classList.add('hidden');
            sound.startEngine();
        });
        this.socket.on('game-state', (state) => {
            this.serverState = state;
            const me = state.players.find(p => p.id === this.myId);
            if (me) {
                this.serverPos = { x: me.x, z: me.z, angle: me.angle, speed: me.speed };
                this.predicted.x += (me.x - this.predicted.x) * 0.3;
                this.predicted.z += (me.z - this.predicted.z) * 0.3;
                this.predicted.angle = me.angle;
                this.predicted.speed = me.speed;
            }
            state.players.forEach(p => {
                if (p.id === this.myId) return;
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
            });
            state.bots.forEach(b => {
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
            });
            
            // Pozisyon hesapla
            if (me) {
                const all = [...state.players, ...state.bots];
                all.sort((a, b) => b.lap - a.lap);
                const myPos = all.findIndex(c => c.id === this.myId) + 1;
                document.getElementById('positionDisplay').textContent = `Pozisyon: ${myPos}/${all.length}`;
            }
        });
        this.socket.on('race-end', (results) => {
            this.state = 'finished';
            sound.stopEngine();
            sound.playFinish();
            const myResult = results.find(r => r.id === this.myId);
            const pos = results.indexOf(myResult) + 1;
            document.getElementById('messageBox').innerHTML = `🏁 YARIŞ BİTTİ!<br><small>${pos}. oldun!</small>`;
            document.getElementById('messageBox').classList.remove('hidden');
        });
        this.socket.on('error', (msg) => alert('Hata: ' + msg));
    }

    sendInput() {
        if (this.socket.connected) {
            this.socket.emit('input', keys);
        }
    }

    update(dt) {
        if (this.state !== 'racing') return;
        
        let a = this.predicted.angle, s = this.predicted.speed;
        if (keys.left) a -= 2.8 * dt;
        if (keys.right) a += 2.8 * dt;
        if (keys.up) s += 14 * dt;
        else if (keys.down) s -= 20 * dt;
        else s *= 0.96;
        if (s > 25) s = 25;
        if (s < -12) s = -12;
        
        this.predicted.x += Math.sin(a) * s * dt;
        this.predicted.z += Math.cos(a) * s * dt;
        this.predicted.angle = a;
        this.predicted.speed = s;

        playerCar.position.set(this.predicted.x, 0.1, this.predicted.z);
        playerCar.rotation.y = this.predicted.angle;
        updateCamera(playerCar.position, this.predicted.angle);
        sound.updateEngine(s, 25);

        const now = performance.now();
        this.entities.forEach(e => {
            const t = Math.min((now - e.lastUpdate) / 50, 1);
            e.current.x += (e.target.x - e.current.x) * t;
            e.current.z += (e.target.z - e.current.z) * t;
            e.current.angle += (e.target.angle - e.current.angle) * t;
            e.mesh.position.set(e.current.x, 0.1, e.current.z);
            e.mesh.rotation.y = e.current.angle;
        });

        const me = this.serverState?.players?.find(p => p.id === this.myId);
        if (me) {
            document.getElementById('lapCounter').textContent = `Tur: ${me.lap}/3`;
            document.getElementById('speedometer').textContent = `${Math.abs(me.speed * 3.6).toFixed(0)} km/h`;
        }
    }
}

// ========== MENÜ BUTONLARI ==========
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

document.getElementById('multiplayerBtn').addEventListener('click', () => {
    document.getElementById('multiplayerPanel').classList.remove('hidden');
});

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

document.getElementById('startRaceBtn').addEventListener('click', () => {
    if (networkGame && networkGame.socket) {
        networkGame.socket.emit('start-race');
    }
});

// Ana döngü
let lastFrame = performance.now();
function animateLoop() {
    requestAnimationFrame(animateLoop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (networkGame) networkGame.update(dt);
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});