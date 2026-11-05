/**
 * Static, low-draw-call copies of the real office for the building view.
 *
 * bakeOffice() builds the actual office for a floor's appearance (same builders as the live office), then merges every
 * visible static mesh by look: plain-coloured toon/basic surfaces become one vertex-coloured mesh per shading variant,
 * textured or special surfaces are merged per material. ~3,100 meshes become a few dozen draws. Lights, effects
 * (FX layer), shadow-only casters, view-dependent shaders and team signs are left out, so no local project names or
 * board contents can appear. Results are cached per appearance and shared by every floor with the same look.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildOffice, ROOM, PERSON } from './office';
import { styleRoom } from './roomstyle';
import { THEMES, type Theme } from './themes';
import { DEFAULT_APPEARANCE, type Appearance } from './appearance';
import { createCharacter, type Look } from './character';
import { Desk } from './desk';
import { FX_LAYER } from './pixel';

export interface BakedTemplate {
  /** Shared geometry/material pairs; clone() makes a cheap per-floor instance. */
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow: boolean }[];
  /** Desk seats in office coordinates, for placing agents. */
  seats: { x: number; z: number; rot: number }[];
  sourceMeshes: number;
}
export const FOOTPRINT = { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ, height: ROOM.h };

const cache = new Map<string, BakedTemplate>();
const figureCache = new Map<number, BakedTemplate>();

/** Up to four desk teams; demand[i] = agents in team i (the office lays out pods of two seats per column). */
export function bakeKey(appearance: Appearance = DEFAULT_APPEARANCE, demand: number[] = []): string {
  return [appearance.theme, appearance.layout, appearance.lighting, deskDemand(demand).join(',')].join('|');
}
const deskDemand = (demand: number[]) => demand.slice(0, 4).map((n) => Math.max(0, Math.min(36, Math.round(n))));

export const hasBakedOffice = (appearance: Appearance = DEFAULT_APPEARANCE, demand: number[] = []) => cache.has(bakeKey(appearance, demand));

/** Real office for this appearance and desk demand, baked once per variant and reused. */
export function bakedOffice(appearance: Appearance = DEFAULT_APPEARANCE, demand: number[] = []): BakedTemplate {
  const key = bakeKey(appearance, demand);
  let template = cache.get(key);
  if (!template) {
    const base = THEMES.find((t) => t.id === appearance.theme) ?? THEMES[0];
    const theme = styleRoom(base, appearance);
    const office = buildOffice(theme);
    // Same pod layout the live office uses for this many agents; colours come from the built-in palette, team names never.
    const wanted = deskDemand(demand);
    if (wanted.some((n) => n > 0)) office.floor.layout([0, 1, 2, 3].map((t) => wanted[t] ?? 0), () => false);
    // Desks stand only in pods that have a team, exactly like the live office (Desk is the same builder).
    for (const seat of office.seats) if (seat.team >= 0) new Desk(office.scene, theme, seat).setScreen('running');
    const exclude = new Set<THREE.Object3D>(office.signs.map((s) => s.mesh));
    template = bake(office.scene, exclude);
    // Seats in pods first, so agents sit at real desks.
    template.seats = [...office.seats].sort((a, b) => Number(b.team >= 0) - Number(a.team >= 0)).map((s) => ({ x: s.x, z: s.z, rot: s.rot }));
    disposeUnused(office.scene, template);
    cache.set(key, template);
  }
  return template;
}

const LOOKS: Look[] = [
  { skin: '#eab894', hair: '#2a1e1a', hairStyle: 'short', shirt: '#5b63d6', shirtTrim: '#344450', pants: '#2d3550', shoes: '#2a2428', outfit: 'tee' },
  { skin: '#b9794f', hair: '#c58b4a', hairStyle: 'bun', shirt: '#10a37f', shirtTrim: '#e6e1d3', pants: '#3c4b48', shoes: '#2a2428', outfit: 'hoodie' },
  { skin: '#f2c7a5', hair: '#4a2f22', hairStyle: 'curly', shirt: '#d9774f', shirtTrim: '#2f3a3a', pants: '#2d3550', shoes: '#2a2428', outfit: 'sweater' },
];
/** A seated, typing coworker baked to a handful of draws; variants rotate through a few looks. */
export function bakedFigure(variant: number): BakedTemplate {
  const n = ((variant % LOOKS.length) + LOOKS.length) % LOOKS.length;
  let template = figureCache.get(n);
  if (!template) {
    const ch = createCharacter(LOOKS[n], PERSON);
    ch.setPose('typing', n);
    const holder = new THREE.Scene(); holder.add(ch.root);
    template = bake(holder, new Set());
    disposeUnused(holder, template);
    figureCache.set(n, template);
  }
  return template;
}

/** Cheap instance of a template: new Mesh objects over shared geometry and materials. */
export function instantiate(template: BakedTemplate, shadows = true): THREE.Group {
  const group = new THREE.Group();
  for (const part of template.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = shadows && part.castShadow; mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false; group.add(mesh);
  }
  return group;
}

export function clearBakedOffices() {
  for (const t of [...cache.values(), ...figureCache.values()]) for (const p of t.parts) { p.geometry.dispose(); if (p.material.userData.bakedOwned) p.material.dispose(); }
  cache.clear(); figureCache.clear();
}

function visibleChain(o: THREE.Object3D): boolean {
  for (let c: THREE.Object3D | null = o; c; c = c.parent) if (!c.visible) return false;
  return true;
}
const plain = (m: THREE.Material) =>
  (m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshBasicMaterial) && !(m as THREE.MeshBasicMaterial).map && !m.transparent && m.opacity === 1 && !m.vertexColors && m.colorWrite && !m.userData.setView && !m.onBeforeCompile.toString().includes('shader');

function bake(scene: THREE.Scene, exclude: Set<THREE.Object3D>): BakedTemplate {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; shadow: boolean; vertexColour: boolean }>();
  let sourceMeshes = 0;
  const skip = (o: THREE.Object3D) => { for (let c: THREE.Object3D | null = o; c; c = c.parent) if (exclude.has(c)) return true; return false; };
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !visibleChain(o) || skip(o)) return;
    if (o.layers.isEnabled(FX_LAYER) && !o.layers.isEnabled(0)) return;
    if (Array.isArray(o.material)) return; // none in the office today; skip rather than mis-merge
    const material = o.material as THREE.Material;
    if (!material.visible || !material.colorWrite || material.userData.setView) return;
    sourceMeshes++;
    const matrices: THREE.Matrix4[] = [];
    const colours: (THREE.Color | null)[] = [];
    if (o instanceof THREE.InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        const m = new THREE.Matrix4(); o.getMatrixAt(i, m); matrices.push(m.premultiply(o.matrixWorld));
        if (o.instanceColor) { const c = new THREE.Color(); o.getColorAt(i, c); colours.push(c); } else colours.push(null);
      }
    } else { matrices.push(o.matrixWorld.clone()); colours.push(null); }
    const isPlain = plain(material);
    const toon = material instanceof THREE.MeshToonMaterial;
    const key = isPlain
      ? `plain|${material.type}|${material.side}|${toon ? `${(material as THREE.MeshToonMaterial).gradientMap?.uuid ?? ''}|${(material as THREE.MeshToonMaterial).emissive.getHexString()}|${(material as THREE.MeshToonMaterial).emissiveIntensity}` : ''}|${(material as THREE.MeshBasicMaterial).fog}|${material.toneMapped}`
      : `exact|${material.uuid}`;
    let g = groups.get(key);
    if (!g) {
      let merged = material;
      if (isPlain) {
        merged = toon
          ? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: (material as THREE.MeshToonMaterial).gradientMap, side: material.side, emissive: (material as THREE.MeshToonMaterial).emissive, emissiveIntensity: (material as THREE.MeshToonMaterial).emissiveIntensity, fog: (material as THREE.MeshToonMaterial).fog })
          : new THREE.MeshBasicMaterial({ vertexColors: true, side: material.side, fog: (material as THREE.MeshBasicMaterial).fog, toneMapped: material.toneMapped });
        merged.userData.bakedOwned = true;
      }
      g = { material: merged, geometries: [], shadow: false, vertexColour: isPlain };
      groups.set(key, g);
    }
    g.shadow ||= o.castShadow;
    const base = (material as THREE.MeshBasicMaterial).color ?? new THREE.Color('#ffffff');
    matrices.forEach((m, i) => {
      let geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(m);
      if (g!.vertexColour) {
        geo.deleteAttribute('uv');
        const c = (colours[i] ?? new THREE.Color(1, 1, 1)).clone().multiply(base);
        const count = geo.attributes.position.count, data = new Float32Array(count * 3);
        for (let v = 0; v < count; v++) { data[v * 3] = c.r; data[v * 3 + 1] = c.g; data[v * 3 + 2] = c.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
      } else if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.morphAttributes = {};
      geo.clearGroups();
      g!.geometries.push(geo);
    });
  });
  const parts: BakedTemplate['parts'] = [];
  for (const g of groups.values()) {
    const merged = mergeGeometries(g.geometries, false);
    g.geometries.forEach((x) => x.dispose());
    if (!merged) continue;
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    parts.push({ geometry: merged, material: g.material, castShadow: g.shadow });
  }
  return { parts, seats: [], sourceMeshes };
}

/** Free the throwaway office: its geometries are copied, and only materials/textures still referenced by parts stay. */
function disposeUnused(scene: THREE.Scene, template: BakedTemplate) {
  const kept = new Set(template.parts.map((p) => p.material));
  const keptTextures = new Set<THREE.Texture>();
  for (const m of kept) for (const v of Object.values(m)) if (v instanceof THREE.Texture) keptTextures.add(v);
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (kept.has(m)) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture && !keptTextures.has(v)) v.dispose();
      m.dispose();
    }
  });
}

export type { Theme };
