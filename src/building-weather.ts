import * as THREE from 'three';
import { FX_LAYER } from './pixel';

export interface BuildingWeatherState {
  state: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow';
  rain: number;
  snow: number;
  night: number;
  label: string;
}

/** A fixed-size foreground curtain outside the cutaway, in the existing pixel renderer. */
export class BuildingWeather {
  readonly group = new THREE.Group();
  readonly rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly snow: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private seeds = Float32Array.from({ length: 512 * 3 }, () => Math.random());
  private rainPositions = new Float32Array(512 * 6);
  private snowPositions = new Float32Array(512 * 3);
  private forward = new THREE.Vector3();
  private nightColor = new THREE.Color('#c0d9e8');
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'building-weather';
    const drops = new THREE.BufferGeometry();
    drops.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(drops, new THREE.LineBasicMaterial({ color: '#8ab1c7', transparent: true, depthWrite: false, toneMapped: false }));
    const flakes = new THREE.BufferGeometry();
    flakes.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.snow = new THREE.Points(flakes, new THREE.PointsMaterial({ color: '#e4eff5', size: 1.8, sizeAttenuation: false, transparent: true, opacity: .85, depthWrite: false, toneMapped: false }));
    this.rain.name = 'building-rain'; this.snow.name = 'building-snow';
    for (const object of [this.rain, this.snow]) { object.layers.set(FX_LAYER); object.frustumCulled = false; object.visible = false; }
    this.group.add(this.rain, this.snow); scene.add(this.group);
  }

  update(dt: number, sky: BuildingWeatherState | undefined, camera: THREE.OrthographicCamera, reduced: boolean) {
    const rain = THREE.MathUtils.clamp(sky?.rain ?? 0, 0, 1), snow = THREE.MathUtils.clamp(sky?.snow ?? 0, 0, 1);
    this.rain.visible = rain > .02; this.snow.visible = snow > .02;
    this.group.visible = this.rain.visible || this.snow.visible;
    if (!this.group.visible) return;
    if (!reduced) this.t += dt;
    // Follow the visible frustum so rain remains visible around a focused floor or a tall tower.
    camera.getWorldDirection(this.forward);
    this.group.position.copy(camera.position).addScaledVector(this.forward, 32);
    this.group.quaternion.copy(camera.quaternion);
    const half = camera.top, wide = camera.right;
    const drops = Math.ceil(512 * rain), flakes = Math.ceil(512 * snow);
    this.rain.geometry.setDrawRange(0, drops * 2); this.snow.geometry.setDrawRange(0, flakes);
    this.rain.material.opacity = .45 + rain * .3;
    this.rain.material.color.set('#6a91ac').lerp(this.nightColor, sky?.night ?? 0);
    for (let i = 0; i < Math.max(drops, flakes); i++) {
      const a = this.seeds[i * 3], b = this.seeds[i * 3 + 1], c = this.seeds[i * 3 + 2];
      const z = (c - .5) * 8;
      if (i < drops) {
        const x = (a * 2.3 - 1.15) * wide;
        const y = (1.15 - ((b + this.t * (1.25 + c * .35)) % 1) * 2.3) * half;
        const at = i * 6;
        this.rainPositions[at] = x; this.rainPositions[at + 1] = y; this.rainPositions[at + 2] = z;
        this.rainPositions[at + 3] = x - half * .003; this.rainPositions[at + 4] = y - half * (.018 + c * .012); this.rainPositions[at + 5] = z;
      }
      if (i < flakes) {
        const x = (a * 2.3 - 1.15) * wide + Math.sin(this.t * .7 + c * 6) * half * .035;
        const y = (1.15 - ((b + this.t * (.075 + c * .055)) % 1) * 2.3) * half;
        const at = i * 3;
        this.snowPositions[at] = x; this.snowPositions[at + 1] = y; this.snowPositions[at + 2] = z;
      }
    }
    this.rain.geometry.getAttribute('position').needsUpdate = true;
    this.snow.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    for (const object of [this.rain, this.snow]) { object.geometry.dispose(); object.material.dispose(); }
  }
}
