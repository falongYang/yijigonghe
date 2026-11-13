/* 3D 世界层（RTS 版）：起伏地面 + 散布细节道具 + 阴影光照 + 可平移/缩放/旋转相机
 * + 单位与建筑网格的增删与每帧同步 + 血条/选择环 + 攻击/死亡/采集等粒子特效
 * + 屏幕→地面与实体拾取。坐标：Y-up，地面 y=0，X-Z 为战场平面。
 */
import * as THREE from 'three';
import {
  MAP, HALF_W, HALF_H, BUILDINGS, SIDES, SKIRMISH_MAP, UNITS, RESOURCES,
  terrainNoise as noise2, terrainHeight, TERRAIN, mapZones, mapWells, mapObstacles, zoneAt,
} from './rts.js';
import { ERAS } from './data.js';
import { FX_BUILDERS } from './fx.js';
import { buildAntGeometry, buildBuildingGeometry } from './ants.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UNIT_HEIGHT = { worker: 5.0, soldier: 6.2, soldier2: 6.0, soldier3: 7.6, queen: 9.0 };
const RING_R = { worker: 2.6, soldier: 3.2, soldier2: 3.0, soldier3: 4.0, queen: 5.0 };
// 昼夜循环：入夜时太阳偏冷蓝、背景趋近深蓝夜空
const NIGHT_SUN = new THREE.Color(0x9fb6ff);
const NIGHT_BG = new THREE.Color(0x0b1422);

/* 生物群系专属道具：每套地图配置引用若干 type，world 据此散布装饰，强化地形辨识。*/
const PROP_BUILDERS = {
  bush(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.moss).lerp(new THREE.Color(pal.mid), 0.2), roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), m);
      s.position.set((Math.random() - 0.5) * 1.4, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4);
      s.scale.set(1, 0.9, 1); g.add(s);
    }
    return g;
  },
  flower(pal) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 1 }));
    stem.position.y = 1.2; g.add(stem);
    const col = [0xffd27f, 0xff9ec4, 0xfff0a0, 0xc9b3ff][Math.floor(Math.random() * 4)];
    const pet = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, emissive: new THREE.Color(col), emissiveIntensity: 0.15 }));
    pet.position.y = 2.4; pet.scale.set(1, 0.6, 1); g.add(pet);
    return g;
  },
  sapling(pal) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 }));
    trunk.position.y = 1.6; g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.moss), roughness: 1 }));
    canopy.position.y = 3.8; g.add(canopy);
    return g;
  },
  cactus(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x4e7a4a, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 3.4, 8), m); body.position.y = 1.7; g.add(body);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.4, 6), m); arm.position.set(s * 0.9, 2.0, 0); arm.rotation.z = s * 0.9; g.add(arm);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 1.0, 6), m); up.position.set(s * 1.3, 2.8, 0); g.add(up);
    }
    return g;
  },
  boulder(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.low).lerp(new THREE.Color(0xffffff), 0.1), roughness: 1 });
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), m); r.position.y = 1.0; r.scale.set(1, 0.8, 1); g.add(r);
    return g;
  },
  skull(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), m); head.position.y = 1.0; head.scale.set(1, 1.1, 1.1); g.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.8), m); jaw.position.set(0, 0.4, 0.2); g.add(jaw);
    return g;
  },
  charlog(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 4.0, 7), m); log.rotation.z = Math.PI / 2; log.position.y = 0.6; g.add(log);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff5a1a, emissiveIntensity: 0.6 }));
    ember.position.set(0, 0.5, 0.5); g.add(ember);
    return g;
  },
  scrub(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.mid).lerp(new THREE.Color(pal.low), 0.3), roughness: 1 });
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 4), m); b.position.set((Math.random() - 0.5) * 0.8, 0.8, (Math.random() - 0.5) * 0.8); b.rotation.z = (Math.random() - 0.5) * 0.5; g.add(b); }
    return g;
  },
  reed(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x7fae5a, roughness: 1 });
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.0 + Math.random(), 5), m); b.position.set((Math.random() - 0.5) * 0.9, 1.5, (Math.random() - 0.5) * 0.9); b.rotation.z = (Math.random() - 0.5) * 0.3; g.add(b); }
    return g;
  },
  lily(pal) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 1 })); pad.position.y = 0.1; g.add(pad);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0xffd0e0, roughness: 0.8 })); fl.position.y = 0.5; g.add(fl);
    return g;
  },
  stump(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 });
    const s = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 1.6, 10), m); s.position.y = 0.8; g.add(s);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a4a })); top.position.y = 1.6; g.add(top);
    return g;
  },
  driftwood(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xb7ad97, roughness: 1 });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3.6, 7), m); log.rotation.z = Math.PI / 2.2; log.position.y = 0.5; g.add(log);
    return g;
  },
  shell(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xe8d8c0, roughness: 0.7 });
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 10), m); s.position.y = 0.7; s.rotation.x = Math.PI; g.add(s);
    return g;
  },
  kelp(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x2f6a4a, roughness: 1 });
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.5), m); b.position.set((Math.random() - 0.5) * 0.8, 1.6, (Math.random() - 0.5) * 0.8); b.rotation.z = (Math.random() - 0.5) * 0.6; g.add(b); }
    return g;
  },
  crystal(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x9a7ad0, roughness: 0.3, metalness: 0.1, emissive: 0x6a4aa0, emissiveIntensity: 0.5 });
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 6), m); c.position.set((Math.random() - 0.5) * 1.0, 1.2, (Math.random() - 0.5) * 1.0); c.rotation.z = (Math.random() - 0.5) * 0.5; c.rotation.x = (Math.random() - 0.5) * 0.5; g.add(c); }
    return g;
  },
  shard(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x8a7ad0, roughness: 0.4, metalness: 0.2, emissive: 0x4a3a8a, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.9), m); s.position.y = 1.6; g.add(s);
    return g;
  },
  glowmoss(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x6ad0a0, emissive: 0x3aa070, emissiveIntensity: 0.6, roughness: 0.8 });
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), m); b.position.set((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 1.2); g.add(b); }
    return g;
  },
};

/* 每章大型地标：营造地图身份、提供视觉焦点（纯装饰，不阻挡寻路）。 */
const LANDMARK_BUILDERS = {
  // 焦土平原：焦黑枯树
  burnedsnag(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 11, 8), m); trunk.position.y = 5.5; g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.4, 4 + i, 5), m);
      br.position.set(Math.cos(a) * 1.2, 9 + i * 0.4, Math.sin(a) * 1.2); br.rotation.z = Math.cos(a) * 0.7; br.rotation.x = -Math.sin(a) * 0.7; g.add(br);
    }
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff4a10, emissiveIntensity: 0.7 }));
    ember.position.set(0, 1.2, 0); g.add(ember);
    return g;
  },
  // 阡陌沃野：繁茂巨树
  grandtree(pal) {
    const g = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 13, 9), bark); trunk.position.y = 6.5; g.add(trunk);
    const leaf = new THREE.Color(pal.moss);
    const lm = new THREE.MeshStandardMaterial({ color: leaf, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const r = 4 - i * 0.5, y = 11 + i * 1.6;
      const c = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), lm); c.position.y = y; c.scale.set(1, 0.7, 1); g.add(c);
    }
    return g;
  },
  // 壁垒荒原：天然石拱
  stonearch(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.low).lerp(new THREE.Color(0xffffff), 0.05), roughness: 1 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 12, 8), m); p.position.set(s * 4.5, 6, 0); p.rotation.z = s * 0.12; g.add(p);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 3.2), m); lintel.position.y = 12; g.add(lintel);
    for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + Math.random() * 0.5, 0), m); r.position.set((Math.random() - 0.5) * 11, 12.6 + Math.random(), (Math.random() - 0.5) * 2.5); g.add(r); }
    return g;
  },
  // 通津泽国：间歇泉
  geyser(pal) {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: 0x4f5a4a, roughness: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 1.0, 8, 20), rock); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; g.add(ring);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.6, 9, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.45, emissive: 0x4fb0d0, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    col.position.y = 5; g.add(col);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.4, emissive: 0x9fe0ff, emissiveIntensity: 0.5, depthWrite: false }));
    cap.position.y = 9.5; g.add(cap);
    return g;
  },
  // 怒涛海岸：斜立的浮木尖塔
  driftwoodspire(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xb7ad97, roughness: 1 });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 16, 8), m); log.position.y = 8; log.rotation.z = 0.5; g.add(log);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 7), m); top.position.set(-6.5, 15, 0); top.rotation.z = 0.5; g.add(top);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), m); r.position.set((Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 4); g.add(r); }
    return g;
  },
  // 回响虚空：发光晶柱
  crystalmonolith(pal) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x9a7ad0, roughness: 0.25, metalness: 0.15, emissive: 0x6a4aa0, emissiveIntensity: 0.6 });
    const main = new THREE.Mesh(new THREE.ConeGeometry(2.6, 20, 6), m); main.position.y = 10; main.rotation.z = 0.08; g.add(main);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.0 + Math.random() * 0.5, 7 + Math.random() * 4, 5), m);
      c.position.set(Math.cos(a) * 3.2, 3 + Math.random() * 2, Math.sin(a) * 3.2); c.rotation.z = (Math.random() - 0.5) * 0.5; g.add(c);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc7b3ff, transparent: true, opacity: 0.5, depthWrite: false }));
    glow.position.y = 18; g.add(glow);
    return g;
  },
};

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdfe6d2);
    this.scene.fog = new THREE.Fog(0xdfe6d2, 200, 460);

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 1400);

    // RTS 相机状态。zoom / rotate 只写 _camT 目标，updateCamera 每帧阻尼逼近，
    // 消除滚轮与中键旋转的机械跳变；_camLast 用于识别外部直接赋值 cam.*（开局运镜初始态）。
    this.cam = { dist: 150, yaw: Math.PI, pitch: 0.92, tx: 0, tz: 0 };
    this._camT = { dist: 150, yaw: Math.PI, pitch: 0.92 };
    this._camLast = { ...this._camT };
    this._camFocusT = null;     // 聚焦缓动目标（空格回巢 / 小地图跳转，手动平移即取消）
    this.keys = Object.create(null);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.time = 0;
    this._shake = 0;            // 摄像机冲击震屏当前幅度（世界单位），随时间指数衰减
    this.playerSp = null; this.enemySp = null;
    this.era = 0;
    this._dayT = 30;            // 开局从清晨开始，避免直接深夜
    this._dayPeriod = 200;      // 整局昼夜循环周期（秒）
    this.dayFactor = 1; this.dayPhase = '白昼'; this.dayIcon = '☀';

    this.unitMeshes = new Map();
    this.buildingMeshes = new Map();
    this.pickables = [];
    this.obstacleMeshes = new Map();        // id -> { mesh, kind } 战术掩体
    this.fx = [];
    this.hazardMeshes = [];      // 地面危险区可视化（酸池/毒雾/涡卷等）
    this.terrainHazardMeshes = [];  // 静态危害地块（章节配置的熔岩/酸池），常驻地面呈现
    this.rallyMeshes = new Map(); // 集结旗标（按建筑 id）
    this.hazardGeo = new THREE.CircleGeometry(1, 30);
    this._thzRingGeo = new THREE.RingGeometry(0.86, 1.0, 32);  // 静态危害描边环（共享几何）
    this.intro = null;           // 战斗入场运镜
    this._footAcc = 0;
    // 镜头跟随
    this.follow = false; this._followX = null; this._followZ = null;
    // 指令路径线（复用对象池）
    this.orderGroup = new THREE.Group(); this.scene.add(this.orderGroup);
    this.orderLines = []; this.orderMarks = [];
    // 受损冒烟 / 性能自适应
    this._smokeAcc = 0;
    this._quality = 2; this._qualityAuto = true; this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this._goodFrames = 0; this._lastFrameT = null;
    // 屏幕边缘滚屏（鼠标贴近视口边缘自动平移镜头）
    this.edge = { x: 0, y: 0, active: false };
    this.edgePan = true;
    // 纪元环境色平滑过渡
    this._eraFade = null; this._eraFrom = null; this._eraTo = null;
    this._antGeoCache = new Map();
    this._bGeoCache = new Map();
    this._antMat = {};
    this._bMat = {};
    this.scatterGroup = new THREE.Group();
    this.waterGroup = new THREE.Group();
    this.nodeGroup = new THREE.Group();
    this.terrainGroup = new THREE.Group();   // 蚁道 / 巢区领地环 / 边界岩脊
    this.zoneGroup = new THREE.Group();      // 战术地形区（高台 / 泥沼 / 浅滩）
    this.wellGroup = new THREE.Group();      // 中立信息素井
    this.zoneVisuals = [];
    this.wellVisuals = [];
    this.nodeMeshes = new Map();
    this.nodeDeco = new Map();               // 资源点装饰（归属环 / 发光体）
    this.claimRings = [];
    this.waterRipples = [];
    this.pings = [];                         // 战术标记（Alt + 左键）
    this.mapCfg = null;
    this.waterDiscs = [];
    this.baseBg = new THREE.Color(0xdfe6d2);
    // 复眼：所有单位共享的深色发光眼点几何 / 材质（spawnUnit 依 geo.userData.eyes 叠加）
    this._eyeGeo = new THREE.SphereGeometry(1, 10, 8);
    this._eyeMat = new THREE.MeshStandardMaterial({ color: 0x10120e, roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(0x223018), emissiveIntensity: 0.35 });
    // 翅膀：飞行蚁专用、可独立扇动的半透明膜翅（spawnUnit 叠加于 body）
    this._wingGeo = new THREE.SphereGeometry(1, 14, 8);
    this._wingMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.30, side: THREE.DoubleSide, emissive: new THREE.Color(0x2a3a4a), emissiveIntensity: 0.25, depthWrite: false });
    // 地图装饰（生物群系专属道具）与天气粒子层
    this.propGroup = new THREE.Group();
    this.weatherGroup = new THREE.Group();
    // 地面斑块（按地图配色软化大面积地面的生物群系感）与每章大型地标
    this.decalGroup = new THREE.Group();
    this.landmarkGroup = new THREE.Group();
    // 战术坐标网格：贴地细线 / 主线 / 中轴基准线，随镜头拉近渐清晰
    this.gridGroup = new THREE.Group();
    this._gridLayers = null;
    // 鼠标拖拽平移中：暂停屏幕边缘滚屏，避免两种平移叠加导致镜头漂移
    this.dragPan = false;
    this.weatherPts = null; this._weatherVel = []; this._weatherCfg = null;
    // 死亡演出：sim 已移除单位后，本体再播放约 0.5s 倒地 / 下沉 / 淡出再释放
    this._dying = new Map();
    // 贴地软阴影（共享几何，每个单位独立克隆低成本的半透圆盘，飞行蚁随高度放大淡出）
    this._shadowGeo = new THREE.CircleGeometry(1, 20);

    this._buildLights();
    this._buildTerrain();
    this.scene.add(this.scatterGroup);
    this.scene.add(this.waterGroup);
    this.scene.add(this.nodeGroup);
    this.scene.add(this.terrainGroup);
    this.scene.add(this.zoneGroup);
    this.scene.add(this.wellGroup);
    this.scene.add(this.propGroup);
    this.scene.add(this.weatherGroup);
    this.scene.add(this.decalGroup);
    this.scene.add(this.landmarkGroup);
    this.scene.add(this.gridGroup);
    this._buildScatter();
    this._buildCursor();
    this._initBar();
    this._buildSky();
    this._buildHills();
    this._buildDust();
    this.updateCamera(0);
    this.resize();
  }

  // ---------------------------------------------------------------- 灯光
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xeaf2dd, 0x6b6450, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe9c2, 1.9);
    this.sun.position.set(120, 180, 90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 150;
    this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s; this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 520;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    this.rim = new THREE.DirectionalLight(0xbcd0d8, 0.4);
    this.rim.position.set(-90, 60, -80);
    this.scene.add(this.rim);
  }

  // ---------------------------------------------------------------- 地面
  _buildTerrain() {
    const segX = 96, segZ = 70;
    const geo = new THREE.PlaneGeometry(MAP.W, MAP.H, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cLow = new THREE.Color(0x6e6647);
    const cMid = new THREE.Color(0x8a7f56);
    const cHigh = new THREE.Color(0x9fa86a);
    const cMoss = new THREE.Color(0x6f8f4e);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = noise2(x, z);
      pos.setY(i, terrainHeight(x, z));
      const t = clamp((n + 1.4) / 2.8, 0, 1);
      const c = cLow.clone().lerp(cMid, t).lerp(cHigh, Math.max(0, t - 0.5) * 2);
      // 低洼处苔斑
      if (n < -0.5 && Math.random() < 0.5) c.lerp(cMoss, 0.5);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.ground = mesh;
    // 不可见拾取平面（命令用，避免被起伏影响）
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP.W, MAP.H),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);
  }

  _buildScatter() { this._rebuildScatter(SKIRMISH_MAP); }

  // 依据地图配置重建散布细节（密度/配色随章节地形变化）
  _rebuildScatter(cfg) {
    for (const c of [...this.scatterGroup.children]) {
      this.scatterGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const sc = cfg.scatter;
    const d = new THREE.Object3D();
    const grassColor = new THREE.Color(cfg.pal.moss).lerp(new THREE.Color(cfg.pal.mid), 0.35);
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.18, 1.6, 4).translate(0, 0.8, 0),
      new THREE.MeshStandardMaterial({ color: grassColor, roughness: 1 }), sc.grass);
    grass.receiveShadow = true;
    for (let i = 0; i < sc.grass; i++) {
      const x = (Math.random() - 0.5) * MAP.W * 0.96, z = (Math.random() - 0.5) * MAP.H * 0.96;
      const s = 0.7 + Math.random() * 1.4;
      d.position.set(x, noise2(x, z) * 2.4 + 0.2, z);
      d.rotation.y = Math.random() * 6.28;
      d.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
      d.updateMatrix(); grass.setMatrixAt(i, d.matrix);
    }
    this.scatterGroup.add(grass);

    const pebColor = new THREE.Color(cfg.pal.low).lerp(new THREE.Color(0xffffff), 0.25);
    const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0),
      new THREE.MeshStandardMaterial({ color: pebColor, roughness: 0.95 }), sc.peb);
    pebbles.castShadow = true; pebbles.receiveShadow = true;
    for (let i = 0; i < sc.peb; i++) {
      const x = (Math.random() - 0.5) * MAP.W * 0.95, z = (Math.random() - 0.5) * MAP.H * 0.95;
      const s = 0.4 + Math.random() * 1.3;
      d.position.set(x, noise2(x, z) * 2.4 + s * 0.3, z);
      d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.scale.setScalar(s); d.updateMatrix(); pebbles.setMatrixAt(i, d.matrix);
    }
    this.scatterGroup.add(pebbles);

    const twigMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.pal.low).lerp(new THREE.Color(0x000000), 0.2), roughness: 1 });
    for (let i = 0; i < sc.twig; i++) {
      const x = (Math.random() - 0.5) * MAP.W * 0.9, z = (Math.random() - 0.5) * MAP.H * 0.9;
      const len = 4 + Math.random() * 7;
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, len, 6), twigMat);
      tw.position.set(x, noise2(x, z) * 2.4 + 0.3, z);
      tw.rotation.set(Math.PI / 2, Math.random() * 6.28, (Math.random() - 0.5) * 0.4);
      tw.castShadow = true; tw.receiveShadow = true;
      this.scatterGroup.add(tw);
    }

    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.pal.low).lerp(new THREE.Color(0xffffff), 0.1), roughness: 1 });
    for (let i = 0; i < sc.rock; i++) {
      const a = (i / Math.max(1, sc.rock)) * Math.PI * 2;
      const x = Math.cos(a) * (HALF_W + 8), z = Math.sin(a) * (HALF_H + 6);
      const r = 6 + Math.random() * 8;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
      rock.position.set(x, r * 0.3, z);
      rock.castShadow = true; rock.receiveShadow = true;
      this.scatterGroup.add(rock);
    }
  }

  // 依据地图配置重建生物群系专属道具（不同章节地形各有植被 / 遗迹 / 晶石）
  _rebuildProps(cfg) {
    for (const c of [...this.propGroup.children]) {
      this.propGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const list = cfg.props || [];
    const pal = cfg.pal;
    // 道具避让：不落在水心、不压住双方巢区、不堵资源点，避免"漂浮道具/挡巢"的观感
    const water = (cfg.water || []).map(w => ({ x: w.x, z: w.z, r: w.r }));
    const bases = [{ x: 0, z: HALF_H * 0.62 }, { x: 0, z: -HALF_H * 0.62 }];
    const nodes = cfg.nodes || [];
    const clear = (x, z) => {
      if (Math.abs(x) > HALF_W - 4 || Math.abs(z) > HALF_H - 4) return false;
      for (const w of water) if (Math.hypot(x - w.x, z - w.z) < w.r * 0.92 + 3) return false;
      for (const b of bases) if (Math.hypot(x - b.x, z - b.z) < 19) return false;
      for (const n of nodes) if (Math.hypot(x - n.x, z - n.z) < 5) return false;
      return true;
    };
    const posFor = () => {
      for (let k = 0; k < 18; k++) {
        const x = (Math.random() - 0.5) * MAP.W * 0.94, z = (Math.random() - 0.5) * MAP.H * 0.94;
        if (clear(x, z)) return [x, z];
      }
      return null;
    };
    for (const item of list) {
      const make = PROP_BUILDERS[item.type];
      if (!make) continue;
      const n = item.count || 0; if (!n) continue;
      const proto = make(pal);
      for (let i = 0; i < n; i++) {
        const p = posFor(); if (!p) continue;
        const [x, z] = p;
        const o = proto.clone(true);
        o.position.set(x, noise2(x, z) * 2.4, z);
        o.rotation.y = Math.random() * 6.28;
        const s = 0.8 + Math.random() * 0.7; o.scale.setScalar(s);
        o.traverse(nd => { if (nd.isMesh) { nd.castShadow = true; nd.receiveShadow = true; } });
        this.propGroup.add(o);
      }
    }
  }

  // 依据地图配置重建天气粒子层（焦土扬尘 / 沃野花粉 / 泽国孢子 / 海岸雾霭 / 虚空余烬）
  _rebuildWeather(cfg) {
    if (this.weatherPts) {
      this.weatherGroup.remove(this.weatherPts);
      this.weatherPts.geometry.dispose(); this.weatherPts.material.dispose();
      this.weatherPts = null;
    }
    const w = cfg.weather || 'none';
    const W = ({
      none:   { n: 0,   color: 0xffffff, op: 0.00, size: 2.0, add: false, y: [2, 30], spread: 0.2 },
      dust:   { n: 220, color: 0xd8c8a0, op: 0.32, size: 1.8, add: false, y: [1, 34], spread: 0.5 },
      pollen: { n: 200, color: 0xffe08a, op: 0.42, size: 1.6, add: true,  y: [2, 30], spread: 0.4 },
      spores: { n: 240, color: 0x9fe06a, op: 0.38, size: 1.7, add: true,  y: [1, 32], spread: 0.5 },
      mist:   { n: 160, color: 0xcfe2f0, op: 0.26, size: 4.5, add: false, y: [1, 26], spread: 0.2 },
      embers: { n: 180, color: 0xff8a4a, op: 0.5,  size: 1.9, add: true,  y: [1, 40], spread: 0.6 },
    })[w] || { n: 0, color: 0xffffff, op: 0, size: 2, add: false, y: [2, 30], spread: 0.3 };
    this._weatherCfg = W;
    if (!W.n) return;
    const N = W.n, pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * MAP.W * 1.1;
      pos[i * 3 + 1] = W.y[0] + Math.random() * (W.y[1] - W.y[0]);
      pos[i * 3 + 2] = (Math.random() - 0.5) * MAP.H * 1.1;
      vel.push({ x: (Math.random() - 0.5) * W.spread, y: 0.3 + Math.random() * 1.2, z: (Math.random() - 0.5) * W.spread });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: W.size, map: this._dustTex(), transparent: true, depthWrite: false, opacity: W.op, color: W.color, blending: W.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    this.weatherPts = new THREE.Points(g, m);
    this.weatherPts.frustumCulled = false;
    this._weatherVel = vel;
    this.weatherGroup.add(this.weatherPts);
  }
  _updateWeather(dt) {
    if (!this.weatherPts || !this._weatherCfg) return;
    const W = this._weatherCfg, p = this.weatherPts.geometry.attributes.position.array, vel = this._weatherVel, t = this.time;
    for (let i = 0; i < vel.length; i++) {
      const v = vel[i];
      p[i * 3] += v.x * dt + Math.sin(t * 0.5 + i) * 0.02;
      p[i * 3 + 1] += v.y * dt;
      p[i * 3 + 2] += v.z * dt;
      if (p[i * 3 + 1] > W.y[1]) { p[i * 3 + 1] = W.y[0]; p[i * 3] = (Math.random() - 0.5) * MAP.W * 1.1; p[i * 3 + 2] = (Math.random() - 0.5) * MAP.H * 1.1; }
    }
    this.weatherPts.geometry.attributes.position.needsUpdate = true;
    this.weatherPts.rotation.y = t * 0.01;
  }

  /** 地面斑块：按地图配色在地面散布若干柔性圆盘，软化大面积纯色地面、强化生物群系辨识。
   *  焦土用焦黑灼痕、泽国/海岸用浅色湿斑、虚空用发光苔斑，其余用苔绿/土色斑。 */
  _rebuildDecals(cfg) {
    for (const c of [...this.decalGroup.children]) {
      this.decalGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const pal = cfg.pal;
    const water = (cfg.water || []).map(w => ({ x: w.x, z: w.z, r: w.r }));
    const bases = [{ x: 0, z: HALF_H * 0.62 }, { x: 0, z: -HALF_H * 0.62 }];
    const clear = (x, z, pad) => {
      if (Math.abs(x) > HALF_W - 6 || Math.abs(z) > HALF_H - 6) return false;
      for (const w of water) if (Math.hypot(x - w.x, z - w.z) < w.r + pad) return false;
      for (const b of bases) if (Math.hypot(x - b.x, z - b.z) < 18 + pad) return false;
      return true;
    };
    // 配色：依主题挑两种斑块色（深/浅），焦土偏黑、虚空偏紫
    const tag = cfg.tag || '';
    const dark = tag.includes('焦土') ? 0x2a2118
      : tag.includes('虚空') ? 0x2a2440
      : new THREE.Color(pal.low).lerp(new THREE.Color(0x000000), 0.15).getHex();
    const lite = tag.includes('泽国') || tag.includes('海岸') ? 0xbfd6c0
      : tag.includes('虚空') ? 0x4a3a66
      : new THREE.Color(pal.moss).getHex();
    const spec = [
      { col: dark, n: 9, r: [10, 22], op: 0.42 },
      { col: lite, n: 7, r: [6, 14], op: 0.32 },
    ];
    if (tag.includes('虚空')) { spec.push({ col: 0x6a5a9a, n: 5, r: [3, 6], op: 0.55, glow: 0.6 }); }
    // 贴地斑块几何：顶点按战场高度函数起伏，避免「圆盘半埋进坡里」和 Z-fighting
    const patchGeo = (rad, cx, cz) => {
      const seg = 26, rings = 3, base = this._groundY(cx, cz);
      const p = [0, 0.16, 0], idx = [];
      for (let r = 1; r <= rings; r++) {
        const rr = rad * r / rings;
        for (let s = 0; s < seg; s++) {
          const a = s / seg * Math.PI * 2;
          const vx = Math.cos(a) * rr, vz = Math.sin(a) * rr;
          p.push(vx, this._groundY(cx + vx, cz + vz) - base + 0.16, vz);
        }
      }
      for (let s = 0; s < seg; s++) idx.push(0, 1 + (s + 1) % seg, 1 + s);
      for (let r = 1; r < rings; r++) {
        const a0 = 1 + (r - 1) * seg, b0 = 1 + r * seg;
        for (let s = 0; s < seg; s++) {
          const sn = (s + 1) % seg;
          idx.push(a0 + s, b0 + sn, b0 + s, a0 + s, a0 + sn, b0 + sn);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    };
    for (const s of spec) {
      for (let i = 0; i < s.n; i++) {
        let x = 0, z = 0, ok = false;
        for (let k = 0; k < 16 && !ok; k++) { x = (Math.random() - 0.5) * MAP.W * 0.92; z = (Math.random() - 0.5) * MAP.H * 0.92; ok = clear(x, z, 4); }
        if (!ok) continue;
        const r = s.r[0] + Math.random() * (s.r[1] - s.r[0]);
        const mat = new THREE.MeshStandardMaterial({ color: s.col, roughness: 1, metalness: 0,
          transparent: true, opacity: s.op, depthWrite: false, side: THREE.DoubleSide,
          emissive: s.glow ? new THREE.Color(s.col) : new THREE.Color(0x000000), emissiveIntensity: s.glow || 0 });
        const m = new THREE.Mesh(patchGeo(r, x, z), mat);
        m.position.set(x, this._groundY(x, z), z);
        m.receiveShadow = true;
        this.decalGroup.add(m);
      }
    }
  }

  /** 每章大型地标：一眼可辨的地图身份物（枯树/巨树/石拱/间歇泉/浮木尖塔/晶柱）。 */
  _rebuildLandmark(cfg) {
    for (const c of [...this.landmarkGroup.children]) {
      this.landmarkGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const type = cfg.landmark;
    const make = LANDMARK_BUILDERS[type];
    if (!make) return;
    // 用地图名做确定性哈希，挑选一个不压巢区/不压中轴的角落放置
    let h = 2166136261; for (const ch of String(cfg.name || 'x')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const corners = [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    const c = corners[h >>> 0 & 3];
    const x = c[0] * HALF_W, z = c[1] * HALF_H;
    const g = make(cfg.pal);
    g.position.set(x, this._groundY(x, z), z);
    g.rotation.y = (h % 1000) / 1000 * 6.28;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.landmarkGroup.add(g);
  }

  /** 战术坐标网格：贴地细线（每 20 单位）+ 每 5 格主线 + 中轴 / 巢区基准线 + 边缘刻度。
   *  分段采样地面高度函数，避免直线穿进起伏坡面；三层各用一个 LineSegments，开销极低。
   *  拉近镜头时更清晰、拉远自动淡出，不干扰远观的整体画面。 */
  _rebuildGrid(cfg) {
    for (const c of [...this.gridGroup.children]) {
      this.gridGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    this._gridLayers = null;
    const step = 20, LIFT = 0.24;
    const minor = [], major = [], axis = [];
    const put = (arr, x1, z1, x2, z2) => {
      const seg = 6;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg, a1 = (i + 1) / seg;
        const ax = x1 + (x2 - x1) * a0, az = z1 + (z2 - z1) * a0;
        const bx = x1 + (x2 - x1) * a1, bz = z1 + (z2 - z1) * a1;
        arr.push(ax, this._groundY(ax, az) + LIFT, az, bx, this._groundY(bx, bz) + LIFT, bz);
      }
    };
    const x0 = -HALF_W, x1 = HALF_W, z0 = -HALF_H, z1 = HALF_H;
    const xs = Math.floor(HALF_W / step) * step, zs = Math.floor(HALF_H / step) * step;
    for (let x = -xs; x <= xs; x += step) {
      const target = (x % (step * 5) === 0) ? major : minor;
      put(target, x, z0, x, z1);
    }
    for (let z = -zs; z <= zs; z += step) {
      const target = (z % (step * 5) === 0) ? major : minor;
      put(target, x0, z, x1, z);
    }
    // 中轴十字：双方巢区连线与左右分界，作为行军 / 报点的战术参照
    put(axis, 0, z0, 0, z1);
    put(axis, x0, 0, x1, 0);
    // 四边短刻度，形成「地图坐标尺」的观感
    for (let x = -xs; x <= xs; x += step) {
      put(major, x, z0, x, z0 + 2.8); put(major, x, z1, x, z1 - 2.8);
    }
    for (let z = -zs; z <= zs; z += step) {
      put(major, x0, z, x0 + 2.8, z); put(major, x1, z, x1 - 2.8, z);
    }
    const base = new THREE.Color(cfg.pal.high).lerp(new THREE.Color(0xffffff), 0.55);
    const mk = (arr, color, opacity) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const line = new THREE.LineSegments(geo, mat);
      line.frustumCulled = false;
      this.gridGroup.add(line);
      return { line, opacity };
    };
    this._gridLayers = [
      mk(minor, base, 0.13),
      mk(major, base, 0.30),
      mk(axis, new THREE.Color(cfg.pal.moss).lerp(new THREE.Color(0xffffff), 0.4), 0.26),
    ];
  }

  _updateGridFade() {
    if (!this._gridLayers) return;
    const k = clamp((215 - this.cam.dist) / 115, 0.22, 1);
    for (const l of this._gridLayers) l.line.material.opacity = l.opacity * k;
    this.gridGroup.visible = this.cam.dist < 238;
  }


  _buildCursor() {
    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.3, 36),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    // 建造占地幽灵盘：与准星环叠加，用颜色表示可否放置
    this.buildPreview = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x9fe0c8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.buildPreview.rotation.x = -Math.PI / 2;
    this.buildPreview.position.y = 0.26;
    this.buildPreview.visible = false;
    this.scene.add(this.buildPreview);
  }

  _initBar() {
    this.barBgGeo = new THREE.PlaneGeometry(3.0, 0.42);
    this.barFillGeo = new THREE.PlaneGeometry(3.0, 0.42);
    this.ringGeo = new THREE.RingGeometry(2.4, 3.0, 32);
  }

  // ---------------------------------------------------------------- 品种/纪元
  setSides(playerSp, enemySp) {
    this.playerSp = playerSp; this.enemySp = enemySp;
    this._antMat[SIDES.PLAYER] = new THREE.MeshStandardMaterial({ color: new THREE.Color(playerSp.color), roughness: 0.5, metalness: 0.16 });
    this._antMat[SIDES.ENEMY] = new THREE.MeshStandardMaterial({ color: new THREE.Color(enemySp.color), roughness: 0.5, metalness: 0.16 });
    const pt = new THREE.Color(playerSp.glow).lerp(new THREE.Color(0x9fe0c8), 0.4);
    const et = new THREE.Color(enemySp.glow).lerp(new THREE.Color(0xff9b6b), 0.4);
    this._bMat[SIDES.PLAYER] = { tint: pt };
    this._bMat[SIDES.ENEMY] = { tint: et };
  }

  /** 切换纪元主题色：默认 1.8s 平滑过渡，开局可用 instant 立即到位。最终颜色由 _tickDayNight 叠加昼夜因子后落地。 */
  setEra(era, instant = false) {
    this.era = era;
    const c = new THREE.Color(ERAS[era].hex);
    this._eraTo = {
      sun: new THREE.Color(0xffe9c2).lerp(c, 0.22),
      hemi: new THREE.Color(0xeaf2dd).lerp(c, 0.10),
      bg: (this.baseBg || new THREE.Color(0xdfe6d2)).clone().lerp(c, 0.12),
    };
    if (instant) { this._eraFade = null; this._applyEraColors(1); this._tickDayNight(0); return; }
    this._eraFrom = {
      sun: this.sun.color.clone(),
      hemi: this.hemi.color.clone(),
      bg: (this.scene.background || this._eraTo.bg).clone(),
    };
    this._eraFade = { t: 0, dur: 1.8 };
  }
  _applyEraColors(k) {
    const to = this._eraTo;
    if (!to) return;
    const from = this._eraFrom;
    const mix = (f, t) => from ? f.clone().lerp(t, k) : t.clone();
    this._eraBase = {
      sun: mix(from && from.sun, to.sun),
      hemi: mix(from && from.hemi, to.hemi),
      bg: mix(from && from.bg, to.bg),
    };
  }
  _tickEraFade(dt) {
    if (!this._eraFade || dt <= 0) return;
    this._eraFade.t += dt;
    const k = clamp(this._eraFade.t / this._eraFade.dur, 0, 1);
    this._applyEraColors(k);
    if (k >= 1) this._eraFade = null;
  }

  /** 昼夜循环：整局以约 200s 为周期缓慢推移光环境与天色，叠加在纪元主题色之上。 */
  _tickDayNight(dt) {
    if (!this._eraBase) return;
    if (dt > 0) this._dayT = (this._dayT + dt) % this._dayPeriod;
    const theta = (this._dayT / this._dayPeriod) * Math.PI * 2;
    const f = 0.5 - 0.5 * Math.cos(theta);          // 0 深夜 .. 1 正午
    const b = this._eraBase;
    this.sun.color.copy(b.sun).lerp(NIGHT_SUN, (1 - f) * 0.6);
    this.sun.intensity = 1.9 * (0.22 + 0.78 * f);
    this.hemi.color.copy(b.hemi);
    this.hemi.intensity = 0.95 * (0.42 + 0.58 * f);
    const bg = b.bg.clone().lerp(NIGHT_BG, (1 - f) * 0.82);
    this.scene.background = bg;
    this.scene.fog.color.copy(bg);
    this._applySky(bg);
    this.dayFactor = 0.16 + 0.84 * f;
    const ph = f < 0.12 ? ['🌑', '深夜'] : f < 0.30 ? ['🌅', '黎明'] : f < 0.66 ? ['☀', '白昼'] : f < 0.86 ? ['🌇', '黄昏'] : ['🌙', '夜晚'];
    this.dayIcon = ph[0]; this.dayPhase = ph[1];
  }

  // ---------------------------------------------------------------- 地图（六章差异化战场）
  _recolorTerrain(cfg) {
    const geo = this.ground.geometry;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const cLow = new THREE.Color(cfg.pal.low), cMid = new THREE.Color(cfg.pal.mid);
    const cHigh = new THREE.Color(cfg.pal.high), cMoss = new THREE.Color(cfg.pal.moss);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = noise2(x, z);
      const t = clamp((n + 1.4) / 2.8, 0, 1);
      const cc = cLow.clone().lerp(cMid, t).lerp(cHigh, Math.max(0, t - 0.5) * 2);
      if (n < -0.5 && Math.random() < 0.5) cc.lerp(cMoss, 0.5);
      col.setXYZ(i, cc.r, cc.g, cc.b);
    }
    col.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /** 载入一套战场地图配置：配色 / 雾 / 散布 / 水域。 */
  loadMap(cfg) {
    if (!cfg) return;
    this.mapCfg = cfg;
    this.baseBg = new THREE.Color(cfg.bg);
    this.scene.fog.near = cfg.fog[0];
    this.scene.fog.far = cfg.fog[1];
    this._recolorTerrain(cfg);
    this._rebuildScatter(cfg);
    this._rebuildProps(cfg);
    this._rebuildDecals(cfg);
    this._rebuildLandmark(cfg);
    this._rebuildGrid(cfg);
    this._rebuildPaths(cfg);
    this._rebuildWater(cfg);
    this._zones = mapZones(cfg); this._rebuildZones(this._zones);
    this._rebuildWells(mapWells(cfg));
    this._rebuildObstacles(mapObstacles(cfg));
    this._rebuildWeather(cfg);
    this._applySky(this.baseBg);
    this._dayT = 30;           // 每场战斗重置为清晨
    if (this._onMapName) this._onMapName(cfg);
  }

  /** 地面高度：直接取配置层的唯一真源，保证与 sim 坡度判定、小地图底图完全一致。 */
  _groundY(x, z) { return terrainHeight(x, z); }

  /** 按地图配置重建：巢区→资源点的贴地蚁道、双方领地环、边界岩脊。 */
  _rebuildPaths(cfg) {
    for (const c of [...this.terrainGroup.children]) {
      this.terrainGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.claimRings = [];
    const bases = [
      { x: 0, z: HALF_H * 0.62, color: 0x7ef0a0 },
      { x: 0, z: -HALF_H * 0.62, color: 0xffb070 },
    ];
    const pathCol = new THREE.Color(cfg.pal.high).lerp(new THREE.Color(0xffffff), 0.28);

    // 1) 蚁道：每个资源点由最近巢区引出一条随地形起伏的弯曲小径
    for (const n of cfg.nodes) {
      let base = bases[0], bd = Infinity;
      for (const b of bases) {
        const d = Math.hypot(n.x - b.x, n.z - b.z);
        if (d < bd) { bd = d; base = b; }
      }
      const dx = n.x - base.x, dz = n.z - base.z, len = Math.hypot(dx, dz) || 1;
      const bend = Math.sin(n.x * 0.07 + n.z * 0.11) * 9;
      const steps = 20, width = 1.35;
      const at = j => {
        const t = j / steps, s = Math.sin(Math.PI * t);
        return { x: base.x + dx * t + (-dz / len) * s * bend, z: base.z + dz * t + (dx / len) * s * bend };
      };
      const verts = [], cols = [], idx = [];
      for (let i = 0; i <= steps; i++) {
        const p = at(i), a = at(Math.max(0, i - 1)), b2 = at(Math.min(steps, i + 1));
        const tx = b2.x - a.x, tz = b2.z - a.z, tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl;
        for (const side of [-1, 1]) {
          const x = p.x + nx * width * side, z = p.z + nz * width * side;
          verts.push(x, this._groundY(x, z) + 0.18, z);
          cols.push(pathCol.r, pathCol.g, pathCol.b);
        }
        if (i < steps) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const path = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      path.renderOrder = 1;
      this.terrainGroup.add(path);
    }

    // 2) 巢区领地环（阵营色，缓慢脉动）
    for (const b of bases) {
      for (const [ri, ro, op] of [[11.2, 12.4, 0.28], [15.6, 16.0, 0.14]]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 48),
          new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(b.x, this._groundY(b.x, b.z) + 0.3, b.z);
        ring.renderOrder = 2;
        this.terrainGroup.add(ring);
        this.claimRings.push(ring);
      }
    }

    // 3) 边界岩脊：一圈低矮碎岩收住地图边缘
    const N = 72;
    const ridge = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.pal.low).multiplyScalar(0.78), roughness: 1, flatShading: true }), N);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rx = HALF_W + 2.4 + Math.random() * 3.2, rz = HALF_H + 2.4 + Math.random() * 3.2;
      const rr = 1.8 + Math.random() * 2.8;
      d.position.set(Math.cos(a) * rx, rr * 0.34, Math.sin(a) * rz);
      d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.scale.set(rr, rr * 0.5, rr);
      d.updateMatrix(); ridge.setMatrixAt(i, d.matrix);
    }
    ridge.receiveShadow = true;
    this.terrainGroup.add(ridge);
  }

  _rebuildWater(cfg) {
    for (const c of [...this.waterGroup.children]) {
      this.waterGroup.remove(c); c.geometry.dispose(); c.material.dispose();
    }
    this.waterDiscs = [];
    this.waterRipples = [];
    const waterCol = new THREE.Color(0x2f6f8a).lerp(new THREE.Color(cfg.pal.moss), 0.18);
    const shoreCol = new THREE.Color(cfg.pal.high).lerp(new THREE.Color(0x8fb8c8), 0.55);
    for (const w of (cfg.water || [])) {
      // 浅滩：水域外缘一圈湿痕
      const shore = new THREE.Mesh(new THREE.RingGeometry(w.r * 0.98, w.r * 1.14, 48),
        new THREE.MeshBasicMaterial({ color: shoreCol, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }));
      shore.rotation.x = -Math.PI / 2; shore.position.set(w.x, 0.28, w.z); shore.renderOrder = 1;
      this.waterGroup.add(shore);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(w.r, 40),
        new THREE.MeshStandardMaterial({ color: waterCol, roughness: 0.28, metalness: 0.12, transparent: true, opacity: 0.8,
          emissive: new THREE.Color(0x123a4a), emissiveIntensity: 0.3 }));
      disc.rotation.x = -Math.PI / 2;
      const baseY = 0.36;
      disc.position.set(w.x, baseY, w.z);
      disc.receiveShadow = true;
      this.waterGroup.add(disc);
      this.waterDiscs.push({ mesh: disc, baseY });
      // 同心波纹：由内向外扩散并淡出
      for (let j = 0; j < 2; j++) {
        const r0 = w.r * 0.62;
        const ripple = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.5, 48),
          new THREE.MeshBasicMaterial({ color: 0xbfe6f0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
        ripple.rotation.x = -Math.PI / 2; ripple.position.set(w.x, 0.42, w.z); ripple.renderOrder = 2;
        this.waterGroup.add(ripple);
        this.waterRipples.push({ mesh: ripple, phase: j * 0.5 + (w.x + w.z) * 0.01 });
      }
    }
  }

  /** 清空并释放一个装饰组（换地图 / 换局时避免几何与贴图累积）。 */
  _clearGroup(group) {
    for (const c of [...group.children]) {
      group.remove(c);
      c.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
        }
      });
    }
  }

  /** 地形标签：画布贴图 Sprite，随镜头保持朝向，标注地貌名与效果。 */
  _labelSprite(text, hex) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(10,18,10,0.76)'; g.fillRect(8, 18, 496, 60);
    g.strokeStyle = '#' + hex.toString(16).padStart(6, '0'); g.lineWidth = 3; g.strokeRect(8, 18, 496, 60);
    g.font = 'bold 32px system-ui, sans-serif'; g.fillStyle = '#f2f7e8';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 48);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(26, 4.9, 1); sp.renderOrder = 6;
    return sp;
  }

  /** 战术地形：贴地椭圆色斑（顶点跟随起伏） + 发光描边 + 地貌小装饰 + 标签。 */
  _rebuildZones(zones) {
    this._clearGroup(this.zoneGroup);
    this.zoneVisuals = [];
    for (const q of zones || []) {
      const t = TERRAIN[q.type];
      if (!t || q.type === 'water') continue;   // 浅滩由水面 + 浅滩环表现，不再叠盘
      const rings = 4, seg = 40, verts = [], idx = [];
      const rot = q.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
      const place = (lx, lz) => ({ x: q.x + lx * c - lz * s, z: q.z + lx * s + lz * c });
      for (let r = 0; r <= rings; r++) {
        const f = r / rings;
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          const p = place(Math.cos(a) * q.rx * f, Math.sin(a) * q.rz * f);
          verts.push(p.x, this._groundY(p.x, p.z) + 0.22, p.z);
          if (r < rings) {
            const k = r * seg + i, k2 = r * seg + (i + 1) % seg;
            idx.push(k, k2, k + seg, k2, k2 + seg, k + seg);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: t.hex, transparent: true, opacity: q.type === 'ridge' ? 0.15 : 0.19,
        side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      }));
      fill.renderOrder = 1;
      this.zoneGroup.add(fill);

      const pts = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const p = place(Math.cos(a) * q.rx, Math.sin(a) * q.rz);
        pts.push(new THREE.Vector3(p.x, this._groundY(p.x, p.z) + 0.34, p.z));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: t.hex, transparent: true, opacity: 0.6 }));
      line.renderOrder = 2;
      this.zoneGroup.add(line);

      // 高台插三根小岩标；泥沼点几处气泡，近景可辨认地貌类型
      const decoMat = new THREE.MeshStandardMaterial({ color: t.hex, roughness: 0.8, emissive: new THREE.Color(t.hex), emissiveIntensity: 0.18 });
      const decoGeo = q.type === 'ridge' ? new THREE.ConeGeometry(0.9, 3.4, 5) : new THREE.SphereGeometry(0.85, 8, 6);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.6;
        const p = place(Math.cos(a) * q.rx * 0.45, Math.sin(a) * q.rz * 0.45);
        const m = new THREE.Mesh(decoGeo, decoMat);
        m.position.set(p.x, this._groundY(p.x, p.z) + (q.type === 'ridge' ? 1.7 : 0.6), p.z);
        this.zoneGroup.add(m);
      }
      const label = this._labelSprite(`${t.name} · ${t.desc}`, t.hex);
      label.position.set(q.x, this._groundY(q.x, q.z) + 8, q.z);
      this.zoneGroup.add(label);
      this.zoneVisuals.push({ fill, line, label, type: q.type });
    }
  }

  /** 战术地形描边呼吸 + 高台（ridge）描边更亮，让地貌类型在战场上也一眼可辨。 */
  _updateZonePulses() {
    for (const v of this.zoneVisuals) {
      const t = this.time;
      const seed = (v.type || 'x').length * 1.7;
      const base = v.type === 'ridge' ? 0.62 : 0.45;
      if (v.line) v.line.material.opacity = base + 0.3 * Math.abs(Math.sin(t * 1.6 + seed));
      if (v.fill) v.fill.material.opacity = (v.type === 'ridge' ? 0.15 : 0.19) * (0.7 + 0.3 * Math.abs(Math.sin(t * 1.2 + seed)));
    }
  }

  /** 中立信息素井：地面占领圈 + 悬浮晶体 + 光柱 + 归属环 + 标签。 */
  _rebuildWells(wells) {
    this._clearGroup(this.wellGroup);
    this.wellVisuals = [];
    for (const w of wells || []) {
      const g = new THREE.Group();
      g.position.set(w.x, this._groundY(w.x, w.z), w.z);
      const neutral = 0x9fe0c8;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(w.r * 0.82, 40),
        new THREE.MeshBasicMaterial({ color: neutral, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.3; pad.renderOrder = 1;
      const base = new THREE.Mesh(new THREE.RingGeometry(w.r * 0.86, w.r, 48),
        new THREE.MeshBasicMaterial({ color: neutral, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      base.rotation.x = -Math.PI / 2; base.position.y = 0.36; base.renderOrder = 2;
      const prog = new THREE.Mesh(new THREE.RingGeometry(w.r * 0.42, w.r * 0.54, 40),
        new THREE.MeshBasicMaterial({ color: neutral, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      prog.rotation.x = -Math.PI / 2; prog.position.y = 0.44; prog.renderOrder = 3;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.7, 0),
        new THREE.MeshStandardMaterial({ color: neutral, emissive: new THREE.Color(neutral), emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.2 }));
      crystal.position.y = 3.8;
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.16, 8, 36),
        new THREE.MeshBasicMaterial({ color: neutral, transparent: true, opacity: 0.75 }));
      orbit.rotation.x = Math.PI / 2; orbit.position.y = 3.8;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 17, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: neutral, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 8.5; beam.renderOrder = 2;
      const label = this._labelSprite('信息素井 · 驻兵占领', neutral);
      label.position.set(0, 14, 0);
      g.add(pad, base, prog, crystal, orbit, beam, label);
      this.wellGroup.add(g);
      this.wellVisuals.push({ g, pad, base, prog, crystal, orbit, beam, label, pulse: 0 });
    }
  }

  /** 战术掩体（可破坏）：岩石 / 断木。作为静态碰撞/可攻击实体，摧毁后由 syncFrame 回收。 */
  _rebuildObstacles(obstacles) {
    for (const m of this.obstacleMeshes.values()) this._destroyObstacleMesh(m.id);
    this.obstacleMeshes.clear();
    for (const ob of obstacles || []) {
      const isRock = ob.kind === 'rock';
      const geo = isRock
        ? new THREE.IcosahedronGeometry(ob.r, 0)
        : new THREE.CylinderGeometry(ob.r * 0.5, ob.r * 0.62, ob.r * 2.6, 9);
      const mat = new THREE.MeshStandardMaterial({
        color: isRock ? 0x8d8d86 : 0x6b4a2a, roughness: 0.95, metalness: 0.05,
        emissive: new THREE.Color(0x000000), emissiveIntensity: 0, flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const gy = this._groundY(ob.x, ob.z);
      const R = () => Math.random();
      if (isRock) {
        mesh.position.set(ob.x + (R() - 0.5) * ob.r * 0.3, gy + ob.r * 0.55, ob.z + (R() - 0.5) * ob.r * 0.3);
        mesh.scale.set(1, 0.85 + R() * 0.3, 1);
        mesh.rotation.set(R() * 0.4, ob.rot, R() * 0.4);
      } else {
        mesh.position.set(ob.x, gy + ob.r * 0.5, ob.z);
        mesh.rotation.set(Math.PI / 2, 0, ob.rot);   // 横躺的断木
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { kind: 'obstacle', id: ob.id };
      this.scene.add(mesh);
      this.pickables.push(mesh);
      this.obstacleMeshes.set(ob.id, { mesh, kind: ob.kind });
    }
  }

  /** 每帧同步战术掩体：回收已摧毁的网格、应用受击闪白。 */
  _syncObstacles(sim) {
    const oids = new Set((sim.obstacles || []).map(o => o.id));
    for (const id of [...this.obstacleMeshes.keys()]) if (!oids.has(id)) this._destroyObstacleMesh(id);
    for (const ob of sim.obstacles || []) {
      const m = this.obstacleMeshes.get(ob.id);
      if (!m) continue;
      if (ob.flash > 0) { m.mesh.material.emissive.setHex(0xffffff); m.mesh.material.emissiveIntensity = 0.18 + ob.flash * 3; }
      else { m.mesh.material.emissive.setHex(0x000000); m.mesh.material.emissiveIntensity = 0; }
    }
  }

  _destroyObstacleMesh(id) {
    const m = this.obstacleMeshes.get(id);
    if (!m) return;
    this.scene.remove(m.mesh);
    m.mesh.geometry.dispose(); m.mesh.material.dispose();
    const i = this.pickables.indexOf(m.mesh);
    if (i >= 0) this.pickables.splice(i, 1);
    this.obstacleMeshes.delete(id);
  }

  /** 每帧同步井的归属色、占领进度与争夺状态。 */
  _syncWells(sim) {
    const ws = sim.wells || [];
    for (let i = 0; i < this.wellVisuals.length; i++) {
      const v = this.wellVisuals[i], w = ws[i];
      if (!w) { v.g.visible = false; continue; }
      v.g.visible = true;
      const col = w.owner === SIDES.PLAYER ? 0x7ef0a0 : w.owner === SIDES.ENEMY ? 0xffb070 : 0x9fe0c8;
      v.crystal.material.color.setHex(col); v.crystal.material.emissive.setHex(col);
      v.base.material.color.setHex(col); v.beam.material.color.setHex(col); v.orbit.material.color.setHex(col);
      const k = Math.abs(w.progress || 0);
      v.prog.material.color.setHex(w.progress < 0 ? 0xffb070 : 0x7ef0a0);
      v.prog.material.opacity = 0.24 + 0.7 * k;
      v.prog.scale.setScalar(0.62 + 0.38 * k);
      v.crystal.material.emissiveIntensity = 0.5 + (w.owner ? 0.45 : 0) + (w.contest ? 0.35 : 0);
      v.pulse = w.pulse || 0;
      // 晶体自转 + 浮动 + 轨道环旋转；争夺中高频闪烁，提示「正在交火争夺此井」
      v.crystal.rotation.y = this.time * 0.6 + i;
      v.crystal.position.y = 3.8 + Math.sin(this.time * 2 + i) * 0.3;
      v.orbit.rotation.z = this.time * 1.1;
      const contest = w.contest ? 1 : 0;
      v.beam.material.opacity = 0.12 + 0.1 * contest + 0.06 * Math.abs(Math.sin(this.time * (contest ? 9 : 2) + i));
    }
  }

  // ---------------------------------------------------------------- 氛围增强（天空 / 远山 / 浮尘 / 水面微光）
  _buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0xa9c8e6) },
        botColor: { value: this.baseBg.clone() },
        offset: { value: 80.0 }, exponent: { value: 0.72 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 botColor; uniform float offset; uniform float exponent; varying vec3 vP; void main(){ float h = normalize(vP + vec3(0.0, offset, 0.0)).y; float t = pow(max(h, 0.0), exponent); gl_FragColor = vec4(mix(botColor, topColor, clamp(t,0.0,1.0)), 1.0); }',
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.skyMat = mat;
  }
  _applySky(bg) {
    if (!this.skyMat) return;
    const b = new THREE.Color(bg);
    this.skyMat.uniforms.botColor.value.copy(b);
    this.skyMat.uniforms.topColor.value.copy(b.clone().lerp(new THREE.Color(0xbcd8f2), 0.6));
  }
  _buildHills() {
    this.hillsGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x39472b, roughness: 1, metalness: 0 });
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.35;
      const rX = HALF_W + 26 + Math.random() * 40;
      const rZ = HALF_H + 18 + Math.random() * 36;
      const rad = 64 + Math.random() * 56;
      const h = 24 + Math.random() * 30;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      hill.scale.y = h / rad;
      hill.position.set(Math.cos(a) * rX, -1, Math.sin(a) * rZ);
      this.hillsGroup.add(hill);
    }
    this.scene.add(this.hillsGroup);
  }
  _buildDust() {
    const N = 340;
    const pos = new Float32Array(N * 3);
    this._dustVel = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * MAP.W * 1.12;
      pos[i * 3 + 1] = 2 + Math.random() * 46;
      pos[i * 3 + 2] = (Math.random() - 0.5) * MAP.H * 1.12;
      this._dustVel.push({ y: 0.5 + Math.random() * 1.3, x: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * 0.5 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 1.7, map: this._dustTex(), transparent: true, depthWrite: false, opacity: 0.5, color: 0xeaf2dd, blending: THREE.AdditiveBlending, fog: false });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }
  _dustTex() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad; x.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  _updateAmbient(dt) {
    const t = this.time;
    this._updateWeather(dt);
    if (this.sky) this.sky.position.copy(this.camera.position);
    if (this.dust) {
      const p = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this._dustVel.length; i++) {
        const v = this._dustVel[i];
        p[i * 3] += v.x * dt; p[i * 3 + 1] += v.y * dt; p[i * 3 + 2] += v.z * dt;
        if (p[i * 3 + 1] > 50) { p[i * 3 + 1] = 1; p[i * 3] = (Math.random() - 0.5) * MAP.W * 1.12; p[i * 3 + 2] = (Math.random() - 0.5) * MAP.H * 1.12; }
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
      this.dust.rotation.y = t * 0.02;
    }
    if (this.waterDiscs) for (let i = 0; i < this.waterDiscs.length; i++) {
      const d = this.waterDiscs[i];
      d.mesh.material.opacity = 0.64 + 0.12 * Math.sin(t * 1.4 + i * 1.3);
      d.mesh.position.y = d.baseY + 0.12 * Math.sin(t * 1.1 + i * 0.9);
      const s = 1 + 0.012 * Math.sin(t * 0.9 + i);
      d.mesh.scale.set(s, s, s);
    }
    for (const w of this.waterRipples) {
      const k = ((t * 0.22 + w.phase) % 1 + 1) % 1;
      const s = 0.22 + k * 1.18;
      w.mesh.scale.set(s, s, s);
      w.mesh.material.opacity = 0.34 * (1 - k);
    }
    for (let i = 0; i < this.claimRings.length; i++) {
      this.claimRings[i].material.opacity = (i % 2 === 0 ? 0.24 : 0.12) + 0.08 * Math.sin(t * 0.9 + i * 1.4);
    }
    // 战术地形描边呼吸 + 信息素井晶体旋转/光柱脉动
    for (let i = 0; i < this.zoneVisuals.length; i++) {
      const z = this.zoneVisuals[i];
      z.line.material.opacity = 0.46 + 0.18 * Math.sin(t * 0.8 + (z.type === 'ridge' ? 0 : 1.6) + i);
    }
    for (let i = 0; i < this.wellVisuals.length; i++) {
      const v = this.wellVisuals[i];
      v.crystal.rotation.y = t * 0.8 + i;
      v.crystal.position.y = 3.8 + 0.45 * Math.sin(t * 1.6 + i);
      v.orbit.rotation.z = t * 0.6;
      v.beam.material.opacity = 0.10 + 0.05 * Math.sin(t * 1.3 + i) + (v.pulse || 0) * 0.22;
    }
    // 战术标记：脉冲环扩散 + 光柱淡出，到期回收
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += dt;
      const k = clamp(p.t / p.dur, 0, 1);
      const s = 0.45 + k * 3.1;
      p.ring.scale.set(s, s, s);
      p.ring.material.opacity = 0.9 * (1 - k);
      p.beam.material.opacity = 0.32 * (1 - k);
      if (k >= 1) { this._disposePing(p); this.pings.splice(i, 1); }
    }
  }

  /** 战术标记：在地面放一个脉冲环与光柱，小地图同步显示。
   *  opts: { priority, dur }；priority 0 普通 / 2 高危（敌方能力、占井、敌方进阶）。
   *  满 6 个时淘汰「最低优先级里最旧的」，高危预警不会被普通战术标记挤掉；
   *  同色同址的重复 ping 合并刷新寿命，避免密集事件下叠成一团。
   *  第 4 个参数可选，原有 3 参数调用行为不变。 */
  addPing(x, z, color = 0xffd27f, opts = {}) {
    const prio = opts.priority || 0;
    const dur = opts.dur || 3.2;
    for (const p of this.pings) {
      if (p.color === color && Math.hypot(p.x - x, p.z - z) <= 2.5) {
        p.t = 0;
        p.priority = Math.max(p.priority || 0, prio);
        p.dur = Math.max(p.dur, dur);
        return p;
      }
    }
    if (this.pings.length >= 6) {
      let minPrio = Infinity;
      for (const p of this.pings) minPrio = Math.min(minPrio, p.priority || 0);
      if (minPrio > prio) return null;   // 全是更重要（更高优先级）的预警，普通 ping 直接不生成
      const victim = this.pings.findIndex(p => (p.priority || 0) === minPrio);
      this._disposePing(this.pings[victim]);
      this.pings.splice(victim, 1);
    }
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.35, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45; ring.renderOrder = 3;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 9, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false }));
    beam.position.y = 4.6; beam.renderOrder = 3;
    g.add(ring); g.add(beam); g.position.set(x, 0, z);
    this.scene.add(g);
    this.pings.push({ g, ring, beam, t: 0, dur, x, z, color, priority: prio });
    return this.pings[this.pings.length - 1];
  }
  _disposePing(p) {
    this.scene.remove(p.g);
    p.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  /** 资源点：按四域生成不同造型（菌丛 / 浮叶 / 孢子球 / 矿晶），并按储量与采集热度发光。 */
  spawnNodes(sim) {
    for (const c of [...this.nodeGroup.children]) {
      this.nodeGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.nodeMeshes.clear();
    this.nodeDeco.clear();
    // 颜色按「资源类型」而非域：生物质=翠绿、矿物=琥珀、信息素=品紫，一眼读懂经济价值
    const colByRes = { bio: RESOURCES.bio.hex, min: RESOURCES.min.hex, ph: RESOURCES.ph.hex };
    const GRAY = new THREE.Color(0x6a6a68);
    for (const n of sim.nodes) {
      const col = new THREE.Color(colByRes[n.res] || RESOURCES.bio.hex);
      const g = new THREE.Group();
      const glowMats = [];   // 需要按储量脉动自发光
      const tintMats = [];   // 需要随枯竭去饱和（保存基色）
      const mk = (geo, y, emissive = 0.5) => {
        const m = new THREE.MeshStandardMaterial({ color: col.clone(), roughness: 0.55, emissive: col.clone(), emissiveIntensity: emissive });
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.y = y; mesh.castShadow = true;
        g.add(mesh); glowMats.push(m); tintMats.push({ m, base: col.clone(), baseE: col.clone() });
        return mesh;
      };
      // 采集归属环：谁在采这个点，环就染成谁的阵营色
      const claim = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.25, 28),
        new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
      claim.rotation.x = -Math.PI / 2; claim.position.y = 0.26; claim.renderOrder = 2;
      g.add(claim);
      // 储量刻度环：几何固定，用 drawRange 只画出「剩余比例」的圆弧（0=枯竭，满=整圈）
      const GAUGE_SEG = 40;
      const gauge = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.95, GAUGE_SEG),
        new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      gauge.rotation.x = -Math.PI / 2; gauge.position.y = 0.3; gauge.renderOrder = 2;
      g.add(gauge);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.42), roughness: 1 }));
      plinth.position.y = 0.45; plinth.receiveShadow = true;
      g.add(plinth);

      let orb = null;
      if (n.domain === 'land') {
        // 菌丛：三簇伞盖
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const px = Math.cos(a) * 0.85, pz = Math.sin(a) * 0.85;
          const stalk = mk(new THREE.CylinderGeometry(0.16, 0.22, 1.8 + i * 0.3, 6), 1.6 + i * 0.15, 0.18);
          stalk.position.x = px; stalk.position.z = pz;
          const cap = mk(new THREE.SphereGeometry(0.85 + i * 0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 2.5 + i * 0.3, 0.6);
          cap.position.x = px; cap.position.z = pz;
        }
      } else if (n.domain === 'sea') {
        // 浮叶：贴水圆盘 + 叶脉 + 花苞
        const leaf = mk(new THREE.CylinderGeometry(2.5, 2.5, 0.18, 14), 1.1, 0.45);
        leaf.rotation.z = 0.06;
        for (let i = 0; i < 3; i++) {
          const vein = mk(new THREE.BoxGeometry(3.6, 0.08, 0.12), 1.24, 0.25);
          vein.rotation.y = i * Math.PI / 3;
        }
        const bud = mk(new THREE.SphereGeometry(0.7, 10, 8), 1.8, 0.7);
        bud.position.x = 0.7;
      } else if (n.domain === 'air') {
        // 悬浮孢子球 + 光环
        orb = mk(new THREE.IcosahedronGeometry(1.5, 1), 5.2, 0.75);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 24),
          new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.6 }));
        halo.rotation.x = Math.PI / 2.4; halo.position.y = 5.2;
        g.add(halo); glowMats.push(halo.material);
        mk(new THREE.CylinderGeometry(0.08, 0.3, 3.6, 6), 2.2, 0.25);
      } else {
        // 地下矿晶：三根高低错落的棱柱
        for (let i = 0; i < 3; i++) {
          const h = 2.6 + i * 0.9;
          const cr = mk(new THREE.ConeGeometry(0.75 - i * 0.12, h, 5), 0.9 + h / 2, 0.55);
          cr.position.x = (i - 1) * 1.05; cr.rotation.z = (i - 1) * 0.14;
        }
        mk(new THREE.DodecahedronGeometry(0.8, 0), 1.3, 0.8);
      }

      // 悬浮资源宝石：标注资源类型 + 缓慢自转/上下浮动，枯竭时缩小变暗
      const gemY = n.domain === 'air' ? 8.4 : 6.0;
      const gemMat = new THREE.MeshStandardMaterial({ color: col.clone(), roughness: 0.2, metalness: 0.25,
        emissive: col.clone(), emissiveIntensity: 0.75, transparent: true, opacity: 0.92 });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), gemMat);
      gem.position.y = gemY; gem.raycast = () => {};
      g.add(gem);
      const gemHalo = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.07, 6, 24),
        new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.5, depthWrite: false }));
      gemHalo.rotation.x = Math.PI / 2.6; gemHalo.position.y = gemY; gemHalo.raycast = () => {};
      g.add(gemHalo);

      g.position.set(n.x, this._groundY(n.x, n.z), n.z);
      this.nodeGroup.add(g);
      this.nodeMeshes.set(n.id, g);
      this.nodeDeco.set(n.id, { claim, gauge, gaugeSeg: GAUGE_SEG, glowMats, tintMats, orb, gem, gemHalo, gemY, col, GRAY });
    }
  }

  updateNodes(sim) {
    for (const n of sim.nodes) {
      const g = this.nodeMeshes.get(n.id);
      if (!g) continue;
      const d = this.nodeDeco.get(n.id);
      const k = clamp(n.amount / n.max, 0.02, 1);
      g.scale.set(0.4 + 0.6 * k, 0.3 + 0.7 * k, 0.4 + 0.6 * k);
      g.visible = n.amount > 1;
      if (!d) continue;
      const heat = n.glow || 0;
      d.claim.material.opacity = 0.06 + 0.55 * heat;
      // 正在被采集（占用热 > 0）：按概率飘出资源色微粒，让「采集中」在 3D 可见
      if (heat > 0.05 && Math.random() < (this._quality >= 1 ? 0.22 : 0.1)) {
        this.addEffect('harvest', { x: n.x, y: 4, z: n.z }, { color: d.col });
      }
      d.claim.material.color.set(n.owner === SIDES.ENEMY ? 0xff9a5a : n.owner === SIDES.PLAYER ? 0x7ef0a0 : d.col);
      const cs = 1 + 0.07 * Math.sin(this.time * 1.6 + n.id);
      d.claim.scale.set(cs, cs, cs);
      // 储量刻度：drawRange 只显示剩余比例的圆弧；枯竭偏红警示
      const segs = Math.max(1, Math.round(d.gaugeSeg * k));
      d.gauge.geometry.setDrawRange(0, segs * 6);
      d.gauge.material.color.copy(d.col).lerp(new THREE.Color(0xff7040), 1 - k > 0.7 ? (1 - k - 0.7) / 0.3 * 0.8 : 0);
      d.gauge.material.opacity = 0.35 + 0.2 * heat;
      const pulse = 0.28 + 0.32 * k + 0.22 * heat + 0.1 * Math.sin(this.time * 2.1 + n.id);
      for (const m of d.glowMats) if (m.emissiveIntensity != null) m.emissiveIntensity = pulse;
      // 枯竭去饱和：储量越低，本体与自发光越接近灰白，直观表达"快采空了"
      const spent = clamp((1 - k - 0.35) / 0.65, 0, 1) * 0.7;
      for (const t of d.tintMats) {
        t.m.color.copy(t.base).lerp(d.GRAY, spent);
        t.m.emissive.copy(t.baseE).lerp(d.GRAY, spent);
      }
      if (d.orb) d.orb.position.y = 5.2 + Math.sin(this.time * 1.5 + n.id) * 0.5;
      // 宝石：自转 + 浮动 + 随储量缩放，附带一个小光环
      d.gem.rotation.y = this.time * 0.9 + n.id;
      d.gem.rotation.x = Math.sin(this.time * 0.6 + n.id) * 0.25;
      d.gem.position.y = d.gemY + Math.sin(this.time * 1.4 + n.id) * 0.45;
      d.gem.scale.setScalar(0.55 + 0.55 * k);
      d.gem.material.emissiveIntensity = 0.35 + 0.5 * k + 0.2 * heat;
      d.gem.material.opacity = 0.4 + 0.55 * k;
      d.gemHalo.position.y = d.gem.position.y;
      d.gemHalo.rotation.z = this.time * 0.5 + n.id;
      d.gemHalo.material.opacity = 0.2 + 0.35 * k;
    }
  }

  /** 渲染 sim 当帧产生的战斗/技能特效（此前被主循环丢弃，是战斗不可见的根因）。 */
  consumeEffects(sim) {
    if (!sim.effects.length) return;
    for (const e of sim.effects) this.addEffect(e.type, e.pos, e.opts);
    sim.effects.length = 0;
  }

  // ---------------------------------------------------------------- 几何缓存
  _antGeo(side, caste, domain = 'land', sig = null) {
    const sp = side === SIDES.PLAYER ? this.playerSp : this.enemySp;
    const key = sp.id + '|' + caste + '|' + domain + '|' + (sig || '');
    if (!this._antGeoCache.has(key)) this._antGeoCache.set(key, buildAntGeometry(sp, caste, false, domain, sig));
    return this._antGeoCache.get(key);
  }
  _bGeo(type) {
    if (!this._bGeoCache.has(type)) this._bGeoCache.set(type, buildBuildingGeometry(type));
    return this._bGeoCache.get(type);
  }

  // ---------------------------------------------------------------- 实体增删
  spawnUnit(u) {
    const geo = this._antGeo(u.side, u.caste, u.domain, u.sig);
    // 每个单位独立克隆材质：便于受击闪白（自发光）与地下潜行半透各自独立
    let bodyMat = this._antMat[u.side].clone();
    const isClone = true;
    const accent = u.accent || null;
    if (u.domain === 'underground') bodyMat.transparent = true;
    if (accent) { bodyMat.emissive = new THREE.Color(accent); bodyMat.emissiveIntensity = 0.22; }
    const body = new THREE.Mesh(geo, bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    body.userData = { kind: 'unit', id: u.id };

    const group = new THREE.Group();
    group.add(body);

    // 贴地软阴影：每个单位脚下一块低成本半透圆盘，让蚁体「落」在地面上而非悬空
    const shadow = new THREE.Mesh(this._shadowGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a06, transparent: true, opacity: 0.30, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    const shScale = (RING_R[u.caste] || 2.6) * 1.15;
    shadow.scale.set(shScale, shScale, shScale);
    shadow.raycast = () => {};   // 阴影不参与拾取
    shadow.visible = u.domain !== 'underground';
    group.add(shadow);

    // 采集货载：经济单位背着资源时，头顶浮出对应颜色的小结晶（生=翠绿/矿=琥珀/素=品紫）
    let cargo = null;
    const isEcon = UNITS[u.type] && UNITS[u.type].role === 'econ';
    if (isEcon) {
      cargo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0),
        new THREE.MeshStandardMaterial({ color: RESOURCES.bio.hex, roughness: 0.35, metalness: 0.2,
          emissive: RESOURCES.bio.hex, emissiveIntensity: 0.55 }));
      cargo.position.set(-0.9, 1.55, 0);
      cargo.visible = false;
      cargo.raycast = () => {};   // 货载不参与拾取
      group.add(cargo);
    }

    // 地下单位「出土/入土」土堆：潜行时地面留一个微微隆起的土丘，破土瞬间收拢
    let mound = null;
    if (u.domain === 'underground') {
      mound = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1, transparent: true, opacity: 0.85 }));
      mound.scale.set(1, 0.34, 1);
      mound.position.y = 0.06;
      mound.visible = false;
      mound.raycast = () => {};
      group.add(mound);
    }

    // 复眼：依几何导出的眼位叠加深色发光眼点，让蚂蚁「有神」
    const eyeData = geo.userData && geo.userData.eyes;
    if (eyeData) for (const e of eyeData) {
      const eye = new THREE.Mesh(this._eyeGeo, this._eyeMat);
      eye.position.set(e.x, e.y, e.z);
      eye.scale.setScalar(e.r);
      eye.castShadow = false; eye.receiveShadow = false;
      eye.raycast = () => {};   // 眼点不参与拾取，避免干扰单位选中
      body.add(eye);
    }

    // 飞行蚁：叠加一对可独立扇动的半透明膜翅（按几何尺度定位，随身体呼吸/前冲一同运动）
    let wings = null;
    if (u.domain === 'air') {
      const sp = u.side === SIDES.PLAYER ? this.playerSp : this.enemySp;
      const castScale = { worker: 1.0, soldier: 1.22, soldier2: 1.18, soldier3: 1.5, queen: 1.7 }[u.caste] || 1.0;
      const Sg = (0.42 + sp.lenMm / 22) * castScale;
      const pivot = new THREE.Group();
      for (const side of [-1, 1]) {
        const wm = new THREE.Mesh(this._wingGeo, this._wingMat);
        wm.scale.set(1.85 * Sg, 0.10 * Sg, 1.0 * Sg);
        wm.position.set(0.02 * Sg, 0.46 * Sg, side * 0.34 * Sg);
        wm.rotation.y = side * 0.18;
        wm.castShadow = false; wm.receiveShadow = false;
        wm.raycast = () => {};   // 翅不参与拾取
        pivot.add(wm);
      }
      body.add(pivot);
      wings = pivot;
    }

    const bar = new THREE.Group();
    bar.position.y = UNIT_HEIGHT[u.caste] || 5.2;
    const bg = new THREE.Mesh(this.barBgGeo, new THREE.MeshBasicMaterial({ color: 0x14110c, transparent: true, opacity: 0.85, depthTest: false }));
    bg.renderOrder = 998;
    const fill = new THREE.Mesh(this.barFillGeo, new THREE.MeshBasicMaterial({ color: 0x6fd06a, depthTest: false }));
    fill.renderOrder = 999;
    fill.position.z = 0.01;
    bar.add(bg); bar.add(fill);
    bar.visible = false;   // 仅受伤/选中时显示（见 _syncUnit）
    group.add(bar);

    // 进化/精英单位专属金色辉光环（常显，便于在蚁群中辨识老兵）
    const eliteRing = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    eliteRing.rotation.x = -Math.PI / 2;
    eliteRing.position.y = 0.16;
    eliteRing.scale.setScalar((RING_R[u.caste] || 2.6) / 2.4);
    eliteRing.visible = false;
    group.add(eliteRing);

    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.scale.setScalar((RING_R[u.caste] || 2.6) / 2.7);
    ring.visible = false;
    group.add(ring);

    // 战术状态环（内圈细环）：增益 / 减益 / 脚下地貌，用颜色直接读出单位处境
    const statusRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    statusRing.rotation.x = -Math.PI / 2;
    statusRing.position.y = 0.09;
    statusRing.scale.setScalar((RING_R[u.caste] || 2.6) * 0.62);
    statusRing.visible = false;
    statusRing.raycast = () => {};
    group.add(statusRing);

    group.position.set(u.x, 0, u.z);
    this.scene.add(group);
    this.unitMeshes.set(u.id, { group, body, bar, fill, ring, eliteRing, statusRing, pips: null, wings, cargo, mound, shadow,
      burrowMix: u.burrowed ? 1 : 0, side: u.side, caste: u.caste, bodyIsClone: isClone, accent, spawnAt: this.time,
      heading: u.heading || 0, bank: 0, knock: 0 });
    this.pickables.push(body);
    this._syncUnit(u, true, false);
  }

  removeUnit(id) {
    const m = this.unitMeshes.get(id);
    if (!m) return;
    // 死亡演出：不直接销毁，转入 _dying 队列播放倒地 / 下沉 / 淡出（约 0.55s）后再释放。
    // 若已在进行死亡演出则忽略（syncFrame 每帧都会对缺 id 的单位调用本函数）。
    if (this._dying.has(id)) return;
    this.unitMeshes.delete(id);
    const i = this.pickables.indexOf(m.body);
    if (i >= 0) this.pickables.splice(i, 1);
    // 演出期间隐藏血条 / 选择环 / 状态环 / 货载等 UI 层，避免穿插穿帮
    if (m.bar) m.bar.visible = false;
    if (m.ring) m.ring.visible = false;
    if (m.eliteRing) m.eliteRing.visible = false;
    if (m.statusRing) m.statusRing.visible = false;
    if (m.pips) m.pips.visible = false;
    if (m.cargo) m.cargo.visible = false;
    if (m.shadow) m.shadow.visible = false;
    this._dying.set(id, { m, t0: this.time });
  }

  /** 死亡演出：本体侧翻倒地 + 下沉 + 淡出，约 0.55s 后真正释放网格。 */
  _updateDying(dt) {
    for (const [id, rec] of this._dying) {
      const { m, t0 } = rec;
      const el = this.time - t0;
      const dur = 0.55;
      if (el <= 0) continue;
      const k = Math.min(1, el / dur);
      // 整体侧翻倒地（banking 渐归零），地下单位从土里翻出再消散
      m.group.rotation.z = m.bank * (1 - k) + 1.35 * k;
      if (m.body) {
        m.body.rotation.z = 0.9 * k;
        m.body.scale.setScalar(Math.max(0.05, 1 - k * 0.55));
        if (m.body.material) {
          m.body.material.transparent = true;
          m.body.material.opacity = Math.min(m.body.material.opacity ?? 1, 1 - k);
        }
      }
      if (m.shadow) { m.shadow.visible = true; m.shadow.material.opacity = 0.30 * (1 - k); }
      if (m.burrowMix > 0) m.group.position.y = -2.4 * m.burrowMix * (1 - k) + 0.25 * k;
      if (el >= dur) { this._disposeUnitMesh(m); this._dying.delete(id); }
    }
  }

  // 只释放「每单位独有」的几何与材质；body.geometry / ring / bar / wing / eye 几何来自共享缓存，不能 dispose
  _disposeUnitMesh(m) {
    this.scene.remove(m.group);
    if (m.bodyIsClone && m.body.material) m.body.material.dispose();
    if (m.cargo) { m.cargo.geometry.dispose(); m.cargo.material.dispose(); }
    if (m.mound) { m.mound.geometry.dispose(); m.mound.material.dispose(); }
    if (m.statusRing) { m.statusRing.geometry.dispose(); m.statusRing.material.dispose(); }
    if (m.shadow) m.shadow.material.dispose();
    if (m.fill) m.fill.material.dispose();
    if (m.ring) m.ring.material.dispose();
    if (m.eliteRing) m.eliteRing.material.dispose();
    if (m.bar) m.bar.children[0].material.dispose();   // 血条底
    if (m.pips) {                            // 5 颗星点共享一份 pipGeo，只 dispose 一次
      m.pips.children[0].geometry.dispose();
      for (const p of m.pips.children) p.material.dispose();
    }
  }


  spawnBuilding(b) {
    const geo = this._bGeo(b.type);
    const baseColor = new THREE.Color(BUILDINGS[b.type].color);
    const tint = this._bMat[b.side].tint;
    const mat = new THREE.MeshStandardMaterial({ color: baseColor.clone().lerp(tint, 0.35), roughness: 0.92, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(b.x, 0, b.z);
    mesh.userData = { kind: 'building', id: b.id };
    this.scene.add(mesh);

    const bar = new THREE.Group();
    bar.position.y = (BUILDINGS[b.type].size || 5) + 3.2;
    const bg = new THREE.Mesh(this.barBgGeo, new THREE.MeshBasicMaterial({ color: 0x14110c, transparent: true, opacity: 0.85, depthTest: false }));
    bg.renderOrder = 998;
    const fill = new THREE.Mesh(this.barFillGeo, new THREE.MeshBasicMaterial({ color: 0x6fd06a, depthTest: false }));
    fill.renderOrder = 999; fill.position.z = 0.01;
    bar.add(bg); bar.add(fill);
    bar.visible = false;
    mesh.add(bar);

    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    ring.scale.setScalar((BUILDINGS[b.type].size || 5) / 2.6);
    ring.visible = false;
    this.scene.add(ring);

    // 生产进度环（出兵中显示，独立于血条/施工条，置于血条上方）
    const prog = new THREE.Group();
    prog.position.y = (BUILDINGS[b.type].size || 5) + 6.0;
    const progBg = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0x14110c, transparent: true, opacity: 0.7, depthTest: false, side: THREE.DoubleSide }));
    progBg.renderOrder = 996;
    const progFill = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 32, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
    progFill.renderOrder = 997;
    prog.add(progBg, progFill);
    prog.visible = false;
    mesh.add(prog);

    this.buildingMeshes.set(b.id, { mesh, bar, fill, ring, prog, progFill, side: b.side, type: b.type });
    this.pickables.push(mesh);
  }

  removeBuilding(id) {
    const m = this.buildingMeshes.get(id);
    if (!m) return;
    this.scene.remove(m.mesh); this.scene.remove(m.ring);
    if (m.progFill) m.progFill.geometry.dispose();
    const i = this.pickables.indexOf(m.mesh);
    if (i >= 0) this.pickables.splice(i, 1);
    this.buildingMeshes.delete(id);
  }

  // ---------------------------------------------------------------- 每帧同步
  _syncUnit(u, force, sel) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    m.group.position.x = u.x;
    m.group.position.z = u.z;
    // 四域高度：空域飞行悬空；地下潜行平滑「入土 / 破土」而非瞬间跳变
    let y = 0;
    if (u.domain === 'air') y = 7 + Math.sin(this.time * 6 + u.id) * 0.7;
    if (u.domain === 'underground') {
      const target = u.burrowed ? 1 : 0;
      const dt = clamp(this._frameDt || 0.016, 0, 0.1);
      m.burrowMix += (target - m.burrowMix) * Math.min(1, dt * 7.5);
      y = -2.4 * m.burrowMix;
      if (m.mound) {
        m.mound.visible = m.burrowMix > 0.06;
        m.mound.position.y = -y + 0.06;   // 抵消 group 下沉，土丘始终贴地
        m.mound.scale.set(1, 0.34 + 0.22 * (1 - m.burrowMix), 1);
        m.mound.material.opacity = 0.85 * m.burrowMix;
      }
    }
    m.group.position.y = y;
    // —— 朝向平滑插值（最短弧）+ 行进转弯 banking 侧倾 ——
    let target = m.heading;
    if (u.heading !== undefined) target = Math.atan2(-Math.sin(u.heading), Math.cos(u.heading));
    let dh = target - m.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    m.heading += dh * Math.min(1, this._frameDt * 11);
    m.group.rotation.y = m.heading;
    // 行进中转向时整体侧倾（视觉转弯倾摆），静止回正；死亡演出时由 _updateDying 覆盖
    const bankTarget = u.moving ? clamp(-dh * 9, -0.34, 0.34) : 0;
    m.bank += (bankTarget - m.bank) * Math.min(1, this._frameDt * 8);
    m.group.rotation.z = m.bank;
    // 潜行下沉时把血条/光环/等级星点抬回地面；出土后复位，避免 UI 一起钻进土里
    if (u.domain === 'underground') {
      const lift = y < -0.01 ? -y : 0, bh = UNIT_HEIGHT[u.caste] || 5.2;
      m.bar.position.y = bh + lift;
      m.ring.position.y = 0.12 + lift;
      m.eliteRing.position.y = 0.16 + lift;
      if (m.pips) m.pips.position.y = bh + 1.05 + lift;
    }

    // —— 出生弹出（淡入 + 缩放回弹），约 0.3s 完成 ——
    const age = this.time - m.spawnAt;
    let pop = 1;
    const isUg = u.domain === 'underground';
    const fade = age < 0.32 ? (0.3 + 0.66 * (age / 0.32)) : 1;
    const fullOp = isUg ? 0.38 : 0.96;
    // 潜行时蚁体淡出（只留地面土丘），破土瞬间重新显形
    const burrowFade = isUg ? (1 - m.burrowMix * 0.9) : 1;
    m.body.material.opacity = fullOp * fade * burrowFade;
    m.body.material.transparent = isUg || age < 0.32;

    // —— 呼吸 + 行走腿部起伏 + 攻击前冲 ——
    const breath = 1 + Math.sin(this.time * 2.2 + u.id) * 0.035;
    const walk = u.moving ? Math.sin(this.time * 16 + u.id) * 0.07 : 0;
    m.body.scale.set(pop * (1 - Math.abs(walk) * 0.3), pop * breath, pop * (1 - Math.abs(walk) * 0.3));
    m.body.rotation.z = walk * 0.5;
    // 攻击前冲：刚发动攻击（atkTimer 接近满）时向头部(+X)小幅度突刺
    let lunge = 0;
    if (u.state === 'attack' && u.atkcd && u.atkTimer > u.atkcd * 0.66) {
      const p = (u.atkTimer - u.atkcd * 0.66) / (u.atkcd * 0.34);
      lunge = Math.sin(p * Math.PI) * 1.1;
    }
    m.body.position.x = lunge;
    // 攻击姿态差异：近战啃咬绕竖轴小幅摆头；远程/喷吐先微微后仰蓄力再弹回
    if (u.state === 'attack') {
      const isMelee = u.dtype === 'bite';
      if (isMelee) {
        m.body.rotation.y = Math.sin(this.time * 26 + u.id) * 0.22;
      } else {
        const charge = u.atkcd ? clamp(1 - (u.atkTimer < u.atkcd * 0.66 ? u.atkTimer / (u.atkcd * 0.66) : 0), 0, 1) : 0;
        m.body.rotation.x += -0.22 * charge * Math.sin(this.time * 16 + u.id * 2);
      }
    } else {
      m.body.rotation.y = 0;
    }

    // 飞行蚁翅膀扇动：移动时频率与幅度都提升（加速感），悬停时慢扇
    if (m.wings) {
      const rate = u.moving ? 34 : 19;
      const amp = u.moving ? 0.78 : 0.5;
      m.wings.rotation.x = Math.sin(this.time * rate + (u.id % 11)) * amp;
    }
    if (u.domain === 'sea') {
      m.body.rotation.z += Math.sin(this.time * 3 + u.id) * (u.moving ? 0.2 : 0.1);
    }
    // 待机（不移动且非攻击）时轻微点头，增强生命感
    m.body.rotation.x = (!u.moving && u.state !== 'attack') ? Math.sin(this.time * 1.6 + u.id) * 0.05 : 0;

    // 受击应激：以 u.flash 为衰减包络，身体后缩 + 高频抖动 + 被击得微微弹起
    if (u.flash > 0) {
      const f = clamp(u.flash / 0.16, 0, 1);
      m.body.rotation.z += Math.sin(this.time * 82 + u.id * 3.1) * 0.2 * f;
      m.body.rotation.x += Math.sin(this.time * 61 + u.id) * 0.09 * f;
      m.body.position.x -= 0.7 * f;                       // 沿身体前后轴向后缩
      m.body.position.y = Math.abs(Math.sin(this.time * 44 + u.id)) * 0.25 * f;
    } else {
      m.body.position.y = 0;
    }

    // 采集货载：按已携带量显隐/缩放，并按资源类型着色，随步伐轻微晃动
    if (m.cargo) {
      const load = clamp((u.carrying || 0) / Math.max(1, u.carryCap || 1), 0, 1);
      m.cargo.visible = load > 0.04;
      if (m.cargo.visible) {
        const hex = (RESOURCES[u.carryRes] || RESOURCES.bio).hex;
        m.cargo.material.color.setHex(hex);
        m.cargo.material.emissive.setHex(hex);
        m.cargo.scale.setScalar(0.55 + 0.85 * load);
        m.cargo.position.y = 1.55 + Math.sin(this.time * (u.moving ? 15 : 3) + u.id) * (u.moving ? 0.12 : 0.06);
        m.cargo.rotation.y = this.time * 1.2 + u.id;
      }
    }

    // 受击闪白：通过本体自发光（白）+ 轻微放大表达，sim 在受击时写入 u.flash（0.16 衰减）
    if (u.flash > 0) {
      m.body.material.emissive.setRGB(1, 1, 1);
      m.body.material.emissiveIntensity = 0.12 + u.flash * 2.8;
    } else if (m.accent) {
      m.body.material.emissive.set(m.accent);
      m.body.material.emissiveIntensity = 0.22;
    } else {
      m.body.material.emissive.setRGB(0, 0, 0);
      m.body.material.emissiveIntensity = 0;
    }
    if (u.flash > 0) m.body.scale.multiplyScalar(1 + u.flash * 0.6);

    // 血条 / 等级星点 / 选择环 / 精英辉光（按需显示，降低画面杂乱与渲染开销）
    const ratio = clamp(u.hp / u.maxHp, 0, 1);
    const showBar = sel || ratio < 0.999;
    m.bar.visible = showBar;
    if (showBar) {
      m.fill.scale.x = Math.max(0.001, ratio);
      m.fill.position.x = -(3.0 / 2) * (1 - ratio);
      // 残血（<30%）血条明暗急促脉冲，远看也能发现濒死单位
      const lowPulse = ratio < 0.3 ? 0.66 + 0.34 * Math.sin(this.time * 9 + u.id) : 1;
      m.fill.material.color.setHSL(0.33 * ratio, 0.75, 0.5 * lowPulse);
      this._syncPips(m, u);
    } else if (m.pips) {
      m.pips.visible = false;
    }
    m.ring.visible = sel;
    if (sel) m.ring.material.color.set(m.side === SIDES.PLAYER ? 0x7ef0ff : 0xffb070);
    // 精英/进化单位：常显金色脉冲辉光环
    const elite = !!u.elite;
    m.eliteRing.visible = elite;
    if (elite) {
      const p = 0.5 + 0.25 * Math.sin(this.time * 3 + u.id);
      m.eliteRing.material.opacity = p;
      m.eliteRing.scale.setScalar((RING_R[u.caste] || 2.6) / 2.4 * (1 + 0.04 * Math.sin(this.time * 3 + u.id)));
    }
    // 战术状态环：新增战斗状态效果（眩晕/中毒/腐蚀/减速）优先于增益，
    // 其次增益/减益，再是脚下地貌；越危急的状态脉冲越快，潜行时收起。
    // A 侧字段全部容错读取（未声明即 0），旧对局行为完全等价。
    if (m.statusRing) {
      const b = u.buff || {};
      let sc = 0, op = 0.5, pulseRate = 4;
      const stun = u.stunT || 0;
      const poison = (u.poison && u.poison.stacks) || 0;
      const corrode = u.corrodeT || 0, slow = u.slowT || 0;
      if (stun > 0) { sc = 0xe8eef6; op = 0.88; pulseRate = 11; }        // 眩晕：灰白高频闪烁
      else if (poison > 0) { sc = 0x9fe06a; op = 0.58 + 0.16 * poison; pulseRate = 7; } // 中毒：叠层越厚越亮
      else if (corrode > 0) { sc = 0xffb070; op = 0.8; pulseRate = 6; }   // 腐蚀破甲：琥珀
      else if (slow > 0) { sc = 0x8fa8c8; op = 0.7; }                    // 减速：冰蓝
      else if ((b.tank || 1) < 0.9) { sc = 0xffd166; op = 0.78; }         // 甲壳硬化
      else if ((b.dmg || 1) > 1.1) { sc = 0xff8a5a; op = 0.76; }         // 狂暴 / 号令
      else if ((b.spd || 1) > 1.1) { sc = 0x7ef0ff; op = 0.7; }          // 加速
      else if ((b.spd || 1) < 0.9 || u.terrain === 'mire' || u.terrain === 'water') { sc = 0x8fa8c8; op = 0.55; }
      else if (u.terrain === 'ridge') { sc = 0x9fe06a; op = 0.5; }       // 高台射程加成
      if (u.domain === 'underground' && m.burrowMix > 0.5) sc = 0;
      m.statusRing.visible = !!sc;
      if (sc) {
        m.statusRing.material.color.setHex(sc);
        m.statusRing.material.opacity = op * (0.76 + 0.24 * Math.sin(this.time * pulseRate + u.id));
      }
    }
    // 贴地软阴影：飞行蚁随离地高度放大并变淡，地面单位贴地，地下单位潜行时收起
    if (m.shadow) {
      if (u.domain === 'air') {
        const h = Math.max(0, m.group.position.y);
        m.shadow.scale.setScalar((RING_R[u.caste] || 2.6) * 1.15 * (1 + h * 0.05));
        m.shadow.material.opacity = 0.30 * clamp(1 - h * 0.045, 0.08, 1);
      } else if (u.domain === 'underground') {
        m.shadow.visible = m.burrowMix < 0.5;
      } else {
        m.shadow.visible = true;
        m.shadow.material.opacity = 0.30;
      }
    }
    // 移动踏尘 / 水波 / 气泡尾迹：仅在单位移动且未潜地时，按每单位节流（约每 0.32s 一次）生成，
    // 避免每帧刷特效导致画面杂乱与性能浪费；空域单位悬空 >3 时留气泡尾迹，近水/水陆单位留涟漪，其余留尘土。
    if (u.moving && u.domain !== 'underground') {
      m._footT = (m._footT || 0) - (this._frameDt || 0.016);
      if (m._footT <= 0) {
        m._footT = 0.32;
        if (u.domain === 'air') { if (m.group.position.y > 3) this._footBubble(u.x, u.z); }
        else if (u.terrain === 'water' || u.terrain === 'shore') this._footRipple(u.x, u.z);
        else this._footDust(u.x, u.z);
      }
    }
    m.bar.quaternion.copy(this.camera.quaternion);
    m.bar.quaternion.premultiply(m.group.quaternion.clone().invert());
  }

  /** 选中单位时按等级显示星点（Lv2–Lv5 各一颗，Lv1 不显示）。 */
  _syncPips(m, u) {
    const lvl = u.level || 1;
    if (lvl <= 1) { if (m.pips) m.pips.visible = false; return; }
    if (!m.pips) {
      const g = new THREE.Group();
      const pipGeo = new THREE.SphereGeometry(0.2, 6, 5);
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(pipGeo, new THREE.MeshBasicMaterial({ color: 0xffd27f, depthTest: false, transparent: true }));
        c.renderOrder = 1000;
        c.position.set((i - 2) * 0.46, 0, 0);
        g.add(c);
      }
      g.position.y = (UNIT_HEIGHT[u.caste] || 5.2) + 1.05;
      g.renderOrder = 1000;
      m.group.add(g);
      m.pips = g;
    }
    m.pips.visible = true;
    for (let i = 0; i < 5; i++) m.pips.children[i].visible = i < lvl;
    m.pips.quaternion.copy(this.camera.quaternion);
    m.pips.quaternion.premultiply(m.group.quaternion.clone().invert());
  }

  _syncBuilding(b, selected) {
    const m = this.buildingMeshes.get(b.id);
    if (!m) return;
    const constructing = b.state === 'constructing';
    if (constructing) {
      // 施工中：青色蓝图进度条 + 半透幽灵 + 自发光脉冲 + 青色脚手架环
      m.bar.visible = true;
      m.fill.material.color.set(0x7ef0ff);
      m.fill.scale.x = Math.max(0.001, b.buildProg);
      m.fill.position.x = -(3.0 / 2) * (1 - b.buildProg);
      m.mesh.material.transparent = true;
      m.mesh.material.opacity = 0.5 + 0.16 * Math.sin(this.time * 4 + b.id);
      m.mesh.material.emissive.setHex(0x1d4a5a);
      m.mesh.material.emissiveIntensity = 0.35 + 0.2 * Math.sin(this.time * 4 + b.id);
      m.ring.visible = true;
      m.ring.material.color.set(0x7ef0ff);
      m.ring.scale.setScalar((BUILDINGS[b.type].size || 5) / 2.6 * (1 + 0.06 * Math.sin(this.time * 4 + b.id)));
    } else {
      const ratio = clamp(b.hp / b.maxHp, 0, 1);
      m.bar.visible = ratio < 0.999 || selected;
      m.fill.material.color.setHSL(0.33 * ratio, 0.7, 0.5);
      m.fill.scale.x = Math.max(0.001, ratio);
      m.fill.position.x = -(3.0 / 2) * (1 - ratio);
      m.mesh.material.transparent = false;
      m.mesh.material.opacity = 1;
      m.mesh.material.emissive.setHex(0x000000);
      m.mesh.material.emissiveIntensity = 0;
      m.ring.visible = selected;
      if (selected) m.ring.material.color.set(m.side === SIDES.PLAYER ? 0x7ef0ff : 0xffb070);
    }
    // 生产进度环：出兵中（idle 且有队列）显示 0→1 填充弧，独立于血条/施工条
    let pProg = 0, producing = false;
    if (!constructing && b.queue && b.queue.length) {
      const it = b.queue[0];
      const tot = UNITS[it.type] ? UNITS[it.type].build : 1;
      pProg = clamp(1 - it.t / tot, 0, 1);
      producing = true;
    }
    if (producing) {
      m.prog.visible = true;
      m.progFill.material.color.set(m.side === SIDES.PLAYER ? 0xffcf6a : 0xff8a4a);
      if (m._progShown == null || Math.abs(pProg - m._progShown) > 0.02) {
        m.progFill.geometry.dispose();
        m.progFill.geometry = new THREE.RingGeometry(2.4, 3.0, 32, 1, Math.PI / 2, Math.max(0.001, Math.PI * 2 * pProg));
        m._progShown = pProg;
      }
      m.prog.quaternion.copy(this.camera.quaternion);
      m.prog.quaternion.premultiply(m.mesh.quaternion.clone().invert());
    } else {
      m.prog.visible = false;
      m._progShown = null;
    }
    m.bar.quaternion.copy(this.camera.quaternion);
    m.bar.quaternion.premultiply(m.mesh.quaternion.clone().invert());
  }

  /** 每帧：同步全部单位/建筑的可视状态（位置/血条/选择环），并回收已消失实体。
   *  frozen=true 时（暂停）不生成新的扬尘，避免特效因时间冻结而无法回收。 */
  syncFrame(sim, frozen = false) {
    const uids = new Set(sim.units.map(u => u.id));
    for (const id of [...this.unitMeshes.keys()]) if (!uids.has(id)) this.removeUnit(id);
    const bids = new Set(sim.buildings.map(b => b.id));
    for (const id of [...this.buildingMeshes.keys()]) if (!bids.has(id)) this.removeBuilding(id);

    for (const u of sim.units) {
      if (!this.unitMeshes.has(u.id)) this.spawnUnit(u);
      this._syncUnit(u, false, sim.selected.has(u.id));
      const mh = this.unitMeshes.get(u.id);
      if (mh) mh.group.visible = u.side !== SIDES.ENEMY || !!u.visible;   // 超视距敌方隐藏
    }
    for (const b of sim.buildings) {
      if (!this.buildingMeshes.has(b.id)) this.spawnBuilding(b);
      this._syncBuilding(b, sim.selectedBuilding === b.id);
      const bh = this.buildingMeshes.get(b.id);
      if (bh) bh.mesh.visible = b.visible !== false;   // 敌方蚁后巢始终可见，其余按视野
    }
    this.updateNodes(sim);
    this._syncWells(sim);
    this._syncHazards(sim);
    this._syncObstacles(sim);
    this._syncRally(sim);
    this._syncOrders(sim);
    if (!frozen) {
      // 移动扬尘：每 ~0.1s 抽样若干正在移动的非飞行单位，低画质时减少生成
      const dustCap = this._quality >= 2 ? 5 : (this._quality === 1 ? 2 : 0);
      this._footAcc += 0.0166;
      if (this._footAcc >= 0.1) {
        this._footAcc = 0;
        let n = 0;
        for (const u of sim.units) {
          if (n >= dustCap) break;
          if (u.moving && u.domain !== 'air' && Math.random() < 0.22) {
            const q = this._zones ? zoneAt(this._zones, u.x, u.z) : null;
            if (q && q.type === 'mire') this._footBubble(u.x, u.z);
            else if (q && q.type === 'water') this._footRipple(u.x, u.z);
            else this._footDust(u.x, u.z);
            n++;
          }
        }
      }
      // 受损冒烟：血量偏低的单位/建筑间歇飘出烟粒，作为持续受损反馈
      this._smokeAcc += 0.0166;
      if (this._smokeAcc >= 0.42 && this._quality >= 1) {
        this._smokeAcc = 0;
        let s = 0;
        for (const u of sim.units) {
          if (s >= 3) break;
          if (u.hp / u.maxHp < 0.4 && Math.random() < 0.5) { this.addEffect('smoke', { x: u.x, y: 2.6, z: u.z }); s++; }
        }
        for (const b of sim.buildings) {
          if (s >= 5) break;
          if (b.state !== 'constructing' && b.hp / b.maxHp < 0.5 && Math.random() < 0.5) { this.addEffect('smoke', { x: b.x, y: b.size * 0.7, z: b.z }); s++; }
        }
      }
    }
  }

  _footDust(x, z) { this.addEffect('foot', { x, y: 0.3, z }); }
  _footBubble(x, z) { this.addEffect('bubble', { x, y: 0.4, z }); }
  _footRipple(x, z) { this.addEffect('ripple', { x, y: 0.2, z }); }

  // ---------------------------------------------------------------- 特效
  _updateFx() {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const alive = f.update(this.time - f.t0, this.time);
      if (!alive) {
        this.scene.remove(f.obj);
        if (f.dispose) f.dispose();
        this.fx.splice(i, 1);
      }
    }
  }

  addEffect(type, pos, opts = {}) {
    const make = FX_BUILDERS[type];
    if (make) make(this, pos, opts, this.time);
  }

  /** 指令落点：四类地面标记，0.85s 弹出→淡出，移动箭头指向实际行军方向。 */
  _orderMarker(type, pos, opts = {}) {
    const col = opts.color || 0x7ef0c8;
    const g = new THREE.Group();
    g.userData = { kind: type, dir: opts.dir || 0 };
    const mat = () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
    const flat = (geo, y = 0) => {
      const m = new THREE.Mesh(geo, mat());
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 3;
      g.add(m); return m;
    };
    const outer = flat(new THREE.RingGeometry(2.1, 2.35, 32));
    if (type === 'orderMove') {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.0, 3), mat());
      arrow.rotation.z = -Math.PI / 2;          // 锥尖由 +Y 转到 +X
      arrow.position.set(1.15, 0.16, 0);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.28), mat());
      shaft.position.set(-0.65, 0.16, 0);
      g.add(arrow, shaft);
      g.rotation.y = -(opts.dir || 0);         // 与单位朝向同一坐标系（heading 取负）
    } else if (type === 'orderAttack') {
      for (const r of [0, Math.PI / 2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.14, 0.14), mat());
        bar.rotation.y = r; bar.position.y = 0.16; g.add(bar);
      }
      for (let i = 0; i < 4; i++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.13, 6, 10, Math.PI / 3), mat());
        arc.rotation.x = -Math.PI / 2; arc.rotation.z = i * Math.PI / 2 + Math.PI / 6;
        arc.position.y = 0.12; g.add(arc);
      }
    } else if (type === 'orderRepair') {
      for (const r of [0, Math.PI / 2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.34, 0.34), mat());
        bar.rotation.y = r; bar.position.y = 0.18; g.add(bar);
      }
    } else {   // orderRally：菱形地贴 + 竖直小旗杆
      const dia = flat(new THREE.PlaneGeometry(2.2, 2.2), 0.1);
      dia.rotation.z = Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), mat());
      pole.position.y = 1.3; g.add(pole);
    }
    g.position.set(pos.x, this._groundY(pos.x, pos.z) + 0.25, pos.z);
    this.scene.add(g);
    this.fx.push({ t0: this.time, obj: g, update: (t) => {
      const dur = 0.85;
      if (t > dur) return false;
      const k = t / dur;
      const s = 0.55 + 0.5 * Math.min(1, k * 4) + k * 0.12;
      g.scale.set(s, s, s);
      const op = k < 0.16 ? k / 0.16 : Math.pow(1 - (k - 0.16) / 0.84, 1.4);
      for (const c of g.children) if (c.material) c.material.opacity = 0.92 * op;
      outer.scale.setScalar(1 + k * 0.55);
      return true;
    }, dispose: () => g.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }) });
  }

  _spark(pos, color, n) {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z; }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color, size: 1.0, transparent: true, opacity: 1, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    this.scene.add(pts);
    const vel = [];
    for (let i = 0; i < n; i++) vel.push(new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 10, (Math.random() - 0.5) * 12));
    this.fx.push({ t0: this.time, obj: pts, update: (t) => {
      if (t > 0.35) return false;
      const p = g.attributes.position.array;
      for (let i = 0; i < n; i++) { p[i * 3] += vel[i].x * 0.02; p[i * 3 + 1] += vel[i].y * 0.02; p[i * 3 + 2] += vel[i].z * 0.02; vel[i].y -= 0.6; }
      g.attributes.position.needsUpdate = true;
      mat.opacity = 1 - t / 0.35; return true;
    }, dispose: () => g.dispose() });
  }

  _projectile(pos, opts, color, scale = 0.7) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(scale, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    const from = opts.from || pos;
    const grp = new THREE.Group();
    m.position.copy(from);
    grp.add(m);
    // 拖尾：一条连回出发方向的短线段，让远程攻击的来向一眼可辨
    const tg = new THREE.BufferGeometry();
    const tp = new Float32Array(6);
    tp[0] = from.x; tp[1] = from.y; tp[2] = from.z;
    tp[3] = from.x; tp[4] = from.y; tp[5] = from.z;
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    const tl = new THREE.Line(tg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    grp.add(tl);
    // 落点预兆：弹道 / 轰炸的命中位置显示脉冲预警圈，飞行期间持续闪烁，命中时随 grp 一起移除
    const warn = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.5, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2; warn.position.set(pos.x, 0.3, pos.z);
    grp.add(warn);
    this.scene.add(grp);
    this.fx.push({ t0: this.time, obj: grp, update: (t) => {
      const k = clamp(t / 0.18, 0, 1);
      m.position.lerpVectors(from, pos, k);
      const bk = Math.max(0, k - 0.22);
      tp[0] = from.x + (m.position.x - from.x) * bk;
      tp[1] = from.y + (m.position.y - from.y) * bk;
      tp[2] = from.z + (m.position.z - from.z) * bk;
      tp[3] = m.position.x; tp[4] = m.position.y; tp[5] = m.position.z;
      tg.attributes.position.needsUpdate = true;
      tl.material.opacity = 0.6 * (1 - k * 0.6);
      warn.material.opacity = 0.3 + 0.4 * Math.abs(Math.sin(this.time * 12));
      if (k >= 1) { this.addEffect('hit', pos, { color }); return false; }
      return true;
    }, dispose: () => { m.geometry.dispose(); m.material.dispose(); tg.dispose(); tl.material.dispose(); } });
  }

  _expandRing(pos, color, maxScale, dur) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.35, 8, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(pos.x, (pos.y || 0.4) * 0.3 + 0.4, pos.z);
    this.scene.add(r);
    this.fx.push({ t0: this.time, obj: r, update: (t) => {
      if (t > dur) return false;
      const s = 1 + (t / dur) * maxScale; r.scale.set(s, s, s);
      r.material.opacity = 0.9 * (1 - t / dur); return true;
    }, dispose: () => r.geometry.dispose() });
  }

  // ---------------------------------------------------------------- 集结旗标
  _makeRallyFlag() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0xe7ecdc, roughness: 0.8 }));
    pole.position.y = 3.5; g.add(pole);
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 3.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x7ef0ff, emissive: 0x2a6a7a, emissiveIntensity: 0.45 }));
    flag.rotation.z = Math.PI / 2; flag.position.set(2.4, 6, 0); g.add(flag);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.6, 22),
      new THREE.MeshBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    return g;
  }
  _syncRally(sim) {
    const want = new Set();
    for (const b of sim.buildings) {
      if (b.side === SIDES.PLAYER && b.rally) {
        want.add(b.id);
        let m = this.rallyMeshes.get(b.id);
        if (!m) { m = this._makeRallyFlag(); this.scene.add(m); this.rallyMeshes.set(b.id, m); }
        m.visible = true;
        m.position.set(b.rally.x, 0, b.rally.z);
        const p = 0.5 + 0.25 * Math.sin(this.time * 4 + b.id);
        m.children[2].material.opacity = p;   // 地面环脉动
      }
    }
    for (const [id, m] of this.rallyMeshes) if (!want.has(id)) m.visible = false;
  }

  // ---------------------------------------------------------------- 指令路径线
  /** 选中单位（或设了集结点的建筑）显示地面指令线与终点脉冲环；复用对象池避免每帧建几何。 */
  _syncOrders(sim) {
    const selB = sim.selectedBuilding != null ? sim.getBuilding(sim.selectedBuilding) : null;
    if (!sim.selected.size && !(selB && selB.side === SIDES.PLAYER && selB.rally)) {
      for (const l of this.orderLines) l.visible = false;
      for (const m of this.orderMarks) m.visible = false;
      return;   // 无选中时跳过全量单位遍历
    }
    const want = [];
    for (const u of sim.units) {
      if (want.length >= 24) break;
      if (!sim.selected.has(u.id) || u.side !== SIDES.PLAYER) continue;
      if (u.order !== 'manual' || !u.target || u.state === 'idle') continue;
      want.push(u);
    }
    if (selB && selB.side === SIDES.PLAYER && selB.rally && want.length < 24) {
      want.push({ x: selB.x, z: selB.z, target: selB.rally, rally: true });
    }
    while (this.orderLines.length < want.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.55, depthWrite: false }));
      line.renderOrder = 7; line.frustumCulled = false;
      const mark = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.1, 20),
        new THREE.MeshBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2; mark.renderOrder = 7;
      this.orderGroup.add(line); this.orderGroup.add(mark);
      this.orderLines.push(line); this.orderMarks.push(mark);
    }
    for (let i = 0; i < this.orderLines.length; i++) {
      const line = this.orderLines[i], mark = this.orderMarks[i], u = want[i];
      if (!u || !u.target) { line.visible = false; mark.visible = false; continue; }
      const a = line.geometry.attributes.position;
      a.array[0] = u.x; a.array[1] = 0.55; a.array[2] = u.z;
      a.array[3] = u.target.x; a.array[4] = 0.55; a.array[5] = u.target.z;
      a.needsUpdate = true;
      line.visible = true;
      const col = u.rally ? 0x9fe0c8 : (u.state === 'attack' ? 0xffb070 : 0x7ef0ff);
      line.material.color.setHex(col); mark.material.color.setHex(col);
      mark.position.set(u.target.x, 0.5, u.target.z);
      mark.material.opacity = 0.42 + 0.22 * Math.sin(this.time * 4 + i);
      mark.scale.setScalar(1 + 0.06 * Math.sin(this.time * 4 + i));
      mark.visible = true;
    }
  }

  // ---------------------------------------------------------------- 地面危险区
  _syncHazards(sim) {
    const hz = sim.hazards;
    while (this.hazardMeshes.length < hz.length) {
      const m = new THREE.Mesh(this.hazardGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 6;
      this.scene.add(m); this.hazardMeshes.push(m);
    }
    while (this.hazardMeshes.length > hz.length) {
      const m = this.hazardMeshes.pop(); this.scene.remove(m); m.material.dispose();
    }
    const colors = { acidpool: 0x9fe06a, venom: 0xb6ff6f, whirl: 0x6fc8e0, storm: 0xff9a5a, ambush: 0x8a7f56, dive: 0xffd27f, burrow: 0xffd27f };
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i], m = this.hazardMeshes[i];
      m.visible = true;
      m.material.color.setHex(colors[h.fx] || colors[h.dtype] || 0xffffff);
      m.material.opacity = 0.30 + 0.14 * Math.sin(this.time * 4 + i);
      m.position.set(h.x, 0.35, h.z);
      const s = h.r;   // hazardGeo 为半径 1 的圆盘，缩放即实际作用半径
      m.scale.set(s, s, s);
    }
    // —— 静态危害地块（A 侧 sim.terrainHazards，按章节配置的熔岩 / 酸池）——
    // 与技能危害分层：常驻半透底盘 + 缓慢呼吸描边环，颜色按 type 区分；
    // 每帧按数量增删，resetBattle 亦显式清理，跨章节换图不会残留。
    const thz = sim.terrainHazards || [];
    while (this.terrainHazardMeshes.length < thz.length) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(this.hazardGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2; disc.renderOrder = 5;
      const ring = new THREE.Mesh(this._thzRingGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6;
      g.add(disc, ring); this.scene.add(g);
      this.terrainHazardMeshes.push({ g, disc, ring });
    }
    while (this.terrainHazardMeshes.length > thz.length) {
      const v = this.terrainHazardMeshes.pop();
      this.scene.remove(v.g); v.disc.material.dispose(); v.ring.material.dispose();
    }
    for (let i = 0; i < thz.length; i++) {
      const h = thz[i], v = this.terrainHazardMeshes[i];
      const col = h.type === 'acid' ? 0x9fe06a : 0xff6a3a;   // 酸池青绿 / 熔岩橙红
      const rate = h.type === 'acid' ? 1.6 : 2.4;             // 熔岩翻涌更急
      const br = 0.5 + 0.5 * Math.sin(this.time * rate + i * 1.7);
      v.g.visible = true;
      v.g.position.set(h.x, 0, h.z);
      v.disc.position.y = 0.28; v.disc.scale.set(h.r, h.r, h.r);
      v.ring.position.y = 0.32; v.ring.scale.set(h.r * 1.04, h.r * 1.04, h.r * 1.04);
      v.disc.material.color.setHex(col); v.ring.material.color.setHex(col);
      v.disc.material.opacity = 0.20 + 0.12 * br;
      v.ring.material.opacity = 0.42 + 0.28 * br;
    }
  }

  // ---------------------------------------------------------------- 入场运镜
  startIntro(to) {
    this.intro = {
      t: 0, dur: 2.6,
      from: { tx: this.cam.tx, tz: this.cam.tz, dist: this.cam.dist, pitch: this.cam.pitch, yaw: this.cam.yaw },
      to,
    };
  }

  /** 新开一局：清理上一局残留的动态可视对象（旗标/危险区/特效），避免多局累积。 */
  resetBattle() {
    this.setFollow(false);
    for (const l of this.orderLines) l.visible = false;
    for (const m of this.orderMarks) m.visible = false;
    for (const [, g] of this.rallyMeshes) {
      this.scene.remove(g);
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.rallyMeshes.clear();
    for (const m of this.hazardMeshes) { this.scene.remove(m); m.material.dispose(); }
    this.hazardMeshes.length = 0;
    for (const v of this.terrainHazardMeshes) {
      this.scene.remove(v.g); v.disc.material.dispose(); v.ring.material.dispose();
    }
    this.terrainHazardMeshes.length = 0;
    for (const f of this.fx) { this.scene.remove(f.obj); if (f.dispose) f.dispose(); }
    this.fx.length = 0;
    for (const p of this.pings) this._disposePing(p);
    this.pings.length = 0;
    // 地形区与信息素井会在 loadMap 时按新章节重建，这里先释放上一局的几何与贴图
    this._clearGroup(this.zoneGroup); this.zoneVisuals = [];
    this._clearGroup(this.wellGroup); this.wellVisuals = [];
    this.intro = null;
    this._camFocusT = null;     // 换局清掉上一局未走完的聚焦缓动
    this.hideCursor();
    this.setEdge(0, 0, false);
    this._eraFade = null;   // 换局时取消未完成的纪元渐变
  }

  // ---------------------------------------------------------------- 相机
  /** @param dt 真实帧时间（暂停时仍推进，保证相机交互不僵住）
   *  @param simDt 模拟时间（暂停时为 0，冻结运镜 / 键盘平移 / 震屏衰减） */
  updateCamera(dt, simDt = dt) {
    const c = this.cam;
    // 惰性初始化：允许测试桩件 / 外部借用原型方法时安全调用
    if (!this._camT) this._camT = { dist: c.dist, yaw: c.yaw, pitch: c.pitch };
    if (!this._camLast) this._camLast = { ...this._camT };
    const T = this._camT, L = this._camLast;
    if (this.intro) {
      this.intro.t += simDt;
      const k = Math.min(1, this.intro.t / this.intro.dur);
      const e = 1 - Math.pow(1 - k, 3);   // ease-out
      const f = this.intro.from, t = this.intro.to;
      c.tx = f.tx + (t.tx - f.tx) * e;
      c.tz = f.tz + (t.tz - f.tz) * e;
      c.dist = f.dist + (t.dist - f.dist) * e;
      c.pitch = f.pitch + (t.pitch - f.pitch) * e;
      c.yaw = f.yaw + (t.yaw - f.yaw) * e;
      // 运镜期间目标与快照跟随当前值，出场后不会被引擎「拉回」旧目标
      T.dist = c.dist; T.yaw = c.yaw; T.pitch = c.pitch;
      if (k >= 1) { this.intro = null; this._camFocusT = null; }
    } else {
      // 外部直接赋值 cam.*（开局/重开）→ 视为即时设定，同步目标避免被阻尼拉回
      if (c.dist !== L.dist || c.yaw !== L.yaw || c.pitch !== L.pitch) {
        T.dist = c.dist; T.yaw = c.yaw; T.pitch = c.pitch;
      }
      // 指数阻尼：约 0.3s 收敛，滚轮连续输入时叠加成顺滑推拉而非逐格跳变
      const kk = dt > 0 ? 1 - Math.pow(0.0015, dt) : 0;
      if (kk > 0) {
        c.dist += (T.dist - c.dist) * kk;
        c.yaw += (T.yaw - c.yaw) * kk;
        c.pitch += (T.pitch - c.pitch) * kk;
        if (Math.abs(T.dist - c.dist) < 0.008) c.dist = T.dist;
        if (Math.abs(T.yaw - c.yaw) < 0.0002) c.yaw = T.yaw;
        if (Math.abs(T.pitch - c.pitch) < 0.0002) c.pitch = T.pitch;
      }
    }
    L.dist = c.dist; L.yaw = c.yaw; L.pitch = c.pitch;
    // 聚焦缓动：空格回巢 / 小地图跳转由瞬移改为平滑滑行；任何手动平移都会取消它
    if (!this.intro && this._camFocusT && dt > 0) {
      const kf = Math.min(1, dt * 6.5);
      c.tx += (this._camFocusT.x - c.tx) * kf;
      c.tz += (this._camFocusT.z - c.tz) * kf;
      if (Math.abs(this._camFocusT.x - c.tx) + Math.abs(this._camFocusT.z - c.tz) < 0.06) {
        c.tx = this._camFocusT.x; c.tz = this._camFocusT.z;
        this._camFocusT = null;
      }
    }
    // 跟随选中单位（入场运镜期间不干扰揭示动画）
    if (this.follow && !this.intro && this._followX != null && Number.isFinite(this._followX)) {
      const k = Math.min(1, simDt * 3.0);
      c.tx += (this._followX - c.tx) * k;
      c.tz += (this._followZ - c.tz) * k;
    }
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    this.camera.position.set(
      c.tx + c.dist * cp * Math.sin(c.yaw),
      c.dist * sp,
      c.tz + c.dist * cp * Math.cos(c.yaw),
    );
    this.camera.lookAt(c.tx, 0, c.tz);
    // 冲击震屏：在相机本地右/上轴施加随时间的相干抖动，幅度随 _shake 指数衰减。
    // 仅在 _shake 显著时计算，避免每帧无谓运算；衰减到阈值以下即归零。
    if (this._shake > 0.05) {
      const a = this._shake;
      const f = this.time * 62;
      const ox = Math.sin(f * 1.3) * a + Math.sin(f * 2.7) * a * 0.4;
      const oy = Math.cos(f * 1.7) * a + Math.cos(f * 3.1) * a * 0.4;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(right, ox).addScaledVector(up, oy);
      this._shake *= Math.pow(0.012, simDt);   // ≈0.4s 内衰减到 ~16%，≈0.7s 归零（暂停时冻结）
      if (this._shake < 0.05) this._shake = 0;
    }
    // 键盘平移：A / S 已让给战场指令（攻击移动 / 停止），仅方向键与 W / D 平移
    if (simDt > 0) {
      const k = this.keys;
      const speed = (k.shift ? 90 : 46) * simDt * (c.dist / 150);
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const mv = new THREE.Vector3();
      if (k.w || k.arrowup) mv.add(fwd);
      if (k.arrowdown) mv.sub(fwd);
      if (k.d || k.arrowright) mv.add(right);
      if (k.arrowleft) mv.sub(right);
      // 屏幕边缘滚屏：鼠标贴近视口边缘时按距离线性增速
      if (this.edgePan && this.edge.active && !this.intro && !this.dragPan) {
        const W = window.innerWidth, H = window.innerHeight, band = 28;
        const ex = this.edge.x <= band ? -(1 - this.edge.x / band)
          : (this.edge.x >= W - band ? 1 - (W - this.edge.x) / band : 0);
        const ey = this.edge.y <= band ? -(1 - this.edge.y / band)
          : (this.edge.y >= H - band ? 1 - (H - this.edge.y) / band : 0);
        if (ex || ey) { mv.addScaledVector(right, ex); mv.addScaledVector(fwd, -ey); }
      }
      if (mv.lengthSq() > 0) {
        this.follow = false;   // 手动平移镜头即退出跟随
        this._camFocusT = null;
        const p = this._clampTarget(c.tx + mv.x * speed, c.tz + mv.z * speed);
        c.tx = p.x; c.tz = p.z;
      }
    }
  }

  /** 鼠标拖拽平移：把屏幕像素位移换算为地面上的相机目标位移。
   *  水平右向量 / 前向向量按透视焦距与俯角补偿，拖动时地面点基本跟着鼠标走。
   *  顺带退出镜头跟随、打断入场运镜；钳制范围与键盘平移一致。 */
  panByPixels(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const c = this.cam;
    const h = this.canvas.clientHeight || window.innerHeight || 1;
    const fov = this.camera.fov * Math.PI / 180;
    const wpp = 2 * c.dist * Math.tan(fov / 2) / h;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const sp = Math.max(0.28, Math.sin(c.pitch));
    const mx = -dx * wpp * right.x + (dy * wpp / sp) * fwd.x;
    const mz = -dx * wpp * right.z + (dy * wpp / sp) * fwd.z;
    this.follow = false; this._followX = null; this._followZ = null;
    this._camFocusT = null;   // 手动拖拽优先于聚焦缓动
    if (this.intro) this.intro = null;
    const p = this._clampTarget(c.tx + mx, c.tz + mz);
    c.tx = p.x; c.tz = p.z;
  }
  /** 拖拽平移期间关闭边缘滚屏，避免镜头被两股位移同时推动。 */
  setDragPan(on) {
    this.dragPan = !!on;
    if (on) { this.edge.active = false; this.follow = false; this._camFocusT = null; }
  }

  /** 相机目标统一边界：所有平移/聚焦入口共用，避免不同入口钳制范围漂移。 */
  _clampTarget(x, z) {
    return { x: clamp(x, -HALF_W - 20, HALF_W + 20), z: clamp(z, -HALF_H - 20, HALF_H + 20) };
  }
  _camEnsure() {
    if (!this._camT) this._camT = { dist: this.cam.dist, yaw: this.cam.yaw, pitch: this.cam.pitch };
    return this._camT;
  }
  /** 滚轮缩放：只推进目标距离，由 updateCamera 阻尼逼近。
   *  传入光标屏幕坐标时启用「锚定缩放」——鼠标所指地面点在缩放前后大致停在原处，
   *  这是 RTS 里放大到某支部队 / 缩回全局时最关键的跟手感细节。 */
  zoom(delta, px, py) {
    const T = this._camEnsure();
    const before = T.dist;
    const next = clamp(before * (1 + delta * 0.0012), 42, 250);
    if (Math.abs(next - before) < 1e-6) return;
    T.dist = next;
    if (Number.isFinite(px) && Number.isFinite(py) && typeof this.screenToGround === 'function') {
      let g = null;
      try { g = this.screenToGround(px, py); } catch { g = null; }
      if (g) {
        const ratio = 1 - next / before;   // 中心沿「指向地面点」方向补偿：newC = C + (g-C)*(1-D'/D)
        const p = this._clampTarget(
          this.cam.tx + (g.x - this.cam.tx) * ratio,
          this.cam.tz + (g.z - this.cam.tz) * ratio,
        );
        this.cam.tx = p.x; this.cam.tz = p.z;
        if (this._camFocusT) this._camFocusT = { x: p.x, z: p.z };
        this.follow = false; this._followX = null; this._followZ = null;
      }
    }
  }
  /** 中键旋转：目标角度 + 阻尼，消除逐帧硬跳。 */
  rotate(dyaw, dpitch) {
    const T = this._camEnsure();
    T.yaw -= dyaw * 0.005;
    T.pitch = clamp(T.pitch - dpitch * 0.004, 0.28, 1.32);
  }
  /** 触发摄像机冲击震屏：取较大者，避免连续小冲击被大冲击覆盖时反而变小。
   *  幅度单位为世界单位，约 0.4s 内可见衰减；典型值：克制/重创 1.4、能力 2.5、建筑损毁 4、纪元跃迁 5。 */
  shake(mag) { if (Number.isFinite(mag) && mag > this._shake) this._shake = mag; }
  /** 聚焦：默认平滑滑行到目标；instant=true 用于小地图拖动（需要严格跟手）。 */
  focus(x, z, instant = false) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.setFollow(false);
    const p = this._clampTarget(x, z);
    if (instant || this._frameDt === 0) {
      this.cam.tx = p.x; this.cam.tz = p.z; this._camFocusT = null;
    } else this._camFocusT = { x: p.x, z: p.z };
  }
  /** 镜头跟随：跟随点由 main.js 每帧按选中单位质心写入。 */
  setFollow(on) {
    this.follow = !!on;
    if (on) this._camFocusT = null;
    if (!on) { this._followX = null; this._followZ = null; }
  }
  setFollowPoint(x, z) { this._followX = x; this._followZ = z; }

  setCursor(x, z, color, radius) {
    if (x === null) { this.cursor.visible = false; return; }
    this.cursor.visible = true;
    this.cursor.position.set(x, 0.3, z);
    if (color) this.cursor.material.color.set(color);
    // 按给定半径缩放准星（默认不缩放）。用于建筑占地与技能作用范围的视觉提示。
    const base = 3.3;
    this.cursor.scale.setScalar(radius ? radius / base : 1);
  }
  hideCursor() { this.cursor.visible = false; this.hideBuildPreview(); }

  // ---------------------------------------------------------------- 放置预览 / 设置接口
  /** 建造占地幽灵盘：ok 决定青(可建)/红(不可建)，size 为巢室占地半径。 */
  setBuildPreview(x, z, size, ok) {
    const m = this.buildPreview;
    if (!m) return;
    m.visible = true;
    m.position.set(x, 0.26, z);
    m.scale.setScalar(Math.max(0.5, size || 4));
    m.material.color.set(ok ? 0x7ef0a0 : 0xff6a5a);
  }
  hideBuildPreview() { if (this.buildPreview) this.buildPreview.visible = false; }
  setEdgePan(on) { this.edgePan = !!on; if (!on) this.edge.active = false; }
  setEdge(x, y, active) { this.edge.x = x; this.edge.y = y; this.edge.active = !!active; }
  /** 画质模式：auto 由帧率自适应调档；手动档位固定为 q(0省电/1均衡/2精细)。 */
  setQualityMode(auto, q = 2) {
    this._qualityAuto = !!auto;
    this._goodFrames = 0; this._fpsAcc = 0; this._fpsN = 0;
    if (!auto) this._setQuality(Math.max(0, Math.min(2, q | 0)));
  }

  // ---------------------------------------------------------------- 拾取
  /** 世界坐标 → 屏幕（client）坐标，用于框选命中测试。 */
  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top };
  }

  _setNdc(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  screenToGround(x, y) {
    this._setNdc(x, y);
    const hit = this.raycaster.intersectObject(this.pickPlane, false)[0];
    if (!hit) return null;
    const p = hit.point;
    if (Math.abs(p.x) > HALF_W || Math.abs(p.z) > HALF_H) return null;
    return { x: p.x, z: p.z };
  }

  /** 命中实体（单位/建筑），返回 {kind, id} 或 null。 */
  pickEntity(x, y) {
    this._setNdc(x, y);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const h of hits) {
      if (h.object.userData && h.object.userData.kind) return { kind: h.object.userData.kind, id: h.object.userData.id };
    }
    return null;
  }

  // ---------------------------------------------------------------- 主循环钩子
  /** @param dt 模拟时间（暂停为 0，冻结场景）@param camDt 真实帧时间（相机阻尼始终推进） */
  update(dt, camDt = dt) {
    this.time += dt;
    this._frameDt = dt;
    this.updateCamera(camDt, dt);
    this._updateGridFade();         // 战术网格随镜头距离渐显 / 淡出
    this._updateZonePulses();       // 战术地形描边呼吸 / 高台更亮
    this._tickEraFade(dt);          // 纪元主题色平滑过渡
    this._tickDayNight(dt);         // 昼夜循环（叠加在纪元色之上）
    this._updateAmbient(dt);
    this._updateFx();
    this._updateDying(dt);     // 单位死亡倒地演出（独立于 sim 推进，暂停时随帧冻结）
    this.renderer.render(this.scene, this.camera);
    if (dt > 0) this._trackPerf();   // 暂停冻结时不参与帧率统计
  }

  /** 帧率自适应：持续低帧率时降像素比/浮尘/阴影，帧率稳定回升后再升档，避免来回抖动。 */
  _trackPerf() {
    const now = performance.now();
    if (this._lastFrameT == null) { this._lastFrameT = now; return; }
    const gap = (now - this._lastFrameT) / 1000;
    this._lastFrameT = now;
    if (gap > 0.5 || gap <= 0) { this._fpsAcc = 0; this._fpsN = 0; return; }  // 切标签页等异常间隔
    this._fpsAcc += gap; this._fpsN++;
    if (this._fpsAcc < 1.2) return;
    const fps = this._fpsN / this._fpsAcc;
    this.fps = Math.round(fps);
    this._fpsAcc = 0; this._fpsN = 0;
    if (!this._qualityAuto) { this._goodFrames = 0; return; }   // 手动画质时不自动调档
    if (fps < 27 && this._quality > 0) { this._setQuality(this._quality - 1); this._goodFrames = 0; }
    else if (fps > 50 && this._quality < 2) {
      if (++this._goodFrames >= 3) { this._setQuality(this._quality + 1); this._goodFrames = 0; }
    } else this._goodFrames = 0;
  }
  get qualityLabel() { return ['省电', '均衡', '精细'][this._quality] || '均衡'; }
  _setQuality(q) {
    this._quality = q;
    const cap = q >= 2 ? 1.8 : (q === 1 ? 1.25 : 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    if (this.dust) this.dust.visible = q >= 1;
    if (this.sun) this.sun.castShadow = q >= 1;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
