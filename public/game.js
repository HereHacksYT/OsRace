import * as THREE from 'three';

// Ses sistemi aynı
class SoundManager { /* ... sound sınıfı aynen korunacak ... */ }
const sound = new SoundManager();

// Yeni pist noktaları (sunucu ile aynı)
const WAYPOINTS = [
    { x: 0, z: 20 }, { x: 30, z: 15 }, { x: 60, z: 5 },
    { x: 80, z: -15 }, { x: 70, z: -45 }, { x: 40, z: -60 },
    { x: 0, z: -55 }, { x: -35, z: -40 }, { x: -60, z: -15 },
    { x: -65, z: 15 }, { x: -45, z: 40 }, { x: -15, z: 45 },
    { x: 0, z: 20 }
];
const TRACK_WIDTH = 14;
const TRACK_HALF = TRACK_WIDTH / 2;

// Three.js sahne
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 100, 250);
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('gameUI').appendChild(renderer.domElement);

// Işık
scene.add(new THREE.AmbientLight(0x404066));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(50, 80, 30);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048,2048);
dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 300;
dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

// Beton zemin
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 })
);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// --- DÜZ YOL (Tünel yok!) ---
function createFlatTrack() {
    const trackGroup = new THREE.Group();
    const points = WAYPOINTS.map(wp => new THREE.Vector3(wp.x, 0.01, wp.z));
    const curve = new THREE.CatmullRomCurve3(points, true);
    const divisions = 300;
    const roadPoints = curve.getPoints(divisions);
    
    // Yol yüzeyi için düz ribbon
    const vertices = [];
    const indices = [];
    const uvs = [];
    for (let i = 0; i <= divisions; i++) {
        const pt = roadPoints[i];
        const tangent = curve.getTangent(i / divisions).normalize();
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const left = pt.clone().addScaledVector(perp, TRACK_HALF);
        const right = pt.clone().addScaledVector(perp, -TRACK_HALF);
        vertices.push(left.x, left.y, left.z);
        vertices.push(right.x, right.y, right.z);
        uvs.push(0, i/divisions, 1, i/divisions);
    }
    for (let i = 0; i < divisions; i++) {
        const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
        indices.push(a, b, c);
        indices.push(b, d, c);
    }
    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeom.setIndex(indices);
    roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeom.computeVertexNormals();
    const roadMesh = new THREE.Mesh(roadGeom, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 }));
    roadMesh.receiveShadow = true;
    trackGroup.add(roadMesh);

    // Kenar çizgileri (beyaz)
    for (let i = 0; i < divisions; i += 5) {
        const pt = roadPoints[i];
        const tangent = curve.getTangent(i / divisions).normalize();
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const leftPos = pt.clone().addScaledVector(perp, TRACK_HALF);
        const rightPos = pt.clone().addScaledVector(perp, -TRACK_HALF);
        const lineGeom = new THREE.PlaneGeometry(0.3, 2);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const leftLine = new THREE.Mesh(lineGeom, lineMat);
        leftLine.position.copy(leftPos); leftLine.position.y = 0.02;
        leftLine.rotation.y = Math.atan2(tangent.x, tangent.z);
        trackGroup.add(leftLine);
        const rightLine = rightLine.clone();
        rightLine.position.copy(rightPos); rightLine.position.y = 0.02;
        rightLine.rotation.y = Math.atan2(tangent.x, tangent.z);
        trackGroup.add(rightLine);
    }

    // Alçak bariyerler (kırmızı-beyaz)
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.6 });
    for (let i = 0; i < divisions; i += 3) {
        const pt = roadPoints[i];
        const tangent = curve.getTangent(i / divisions).normalize();
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const leftPos = pt.clone().addScaledVector(perp, TRACK_HALF + 0.5);
        const rightPos = pt.clone().addScaledVector(perp, -TRACK_HALF - 0.5);
        const barGeom = new THREE.BoxGeometry(0.3, 0.6, 2);
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
        new THREE.PlaneGeometry(4, 1),
        new THREE.MeshStandardMaterial({ color: 0xffaa00, side: THREE.DoubleSide })
    );
    finishLine.position.set(0, 0.03, 20);
    finishLine.rotation.x = -Math.PI/2;
    trackGroup.add(finishLine);

    scene.add(trackGroup);
}
createFlatTrack();

// Ağaçlar (büyük alana yay)
for (let i = 0; i < 60; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,3), new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
    trunk.position.y = 1.5; trunk.castShadow = trunk.receiveShadow = true;
    tree.add(trunk);
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.2,3,8), new THREE.MeshStandardMaterial({ color: 0x228B22 }));
    foliage.position.y = 3.5; foliage.castShadow = foliage.receiveShadow = true;
    tree.add(foliage);
    const angle = Math.random()*Math.PI*2;
    const r = 30 + Math.random()*60;
    tree.position.set(Math.cos(angle)*r, 0, Math.sin(angle)*r);
    scene.add(tree);
}

// Araba modeli (biraz daha alçak)
function createCarModel(color) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.6,3.6), new THREE.MeshStandardMaterial({ color }));
    body.position.y = 0.5; body.castShadow = body.receiveShadow = true;
    car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.4,1.8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    cabin.position.set(0,0.95,-0.3); cabin.castShadow = true;
    car.add(cabin);
    const wheelGeom = new THREE.CylinderGeometry(0.45,0.45,0.5,16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    [[-1,0.4,1.4],[1,0.4,1.4],[-1,0.4,-1.4],[1,0.4,-1.4]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.rotation.z = Math.PI/2;
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = wheel.receiveShadow = true;
        car.add(wheel);
    });
    return car;
}
const playerCar = createCarModel(0xff4500);
scene.add(playerCar);
const carMeshes = new Map();

// Kamera takip
function updateCamera(pos, angle) {
    const dist = 10, h = 5;
    camera.position.lerp(new THREE.Vector3(
        pos.x - Math.sin(angle)*dist, pos.y + h, pos.z - Math.cos(angle)*dist
    ), 0.08);
    camera.lookAt(pos.x, pos.y+0.5, pos.z);
}

// Kontroller (klavye + dokunmatik)
const keys = { up:false, down:false, left:false, right:false };
// ... klavye eventleri aynı ...
// Mobil dokunmatik aynı ...

let gameMode, networkGame, socket;

class NetworkGame {
    constructor(socket) {
        this.socket = socket;
        this.state = 'waiting';
        this.myId = socket.id;
        this.entities = new Map();
        this.predicted = { x:0, z:0, angle:0, speed:0 };
        this.serverPos = { x:0, z:0, angle:0, speed:0 };
        socket.on('room-created', data => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        socket.on('joined-room', data => {
            document.getElementById('roomInfo').classList.remove('hidden');
            document.getElementById('displayRoomId').textContent = data.roomId;
        });
        socket.on('player-joined', data => {
            document.getElementById('playerCount').textContent = 'Oyuncu: 2/2';
        });
        socket.on('player-left', id => {
            if (this.entities.has(id)) { scene.remove(this.entities.get(id).mesh); this.entities.delete(id); }
        });
        socket.on('countdown', sec => {
            this.state = 'countdown';
            const disp = document.getElementById('countdownDisplay');
            disp.classList.remove('hidden');
            disp.textContent = sec > 0 ? sec : 'BAŞLA!';
            sound.playBeep(440, 0.2);
        });
        socket.on('race-start', () => {
            this.state = 'racing';
            document.getElementById('countdownDisplay').classList.add('hidden');
            sound.startEngine();
        });
        socket.on('game-state', state => {
            const me = state.players.find(p => p.id === this.myId);
            if (me) {
                this.serverPos = { x:me.x, z:me.z, angle:me.angle, speed:me.speed };
                this.predicted.x += (me.x - this.predicted.x)*0.3;
                this.predicted.z += (me.z - this.predicted.z)*0.3;
                this.predicted.angle = me.angle;
                this.predicted.speed = me.speed;
            }
            state.players.forEach(p => {
                if (p.id === this.myId) return;
                if (!this.entities.has(p.id)) {
                    const mesh = createCarModel(0x1e90ff);
                    scene.add(mesh);
                    this.entities.set(p.id, {
                        mesh, target: { x:p.x, z:p.z, angle:p.angle },
                        current: { x:p.x, z:p.z, angle:p.angle },
                        lastUpdate: performance.now()
                    });
                } else {
                    const e = this.entities.get(p.id);
                    e.target = { x:p.x, z:p.z, angle:p.angle };
                    e.lastUpdate = performance.now();
                }
            });
            state.bots.forEach(b => {
                if (!this.entities.has(b.id)) {
                    const mesh = createCarModel(0x32cd32);
                    scene.add(mesh);
                    this.entities.set(b.id, {
                        mesh, target: { x:b.x, z:b.z, angle:b.angle },
                        current: { x:b.x, z:b.z, angle:b.angle },
                        lastUpdate: performance.now()
                    });
                } else {
                    const e = this.entities.get(b.id);
                    e.target = { x:b.x, z:b.z, angle:b.angle };
                    e.lastUpdate = performance.now();
                }
            });
        });
        socket.on('race-end', () => {
            this.state = 'finished';
            sound.stopEngine();
            sound.playFinish();
            document.getElementById('messageBox').textContent = 'YARIŞ BİTTİ!';
            document.getElementById('messageBox').classList.remove('hidden');
        });
        socket.on('error', msg => alert(msg));
    }
    sendInput() {
        if (this.socket.connected) this.socket.emit('input', keys);
    }
    update(dt) {
        if (this.state !== 'racing') return;
        let a = this.predicted.angle, s = this.predicted.speed;
        if (keys.left) a -= 2.8*dt;
        if (keys.right) a += 2.8*dt;
        if (keys.up) s += 14*dt;
        else if (keys.down) s -= 20*dt;
        else s *= 0.96;
        if (s > 25) s = 25; if (s < -12) s = -12;
        this.predicted.x += Math.sin(a)*s*dt;
        this.predicted.z += Math.cos(a)*s*dt;
        this.predicted.angle = a; this.predicted.speed = s;
        playerCar.position.set(this.predicted.x, 0.1, this.predicted.z);
        playerCar.rotation.y = this.predicted.angle;
        updateCamera(playerCar.position, this.predicted.angle);
        sound.updateEngine(s, 25);
        const now = performance.now();
        this.entities.forEach(e => {
            const t = Math.min((now - e.lastUpdate)/50, 1);
            e.current.x += (e.target.x - e.current.x)*t;
            e.current.z += (e.target.z - e.current.z)*t;
            e.current.angle += (e.target.angle - e.current.angle)*t;
            e.mesh.position.set(e.current.x, 0.1, e.current.z);
            e.mesh.rotation.y = e.current.angle;
        });
        const me = this.serverState?.players?.find(p => p.id === this.myId);
        if (me) {
            document.getElementById('lapCounter').textContent = `Tur: ${me.lap}/3`;
            document.getElementById('speedometer').textContent = `${Math.abs(me.speed*3.6).toFixed(0)} km/h`;
        }
    }
}

// Menü butonları
document.getElementById('singlePlayerBtn').onclick = () => {
    sound.init();
    socket = io();
    networkGame = new NetworkGame(socket);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('create-room', 'Oyuncu');
    animateLoop();
};
document.getElementById('multiplayerBtn').onclick = () => document.getElementById('multiplayerPanel').classList.remove('hidden');
document.getElementById('createRoomBtn').onclick = () => {
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
};
document.getElementById('joinRoomBtn').onclick = () => {
    sound.init();
    const name = document.getElementById('playerNameInput').value.trim() || 'Oyuncu 2';
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) return alert('Oda ID girin');
    socket = io();
    networkGame = new NetworkGame(socket);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    if ('ontouchstart' in window) document.getElementById('touchControls').classList.remove('hidden');
    gameMode = 'multiplayer';
    socket.emit('join-room', { roomId, playerName: name });
    animateLoop();
};
document.getElementById('startRaceBtn').onclick = () => {
    if (networkGame) networkGame.socket.emit('start-race');
};

let lastFrame = performance.now();
function animateLoop() {
    requestAnimationFrame(animateLoop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame)/1000);
    lastFrame = now;
    if (networkGame) networkGame.update(dt);
    renderer.render(scene, camera);
}
window.onresize = () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
};