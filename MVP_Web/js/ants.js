/* 蚁群与建筑几何层：按兵种（工蚁/兵蚁/酸蚁/巨颚卫/蚁后）与品种参数化生成
 * 更精细、可读性更强但仍「游戏化放大」的蚁体；并按建筑类型生成蚁巢建筑。
 * 复用 data.js 的品种参数（headRatio / legRatio / spines / lenMm / mandible）。
 */
import * as THREE from 'three';
import { SPECIES } from './data.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function cyl(a, b, r1, r2, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) return null;
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
function blob(x, y, z, r, sx, sy, sz, seg = 12) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
/** 一片「叶片」（切叶蚁/工蚁携带物），用扁椭球 + 中脉 */
function leafBlob(x, y, z, s, color) {
  const g = new THREE.SphereGeometry(s, 10, 6);
  g.scale(1.7, 0.16, 1.0);
  g.translate(x, y, z);
  return g;
}
function mergeGeometries(geoms) {
  const list = geoms.filter(Boolean);
  let vc = 0, ic = 0;
  for (const g of list) {
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const idx = new Uint32Array(ic);
  const hasHinges = list.some(g => g.userData.antHinge);
  const hinges = hasHinges ? new Float32Array(vc * 4) : null;
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const n = g.attributes.position.count;
    if (hinges && g.userData.antHinge) for (let k = 0; k < n; k++) hinges.set(g.userData.antHinge, (vo + k) * 4);
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k++) idx[io + k] = a[k] + vo;
      io += a.length;
    } else {
      for (let k = 0; k < n; k++) idx[io + k] = k + vo;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  if (hinges) out.setAttribute('antHinge', new THREE.BufferAttribute(hinges, 4));
  out.computeBoundingSphere();
  return out;
}

/** 生成一只蚂蚁的基础几何（不含材质），caste 决定形态差异，domain 决定四域特征，sig 为敌人性格专属造型。 */
export function buildAntGeometry(sp, caste = 'worker', carry = false, domain = 'land', sig = null) {
  const hr = sp.headRatio;
  const lr = sp.legRatio;
  const size = 0.42 + sp.lenMm / 22;

  // 兵种体型倍率
  const castScale = { worker: 1.0, soldier: 1.22, soldier2: 1.18, soldier3: 1.5, queen: 1.7 }[caste] || 1.0;
  const S = size * castScale;

  const parts = [];
  const isSoldier = caste.startsWith('soldier');
  const isQueen = caste === 'queen';

  // —— 体节（沿 +X 为头向）：腹 → 腹柄(细腰) → 胸 → 头 ——
  const gasterX = -1.05 * S, petX = -0.52 * S, thoX = 0.0, headX = 0.70 * S;
  const headR = (0.30 + hr * 0.34) * S;
  const abSeg = isQueen ? 1.95 : 1.30;
  // 腹节（最粗）
  parts.push(blob(gasterX, 0.06 * S, 0, 0.62 * S, abSeg, 0.92, 1.02));
  if (isQueen) parts.push(blob(gasterX - 0.42 * S, 0.0, 0, 0.34 * S, 1.3, 0.82, 0.9));
  // 腹柄（细腰节点）
  parts.push(blob(petX, 0.05 * S, 0, 0.18 * S, 1, 1, 1, 8));
  // 细腰连接（胸经腹柄到腹，形成明显收腰）
  parts.push(cyl(V(thoX - 0.16 * S, 0.05 * S, 0), V(gasterX + 0.30 * S, 0.08 * S, 0), 0.075 * S, 0.055 * S));
  // 胸（并胸腹节）
  parts.push(blob(thoX, 0.07 * S, 0, 0.40 * S, 1.14, 1.0, 1.0, 8));
  // 头
  parts.push(blob(headX, 0.10 * S, 0, headR, 1.06, 1.0, 1.14));
  // 口器座（头前下方突起）
  parts.push(blob(headX + 0.16 * S, -0.05 * S, 0, 0.15 * S, 1.0, 0.9, 1.0, 8));
  // 螯针（兵蚁3 / 蚁后尾部尖刺）
  if (caste === 'soldier3' || isQueen) parts.push(cyl(V(gasterX - 0.5 * S, 0.02 * S, 0), V(gasterX - 0.86 * S, 0.06 * S, 0), 0.0, 0.10 * S));

  // 兵种特有：装甲背板 / 酸腺膨腹 / 巨颚头盾
  if (isSoldier) parts.push(blob(thoX, 0.40 * S, 0, 0.42 * S, 1.06, 0.5, 1.02, 8));
  if (caste === 'soldier2') parts.push(blob(gasterX + 0.20 * S, -0.04 * S, 0, 0.40 * S, 1.1, 1.05, 1.1));
  if (caste === 'soldier3') {
    // 巨颚卫：更宽胸甲 + 头盾
    parts.push(blob(thoX, 0.44 * S, 0, 0.52 * S, 1.12, 0.6, 1.06, 8));
    parts.push(blob(headX + 0.06 * S, 0.24 * S, 0, 0.32 * S, 1.1, 0.8, 1.2, 8));
  }

  // 六足：三对，分节（基节-腿节-胫节-跗节），明显外张呈典型蚁态
  const legLen = (0.72 + lr * 0.5) * S;
  for (let i = 0; i < 3; i++) {
    const bx = (0.16 - i * 0.30) * S;
    for (const side of [-1, 1]) {
      const knee = V(bx + (0.06 - i * 0.10) * S, 0.02 * S + 0.46 * S, side * legLen * 0.52);
      const ankle = V(bx + (0.22 - i * 0.20) * S, -0.34 * S, side * legLen * 1.02);
      const foot = V(bx + (0.30 - i * 0.16) * S, -0.44 * S, side * legLen * 1.18);
      const leg = [cyl(V(bx, 0.0, side * 0.20 * S), knee, 0.055 * S, 0.045 * S),
        cyl(knee, ankle, 0.045 * S, 0.03 * S), cyl(ankle, foot, 0.03 * S, 0.012 * S)];
      for (const g of leg) { g.userData.antHinge = [bx, 0, side * 0.20 * S, (i + (side > 0 ? 1 : 0)) % 2 + 1]; parts.push(g); }
    }
  }
  // 触角：每侧两段弯曲上扬
  for (const side of [-1, 1]) {
    const a0 = V(headX + 0.10 * S, 0.20 * S, side * 0.12 * S);
    const a1 = V(headX + 0.40 * S, 0.40 * S, side * 0.30 * S);
    const a2 = V(headX + 0.62 * S, 0.30 * S, side * 0.46 * S);
    for (const g of [cyl(a0, a1, 0.04 * S, 0.03 * S), cyl(a1, a2, 0.03 * S, 0.014 * S)]) {
      g.userData.antHinge = [a0.x, a0.y, a0.z, side > 0 ? 3 : 4]; parts.push(g);
    }
  }
  // 复眼：头部两侧半球（同材质靠位置/弧度辨识；world.js 另叠加深色发光眼点）
  const eyeR = 0.15 * S, eyeX = headX + 0.02 * S, eyeY = 0.17 * S, eyeZ = headR * 0.62;
  for (const side of [-1, 1]) parts.push(blob(eyeX, eyeY, side * eyeZ, eyeR, 1, 1, 1, 8));
  // 大颚（钳形）：每侧两节弯向中线形成夹钳
  const jawScale = isSoldier ? 1.55 : (caste === 'soldier3' ? 1.9 : 1.0);
  const jawBaseX = headX + 0.14 * S, jawY = -0.06 * S;
  const jawSpread = (sp.mandible.includes('不闭合') ? 0.30 : 0.18) * S;
  const jawLen = (sp.mandible.includes('长') || sp.mandible.includes('镰') ? 0.62 : 0.40) * S * jawScale;
  for (const side of [-1, 1]) {
    const z0 = side * 0.12 * S;
    const mid = V(jawBaseX + jawLen * 0.5, jawY + 0.06 * S, side * (0.12 + jawSpread) * S);
    const tip = V(jawBaseX + jawLen, jawY - 0.02 * S, side * (0.12 + jawSpread * 0.42) * S);
    parts.push(cyl(V(jawBaseX, jawY, z0), mid, 0.07 * S * jawScale, 0.05 * S * jawScale));
    parts.push(cyl(mid, tip, 0.05 * S * jawScale, 0.012 * S));
  }
  // 背刺（品种特征）
  for (let i = 0; i < sp.spines; i++) {
    const bx = (0.34 - (i % 3) * 0.30) * size * castScale;
    const bz = (i < 3 ? -1 : 1) * 0.22 * size;
    parts.push(cyl(
      V(bx, 0.34 * size * castScale, bz),
      V(bx - 0.12 * size, (0.66 + 0.06 * (i % 2)) * size * castScale, bz * 1.8),
      0.085 * size, 0.005 * size,
    ));
  }
  // 工蚁/蚁后携带叶片
  if (carry || isQueen) {
    const ly = 0.55 * S;
    parts.push(leafBlob(gasterX + 0.16 * S, ly, 0, 0.5 * S));
    if (isQueen) parts.push(leafBlob(gasterX + 0.62 * S, ly + 0.1, 0.1 * S, 0.42 * S));
  }

  // —— 四域环境特征 ——
  if (domain === 'air') {
    // 飞行蚁：两对半透明膜翅 + 翅脉
    for (const side of [-1, 1]) {
      for (const pp of [0.06, -0.34]) {
        const w = blob((0.02 + pp) * S, 0.42 * S, side * 0.36 * S, 0.46 * S, 2.0, 0.10, 0.62, 8);
        parts.push(w);
        parts.push(cyl(V((0.02 + pp) * S, 0.43 * S, side * 0.18 * S), V((0.02 + pp - 0.30) * S, 0.40 * S, side * 0.52 * S), 0.012 * S, 0.005 * S));
        parts.push(cyl(V((0.02 + pp) * S, 0.43 * S, side * 0.18 * S), V((0.02 + pp + 0.22) * S, 0.40 * S, side * 0.56 * S), 0.012 * S, 0.005 * S));
      }
    }
  } else if (domain === 'sea') {
    // 水栖蚁：尾鳍（带鳍条）+ 背鳍（流线型）
    const tailX = gasterX - 0.5 * S;
    parts.push(blob(tailX, 0.04 * S, 0, 0.30 * S, 0.5, 0.95, 1.5, 8));
    for (let r = -2; r <= 2; r++) parts.push(cyl(V(tailX, 0.04 * S, 0), V(gasterX - 1.05 * S, 0.04 * S, r * 0.16 * S), 0.02 * S, 0.004 * S));
    parts.push(blob(thoX - 0.1 * S, 0.40 * S, 0, 0.16 * S, 1.2, 1.8, 0.5, 8));
  } else if (domain === 'underground') {
    // 掘蚁：加宽的前掘足 + 头铲（更适合钻地）
    for (const side of [-1, 1]) {
      const knee = V(-0.1 * S, 0.30 * S, side * 0.5 * S);
      const foot = V(-0.6 * S, -0.36 * S, side * 0.7 * S);
      parts.push(cyl(V(0.1 * S, 0.05 * S, side * 0.24 * S), knee, 0.10 * S, 0.07 * S));
      parts.push(cyl(knee, foot, 0.07 * S, 0.03 * S));
    }
    parts.push(blob(headX + 0.20 * S, -0.06 * S, 0, 0.30 * S, 1.4, 0.7, 1.2, 8));
  }

  // —— 敌人性格专属造型（仅对应性格敌方可见）—— 让三种性格一眼可辨
  // 自定义 blob/cyl 几何无 uv，故所有 THREE 图元须剥离 uv 才能 mergeGeometries
  const strip = g => { g.deleteAttribute('uv'); return g; };
  if (sig === 'aggressive') {
    // 掠食型·狂袭蚁：头部红角突刺 + 脊背赤红冠脊（高速冲锋的凶相）
    for (const side of [-1, 1]) {
      const horn = strip(new THREE.ConeGeometry(0.10 * size, 0.66 * size, 7));
      horn.translate(1.18 * size * castScale, 0.30 * size, side * 0.16 * size);
      horn.rotateZ(-0.5 * side);
      parts.push(horn);
    }
    const crest = strip(new THREE.BoxGeometry(0.7 * size * castScale, 0.20 * size, 0.34 * size));
    crest.translate(0.05 * size, 0.52 * size * castScale, 0);
    crest.rotateZ(-0.25);
    parts.push(crest);
    parts.push(blob(0.05 * size, 0.46 * size, 0, 0.30 * size * castScale, 1.4, 0.5, 1.0, 6));
  } else if (sig === 'expansionist') {
    // 拓殖型·殖群卫：层叠甲群护盾（多片扁平甲板覆盖胸腹，坚韧控场）
    for (let i = 0; i < 3; i++) {
      const plate = strip(new THREE.BoxGeometry(0.5 * size * castScale, 0.16 * size, 0.9 * size * castScale));
      plate.translate((-0.55 + i * 0.42) * size * castScale, 0.40 * size * castScale, 0);
      plate.rotateZ(0.12 * (i - 1));
      parts.push(plate);
    }
    const collar = strip(new THREE.TorusGeometry(0.42 * size * castScale, 0.12 * size, 6, 16));
    collar.rotateX(Math.PI / 2);
    collar.translate(0.55 * size * castScale, 0.16 * size, 0);
    parts.push(collar);
  } else if (sig === 'defensive') {
    // 守城型·炮甲蚁：重甲壳（腹部覆盖的半球硬壳，远程压制的壁垒感）
    const shell = strip(new THREE.SphereGeometry(0.86 * size * castScale, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62));
    shell.scale(1.0, 0.7, 1.15);
    shell.translate(-0.80 * size * castScale, 0.30 * size, 0);
    parts.push(shell);
    const turret = strip(new THREE.CylinderGeometry(0.12 * size, 0.16 * size, 0.5 * size, 8));
    turret.translate(0.62 * size, 0.34 * size, 0);
    turret.rotateZ(-0.5);
    parts.push(turret);
  }

  const geo = mergeGeometries(parts);
  geo.scale(2.2, 2.2, 2.2);
  const hinges = geo.getAttribute('antHinge');
  if (hinges) for (let i=0;i<hinges.count;i++) { hinges.setX(i,hinges.getX(i)*2.2); hinges.setY(i,hinges.getY(i)*2.2); hinges.setZ(i,hinges.getZ(i)*2.2); }
  // 暴露复眼在 body 局部坐标系（已含 2.2 倍缩放）的位置，供 world.js 叠加深色发光眼点
  const k = 2.2;
  geo.userData = {
    stanceHeight: 0.44 * S * 2.2,
    eyes: [
      { x: eyeX * k, y: eyeY * k, z: eyeZ * k, r: eyeR * k },
      { x: eyeX * k, y: eyeY * k, z: -(eyeZ * k), r: eyeR * k },
    ],
  };
  // 让「头朝 +X」成为默认朝向，便于用 lookAt 对齐移动方向
  return geo;
}

/* ----------------------------- 建筑几何 ----------------------------- */
function mound(rBase, h, seg = 22, steps = 5) {
  // 阶梯式土丘，更像被夯实的蚁巢
  const parts = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const r = rBase * (1 - t * 0.82);
    const y = h * t;
    const ring = new THREE.CylinderGeometry(r, r + rBase * 0.16, h / steps * 1.04, seg, 1);
    ring.translate(0, y + h / steps / 2, 0);
    parts.push(ring);
  }
  return parts;
}

export function buildBuildingGeometry(type) {
  const parts = [];
  if (type === 'hq') {
    for (const g of mound(6.6, 5.4, 26, 6)) parts.push(g);
    // 巢口
    const mouth = new THREE.TorusGeometry(2.3, 0.5, 10, 28);
    mouth.rotateX(Math.PI / 2);
    mouth.translate(0, 5.3, 0);
    parts.push(mouth);
    const hole = new THREE.CircleGeometry(2.2, 24);
    hole.rotateX(-Math.PI / 2);
    hole.translate(0, 5.32, 0);
    parts.push(hole);
    // 顶部小塔（蚁后高台）
    const spire = new THREE.ConeGeometry(1.4, 2.4, 16);
    spire.translate(0, 6.8, 0);
    parts.push(spire);
  } else if (type === 'nursery') {
    for (const g of mound(4.4, 3.4, 22, 5)) parts.push(g);
    // 几个育幼穹顶
    const spots = [[-1.6, 1.4], [1.4, 1.1], [0.2, -1.5]];
    for (const [x, z] of spots) {
      const d = new THREE.SphereGeometry(1.5, 16, 10);
      d.scale(1, 0.7, 1); d.translate(x, 3.3, z);
      parts.push(d);
    }
  } else if (type === 'barracks') {
    for (const g of mound(5.0, 3.8, 22, 5)) parts.push(g);
    // 兵营顶部的「兵蚁浮雕」：两根前伸大颚示意
    for (const side of [-1, 1]) {
      const jaw = cyl(V(-0.4, 4.0, side * 0.5), V(2.4, 4.6, side * 1.6), 0.34, 0.08);
      if (jaw) parts.push(jaw);
    }
    const banner = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6);
    banner.translate(0, 5.6, 0); parts.push(banner);
  } else if (type === 'tower') {
    const base = new THREE.CylinderGeometry(2.2, 2.8, 2.2, 16);
    base.translate(0, 1.1, 0); parts.push(base);
    const shaft = new THREE.CylinderGeometry(1.2, 1.6, 5.0, 14);
    shaft.translate(0, 4.6, 0); parts.push(shaft);
    const turret = new THREE.SphereGeometry(1.5, 16, 12);
    turret.scale(1, 0.8, 1); turret.translate(0, 7.2, 0); parts.push(turret);
    // 警戒环
    const ring = new THREE.TorusGeometry(1.7, 0.16, 8, 24);
    ring.rotateX(Math.PI / 2); ring.translate(0, 7.2, 0); parts.push(ring);
  } else if (type === 'tech') {
    for (const g of mound(4.6, 2.8, 20, 4)) parts.push(g);
    const obel = new THREE.CylinderGeometry(0.7, 1.1, 6.5, 8);
    obel.translate(0, 6.0, 0); parts.push(obel);
    const cap = new THREE.OctahedronGeometry(1.1, 0);
    cap.translate(0, 9.6, 0); parts.push(cap);
    const ring = new THREE.TorusGeometry(2.2, 0.18, 8, 28);
    ring.rotateX(Math.PI / 2); ring.translate(0, 7.6, 0); parts.push(ring);
  } else if (type === 'seanest') {
    // 水栖巢室：浅盆水洼 + 中央出气锥
    const basin = new THREE.CylinderGeometry(4.6, 5.2, 1.2, 26);
    basin.translate(0, 0.6, 0); parts.push(basin);
    const water = new THREE.CylinderGeometry(4.2, 4.2, 0.4, 26);
    water.translate(0, 1.2, 0); parts.push(water);
    const cone = new THREE.ConeGeometry(1.8, 4.4, 18);
    cone.translate(0, 3.2, 0); parts.push(cone);
    const spire = new THREE.SphereGeometry(0.9, 12, 8);
    spire.translate(0, 5.4, 0); parts.push(spire);
  } else if (type === 'airnest') {
    // 空中蜂巢：悬于低空的椭球巢壳 + 支撑缆
    const shell = new THREE.SphereGeometry(4.4, 20, 14);
    shell.scale(1, 0.82, 1); shell.translate(0, 6.2, 0); parts.push(shell);
    const mouth = new THREE.TorusGeometry(1.6, 0.4, 8, 22);
    mouth.rotateX(Math.PI / 2); mouth.translate(0, 4.2, 0); parts.push(mouth);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rope = cyl(V(Math.cos(a) * 3.6, 6.2, Math.sin(a) * 3.6), V(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0), 0.10, 0.10);
      if (rope) parts.push(rope);
    }
  } else if (type === 'ugnest') {
    // 地下菌核：菌伞状（菌丝发光感靠颜色）+ 基部菌柄
    const stalk = new THREE.CylinderGeometry(1.4, 2.0, 3.2, 16);
    stalk.translate(0, 1.6, 0); parts.push(stalk);
    const cap = new THREE.SphereGeometry(4.2, 22, 12);
    cap.scale(1, 0.5, 1); cap.translate(0, 4.0, 0); parts.push(cap);
    const glow = new THREE.SphereGeometry(1.2, 12, 8);
    glow.translate(0, 4.6, 0); parts.push(glow);
  }
  return mergeGeometries(parts);
}
