import * as THREE from 'three';

// GLTFLoader'ı dene, yoksa devam et
let GLTFLoader;
try {
    const module = await import('three/addons/loaders/GLTFLoader.js');
    GLTFLoader = module.GLTFLoader;
} catch (e) {
    console.log('GLTFLoader yüklenemedi, yedek pist kullanılacak');
}

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
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.log('Ses başlatılamadı');
        }
    }

    startEngine() {
        if (!this.ctx || this.engineOsc) return;
        try {
            this.engineOsc = this.ctx.createOscillator();
            this.engineGain = this.ctx.createGain();
            this.engineOsc.type = 'sawtooth';
            this.engineOsc.frequency.value = 60;
            this.engineGain.gain.value = 0.04;
            this.engineOsc.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);
            this.engineOsc.start();
        } catch (e) {}
    }

    updateEngine(speed, maxSpeed) {
        if (!this.engineOsc) return;
        try {
            const freq = 50 + (Math.abs(speed) / maxSpeed) * 180;
            this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
            const gain = 0.02 + (Math.abs(speed) / maxSpeed) * 0.06;
            this.engineGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1);
        } catch (e) {}
    }

    stopEngine() {
        if (this.engineOsc) {
            try { this.engineOsc.stop(); this.engineOsc.disconnect(); } catch (e) {}
            this.engineOsc = null;
            this.engineGain = null;
        }
    }

    playBeep(freq = 440, duration = 0.15) {
        if (!this.ctx) return;
        try {
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
        } catch (e) {}
    }

    playCrash() {
        if (!this.ctx) return;
        try {
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
        } catch (e) {}
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
    { x: 0, z: 20 }, { x: 30, z: 15 }, { x: 60, z: 5 },
    { x: 80, z: -15 }, { x: 70, z: -45 }, { x: 40, z: -60 },
    { x: 0, z: -55 }, { x: -35, z: -40 }, { x: -60, z: -15 },
    { x: -65, z: 15 }, { x: -45, z: 40 }, { x: -15, z: 45 },
    { x: 0, z: 20 }
];
const TRACK_WIDTH = 14;
const TRACK_HALF = TRACK_WIDTH / 2;

// ========== Three.js Sahnesi ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 100, 250);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 300);
camera.position.set(0, 12, 28);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('gameUI').appendChild(renderer.domElement);

// Işık
scene.add(new THREE.AmbientLight(0x404066, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(50, 80, 30);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 300;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

// Beton zemin
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ========== PİST OLUŞTUR ==========
function createTrack() {
    const trackGroup = new THREE.Group();
    const points = WAYPOINTS.map(wp => new THREE.Vector3(wp.x, 0.02, wp.z));
    const curve = new THREE.CatmullRomCurve3(points, true);
    const divisions = 300;
    const roadPoints = curve.getPoints(divisions);

    // Yol yüzeyi
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= divisions; i++) {
        const pt = roadPoints[i];
        const tangent = curve.getTangent(i / divisions).normalize();
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const left = pt.clone().addScaledVector(perp, TRACK_HALF);
        const right = pt.clone().addScaledVector(perp, -TRACK_HALF);
        vertices.push(left.x, left.y, left.z);
        vertices.push(right.x, right.y, right.z);
    }
    for (let i = 0; i < divisions; i++) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
    }
    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeom.setIndex(indices);
    roadGeom.computeVertexNormals();
    const roadMesh = new THREE.Mesh(roadGeom, new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6 }));
    roadMesh.receiveShadow = true;
    trackGroup.add(roadMesh);

    // Kenar çizgileri
    for (let i = 0; i < divisions; i += 5) {
        const pt = roadPoints[i];
        const tangent = curve.getTangent(i / divisions).normalize();
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const leftPos = pt.clone().addScaledVector(perp, TRACK_HALF);
        const rightPos = pt.clone().addScaledVector(perp, -TRACK_HALF);
        const lineGeom = new THREE.PlaneGeometry(0.3, 2);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const leftLine = new THREE.Mesh(lineGeom, lineMat);
        leftLine.position.copy(leftPos); leftLine.position.y = 0.03;
        leftLine.rotation.y = Math.atan2(tangent.x, tangent.z);
        trackGroup.add(leftLine);
        const rightLine = new THREE.Mesh(lineGeom, lineMat);
        rightLine.position.copy(rightPos); rightLine.position.y = 0.03;
        rightLine.rotation.y = Math.atan2(tangent.x, tangent.z);
        trackGroup.add(rightLine);
    }

    // Bariyerler (kırmızı, alçak, sadece yanlarda)
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.5 });
    for (let i = 0; i < divisions; i += 3) {
        const pt = roadPoints[i];
        const tangent = curve.getTangent(i / divisions).normalize();
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const leftPos = pt.clone().addScaledVector(perp, TRACK_HALF + 0.5);
        const rightPos = pt.clone().addScaledVector(perp, -TRACK_HALF - 0.5);
        const barGeom = new THREE.BoxGeometry(0.3, 0.6, 2.5);
        
        const leftBar = new THREE.Mesh(barGeom, barrierMat);
        leftBar.position.copy(leftPos); leftBar.position.y = 0.3;
        leftBar.rotation.y = Math.atan2(tangent.x, tangent.z);
        leftBar.castShadow = true; leftBar.receiveShadow = true;
        trackGroup.add(leftBar);
        
        const rightBar = new THREE.Mesh(barGeom, barrierMat);
        rightBar.position.copy(rightPos); rightBar.position.y = 0.3;
        rightBar.rotation.y = Math.atan2(tangent.x, tangent.z);
        rightBar.castShadow = true; rightBar.receiveShadow = true;
        trackGroup.add(rightBar);
    }

    // Bitiş çizgisi
    const finishLine = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xffaa00, side: THREE.DoubleSide, emissive: 0x331100 })
    );
    finishLine.position.set(0, 0.04, 20);
    finishLine.rotation.x = -Math.PI / 2;
    trackGroup.add(finishLine);

    scene.add(trackGroup);
}
createTrack();

// GLB model yükleme (varsa ekle)
if (GLTFLoader) {
    const loader = new GLTFLoader();
    loader.load('/models/RaceMap.glb',
        (gltf) => {
            console.log('✅ GLB model yüklendi!');
            gltf.scene.position.set(0, 0.05, 0);
            gltf.scene.traverse(child => {
                if (child.isMesh) {
                    child.receiveShadow = true;
                    child.castShadow = true;
                }
            });
            scene.add(gltf.scene);
        },
        undefined,
        (err) => console.log('⚠️ GLB model bulunamadı, yedek pist kullanılıyor')
    );
}

// Ağaçlar
for (let i = 0; i < 50; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 3),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );
    trunk.position.y = 1.5; trunk.castShadow = true; trunk.receiveShadow = true;
    tree.add(trunk);
    
    const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x228B22 })
    );
    foliage.position.y = 3.5; foliage.castShadow = true; foliage.receiveShadow = true;
    tree.add(foliage);
    
    const angle = Math.random() * Math.PI * 2;
    const radius = 25 + Math.random() * 55;
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    scene.add(tree);
}

// Araba modeli
function createCarModel(color) {
    const car = new THREE.Group();
    
    const bodyGeom = new THREE.BoxGeometry(1.8, 0.6, 3.6);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.5; body.castShadow = true; body.receiveShadow = true;
    car.add(body);
    
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.4, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2 });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.set(0, 0.95, -0.3); cabin.castShadow = true;
    car.add(cabin);
    
    const wheelGeom = new THREE.CylinderGeometry(0.45, 0.45, 0.5, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    [
        [-1, 0.4, 1.4], [1, 0.4, 1.4],
        [-1, 0.4, -1.4], [1, 0.4, -1.4]
    ].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true; wheel.receiveShadow = true;
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

// ========== KONTROLLER ==========
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

// ========== AĞ YÖNETİMİ ==========
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

        this.socket.on('room-created', (data) => {
            console.log('Oda oluşturuldu:', data.roomId);
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        
        this.socket.on('joined-room', (data) => {
            console.log('Odaya katıldı:', data.roomId);
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        
        this.socket.on('player-joined', (data) => {
            console.log('Oyuncu katıldı:', data.name);
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
            console.log('🏁 YARIŞ BAŞLADI!');
        });
        
        this.socket.on('game-state', (state) => {
            this.serverState = state;
            const me = state.players.find(p => p.id === this.myId);
            if (me) {
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
        });
        
        this.socket.on('race-end', () => {
            this.state = 'finished';
            sound.stopEngine();
            sound.playFinish();
            document.getElementById('messageBox').textContent = '🏁 YARIŞ BİTTİ!';
            document.getElementById('messageBox').classList.remove('hidden');
        });
        
        this.socket.on('error', (msg) => alert('Hata: ' + msg));
    }

    sendInput() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('input', keys);
        }
    }

    update(dt) {
        if (this.state !== 'racing') return;
        
        let a = this.predicted.angle;
        let s = this.predicted.speed;
        
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

// ========== MENÜ BUTONLARI (KESİN ÇALIŞIR) ==========
console.log('🚀 OsRace başlatılıyor...');

// Butonları al
const singleBtn = document.getElementById('singlePlayerBtn');
const multiBtn = document.getElementById('multiplayerBtn');
const createBtn = document.getElementById('createRoomBtn');
const joinBtn = document.getElementById('joinRoomBtn');
const startBtn = document.getElementById('startRaceBtn');

console.log('Butonlar kontrol ediliyor...');
console.log('singlePlayerBtn:', singleBtn ? '✅ VAR' : '❌ YOK');
console.log('multiplayerBtn:', multiBtn ? '✅ VAR' : '❌ YOK');
console.log('createRoomBtn:', createBtn ? '✅ VAR' : '❌ YOK');
console.log('joinRoomBtn:', joinBtn ? '✅ VAR' : '❌ YOK');
console.log('startRaceBtn:', startBtn ? '✅ VAR' : '❌ YOK');

// Botlarla oyna
if (singleBtn) {
    singleBtn.addEventListener('click', () => {
        console.log('🟢 Botlarla oyna tıklandı');
        sound.init();
        socket = io();
        networkGame = new NetworkGame(socket);
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('gameUI').classList.remove('hidden');
        document.getElementById('roomInfo').classList.add('hidden');
        if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
        socket.emit('create-room', 'Oyuncu');
        animateLoop();
    });
}

// Çok oyunculu menüyü aç
if (multiBtn) {
    multiBtn.addEventListener('click', () => {
        console.log('🟢 Çok oyunculu tıklandı');
        document.getElementById('multiplayerPanel').classList.remove('hidden');
    });
}

// Oda oluştur
if (createBtn) {
    createBtn.addEventListener('click', () => {
        console.log('🟢 Oda oluştur tıklandı');
        sound.init();
        const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu 1';
        socket = io();
        networkGame = new NetworkGame(socket);
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('gameUI').classList.remove('hidden');
        if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
        socket.emit('create-room', name);
        animateLoop();
    });
}

// Odaya katıl
if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        console.log('🟢 Odaya katıl tıklandı');
        sound.init();
        const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu 2';
        const roomId = document.getElementById('roomIdInput').value.trim();
        if (!roomId) return alert('Lütfen Oda ID girin!');
        socket = io();
        networkGame = new NetworkGame(socket);
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('gameUI').classList.remove('hidden');
        document.getElementById('roomInfo').classList.add('hidden');
        if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
        socket.emit('join-room', { roomId, playerName: name });
        animateLoop();
    });
}

// Yarışı başlat
if (startBtn) {
    startBtn.addEventListener('click', () => {
        console.log('🟢 Yarış başlat tıklandı');
        if (networkGame && networkGame.socket) {
            networkGame.socket.emit('start-race');
        }
    });
}

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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

console.log('✅ OsRace hazır! Butonlar çalışıyor.');