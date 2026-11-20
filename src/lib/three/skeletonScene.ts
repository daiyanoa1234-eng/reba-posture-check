/**
 * 推定3D座標の骨格表示（Three.js）。必要時にだけ読み込む（動的 import）。
 * MediaPipe world 座標（x右, y下, z奥）→ Three.js（x右, y上, z手前）へ (x, -y, -z) で変換（x軸まわり180°回転）。
 * 精密な人体モデルではなく、骨格線と関節点が分かることを優先。描画は操作・姿勢変更時のみ行い負荷を抑える。
 */
import {
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  Color,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BONES, DRAW_POINTS, LM, type Pt, type Side, boneSide, pointSide } from '../pose/landmarks';

export type ViewPreset = 'camera' | 'side' | 'top';

export class SkeletonScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1, 0.01, 50);
  private controls: OrbitControls;
  private joints = new Map<number, Mesh>();
  private bones: { a: number; b: number; mesh: Mesh }[] = [];
  private neck: Mesh;
  private spine: Mesh;
  private grid: GridHelper;
  private mats: Record<'left' | 'right' | 'center' | 'leftE' | 'rightE', MeshLambertMaterial>;
  private boneGeo = new CylinderGeometry(1, 1, 1, 10);
  private jointGeo = new SphereGeometry(1, 14, 10);
  private ro: ResizeObserver;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new Color('#eef1f4');
    this.scene.add(new AmbientLight(0xffffff, 1.6));
    const dl = new DirectionalLight(0xffffff, 1.6);
    dl.position.set(1, 2, 2);
    this.scene.add(dl);
    this.mats = {
      left: new MeshLambertMaterial({ color: '#f76707' }),
      right: new MeshLambertMaterial({ color: '#1971c2' }),
      center: new MeshLambertMaterial({ color: '#495057' }),
      leftE: new MeshLambertMaterial({ color: '#f76707', emissive: '#7a2e00' }),
      rightE: new MeshLambertMaterial({ color: '#1971c2', emissive: '#0b3566' }),
    };
    for (const [a, b] of BONES) {
      const mesh = new Mesh(this.boneGeo, this.mats[boneSide(a, b)]);
      this.scene.add(mesh);
      this.bones.push({ a, b, mesh });
    }
    this.neck = new Mesh(this.boneGeo, this.mats.center);
    this.spine = new Mesh(this.boneGeo, this.mats.center);
    this.scene.add(this.neck, this.spine);
    for (const i of DRAW_POINTS) {
      const m = new Mesh(this.jointGeo, this.mats[pointSide(i)]);
      this.joints.set(i, m);
      this.scene.add(m);
    }
    this.grid = new GridHelper(2, 10, '#8795a1', '#c3ccd5');
    this.scene.add(this.grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 8;
    this.controls.addEventListener('change', () => this.requestRender());
    this.setView('camera');

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  private resize() {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  setView(v: ViewPreset) {
    const d = 3.2;
    if (v === 'camera') this.camera.position.set(0, 0.15, d);
    else if (v === 'side') this.camera.position.set(d, 0.15, 0.001);
    else this.camera.position.set(0, d, 0.001);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
  }

  setPose(world: Pt[] | null, evalSide: Side | null) {
    const visible = !!world && world.length >= 33;
    for (const m of [...this.joints.values(), ...this.bones.map((b) => b.mesh), this.neck, this.spine]) m.visible = visible;
    if (!visible) {
      this.requestRender();
      return;
    }
    const P = (i: number) => new Vector3(world[i].x, -world[i].y, -world[i].z);
    const midOf = (a: number, b: number) => P(a).add(P(b)).multiplyScalar(0.5);
    const r = 0.016;
    for (const { a, b, mesh } of this.bones) {
      const s = boneSide(a, b);
      mesh.material = s !== 'center' && s === evalSide ? this.mats[s === 'left' ? 'leftE' : 'rightE'] : this.mats[s];
      this.place(mesh, P(a), P(b), s === evalSide ? r * 1.4 : r);
    }
    this.place(this.neck, midOf(LM.L_SHOULDER, LM.R_SHOULDER), midOf(LM.L_EAR, LM.R_EAR), r);
    this.place(this.spine, midOf(LM.L_HIP, LM.R_HIP), midOf(LM.L_SHOULDER, LM.R_SHOULDER), r * 0.9);
    for (const [i, m] of this.joints) {
      m.position.copy(P(i));
      const big = pointSide(i) === evalSide;
      m.scale.setScalar(big ? 0.032 : 0.024);
    }
    const floor = Math.min(...[LM.L_HEEL, LM.R_HEEL, LM.L_FOOT, LM.R_FOOT, LM.L_ANKLE, LM.R_ANKLE].map((i) => -world[i].y));
    this.grid.position.y = floor;
    this.requestRender();
  }

  private place(mesh: Mesh, a: Vector3, b: Vector3, radius: number) {
    const dir = new Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-6) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
    mesh.scale.set(radius, len, radius);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.boneGeo.dispose();
    this.jointGeo.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.grid.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
