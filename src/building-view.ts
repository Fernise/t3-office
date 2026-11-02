import { placeLabel, type Rect } from './building-labels';
import { addFloorIdentity } from './floor-identity';
import { PixelPipeline } from './pixel';
import { THEMES, type Theme } from './themes';
import { toon } from './materials';
import { bakedOffice, bakedFigure, instantiate, hasBakedOffice, FOOTPRINT } from './floor-bake';
import { PERSON, WING } from './office';
/** One interactive cutaway scene for the user's authorized building: every floor is the real office (baked, see floor-bake.ts) at real size; no private office readers. */
import * as THREE from 'three';
import { api, ApiError, type Floor } from './building-api';
import { DEFAULT_APPEARANCE, isAppearance, type Appearance } from './appearance';
import { settings } from './settings';
import { B } from './i18n/building';
import { locale } from './i18n';
import { travelToFloor } from './elevator';
import './building-view.css';
const T = locale({ en: { title: 'The Building', floors: 'Floors', hint: 'Click a floor to focus. Drag to turn the building.', all: 'Whole building', close: 'Back to office', friends: 'Friends & invitations', enter: 'Enter this office', choose: 'Pick a floor', chooseHint: 'Every office is a place you can visit. Select one in the building or directory to look closer.', privacy: 'Only your office and floors shared with you appear here.', own: 'Your office', home: 'Home floor', presence: 'Presence only · interior private', active: 'Activity shared', ownerScope: 'Your office · invited access only', moment: 'Owner-published moment', offline: 'Offline', online: 'Online', agents: 'coworkers', loading: 'Opening your building…', error: 'Building unavailable. Floor details have been cleared.', retry: 'Try again', local: 'Your office works without an account. Invite friends from the in-office menu to add their floors.', focus: 'Floor focus', count: 'offices', limited: 'The 3D view shows a section of this tall building. Choose any office in the directory.', preview: 'Stylized office previews · no tasks or transcripts' }, de: { title: 'Das Gebäude', floors: 'Etagen', hint: 'Etage zum Fokussieren anklicken. Ziehen zum Drehen.', all: 'Ganzes Gebäude', close: 'Zurück zum Büro', friends: 'Freunde & Einladungen', enter: 'Dieses Büro betreten', choose: 'Wähle eine Etage', chooseHint: 'Wähle ein Büro im Gebäude oder Verzeichnis, um es näher anzusehen.', privacy: 'Nur dein Büro und mit dir geteilte Etagen erscheinen hier.', own: 'Dein Büro', home: 'Eigene Etage', presence: 'Nur Anwesenheit · Innenraum privat', active: 'Aktivität geteilt', ownerScope: 'Dein Büro · nur eingeladener Zugriff', moment: 'Vom Besitzer veröffentlichter Moment', offline: 'Offline', online: 'Online', agents: 'Kollegen', loading: 'Dein Gebäude wird geöffnet…', error: 'Gebäude nicht verfügbar. Etageninformationen wurden entfernt.', retry: 'Erneut versuchen', local: 'Dein Büro funktioniert ohne Konto. Lade über das Büromenü Freunde ein, um ihre Etagen hinzuzufügen.', focus: 'Etagenansicht', count: 'Büros', limited: 'Die 3D-Ansicht zeigt einen Abschnitt dieses hohen Gebäudes. Wähle jedes Büro im Verzeichnis.', preview: 'Stilisierte Büroansichten · keine Aufgaben oder Gespräche' } });
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let closeCurrent: (() => void) | undefined;
const RETURN_KEY = 'office.building-return.v1';
interface ReturnView { id: string; scope: Floor['scope']; at: number; target: number[]; half: number; yaw: number; zoom: number }
function readReturn(): ReturnView | undefined {
  try {
    const v = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null');
    if (v && typeof v.id === 'string' && ['owner', 'activity', 'presence'].includes(v.scope) && Number.isFinite(v.at) && Date.now() >= v.at && Date.now() - v.at < 1800000 && Array.isArray(v.target) && v.target.length === 3 && v.target.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000) && [v.half, v.yaw, v.zoom].every(Number.isFinite) && v.half > 0 && v.half < 1000 && Math.abs(v.yaw) < 100 && v.zoom >= .65 && v.zoom <= 1.6) return v;
  } catch { /* storage unavailable */ }
}

export interface BuildingRenderHost {
  canvas: HTMLCanvasElement;
  theme: Theme;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  sync(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight): void;
  /** Your own agents on this screen (local only, never sent anywhere), so your floor shows them even when not sharing. */
  agents?(): number;
  /** The live office camera: where it looks, its angle/tilt (radians) and vertical half-size, so entering can land on exactly that view. */
  view?(): { target: THREE.Vector3; az: number; el: number; half: number };
}
export async function openBuildingView(openFriends: () => void, host?: BuildingRenderHost) {
  if (closeCurrent) return;
  let returnView = readReturn();
  const previous = document.activeElement as HTMLElement | null;
  const root = document.createElement('section'); root.className = 'building-world'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', T.title);
  root.innerHTML = `<header><div><small>T3 OFFICE</small><h1>${T.title}</h1><p>${T.hint}</p></div><nav><button data-action="all">${T.all}</button><button data-action="directory">${T.floors}</button><button data-action="close">${T.close} ×</button></nav></header><div class="building-world-stage"><canvas aria-label="${T.title}"></canvas><svg class="building-world-leaders" aria-hidden="true"></svg><div class="building-world-labels"></div><p class="building-world-caption">${T.preview}</p></div><aside><p class="building-world-status" role="status" aria-live="polite">${T.loading}</p><div class="building-world-detail"></div><h2>${T.all}</h2><p class="building-world-privacy">${T.privacy}</p><div class="building-world-directory"></div><button class="building-world-invite" data-action="friends">${T.friends}</button></aside>`;
  document.body.append(root); document.body.classList.add('building-view-open');
  let closed = false; let raf = 0; let poll: ReturnType<typeof setInterval> | undefined;
  let floors: Floor[] = []; let selected: string | null = null; let busy = false; let signature = ''; let windowStart = 0;
  const stage = root.querySelector<HTMLElement>('.building-world-stage')!; let canvas = root.querySelector('canvas')!;
  const canvasMarker = host ? document.createComment('office canvas') : undefined;
  const hudMarker = host && document.querySelector('#hud') ? document.createComment('office HUD') : undefined;
  const originalHud = host ? document.querySelector<HTMLElement>('#hud') : null;
  if (host && canvasMarker) { host.canvas.before(canvasMarker); canvas.replaceWith(host.canvas); canvas = host.canvas; root.dataset.sharedCanvas = 'true'; }
  if (originalHud && hudMarker) { originalHud.before(hudMarker); root.append(originalHud); }
  const status = root.querySelector<HTMLElement>('.building-world-status')!;
  const labelLayer = root.querySelector<HTMLElement>('.building-world-labels')!;
  const leaderLayer = root.querySelector<SVGSVGElement>('.building-world-leaders')!;
  const directory = root.querySelector<HTMLElement>('.building-world-directory')!;
  const detail = root.querySelector<HTMLElement>('.building-world-detail')!;
  const theme = host?.theme ?? THEMES.find(t => t.id === settings.get('theme')) ?? THEMES[0];
  for (const [key, value] of Object.entries({ paper: theme.hud.paper, ink: theme.hud.ink, muted: theme.hud.muted, edge: theme.hud.edge, shadow: theme.hud.shadow, font: theme.hud.font, accent: theme.hud.accent, 'tag-bg': theme.hud.tagBg, 'tag-ink': theme.hud.tagInk })) root.style.setProperty(`--${key}`, value);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(theme.bg);
  const camera = new THREE.OrthographicCamera(-15, 15, 15, -15, .1, 400);
  const fallback = host ? undefined : new PixelPipeline(canvas, 2, theme.post);
  const hemi = new THREE.HemisphereLight(theme.lights.sky, theme.lights.ground, theme.lights.hemi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.lights.sun, theme.lights.sunIntensity); sun.position.set(...theme.lights.sunDir).multiplyScalar(40); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(...theme.lights.sunDir).normalize();
  // Floors are lit like the real office at night: a small pool of lamps follows the floors nearest the camera, so the light count (and shaders) never change.
  const lampPool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight('#ffe2b0', 0, 30, 1.4); scene.add(l); return l; });
  const unit = new THREE.BoxGeometry(1, 1, 1); const leaves = new THREE.IcosahedronGeometry(1, 0); const edges = new THREE.EdgesGeometry(unit);
  const materials = new Map<string, THREE.MeshToonMaterial>();
  const mat = (color: string) => { let m = materials.get(color); if (!m) { m = toon(color); materials.set(color, m); } return m; };
  // Real office footprint (office coordinates); floors are centred on the building axis.
  const { minX, maxX, minZ, maxZ, height: ROOM_H } = FOOTPRINT; const CX = (minX + maxX) / 2; const W = maxX - minX; const D = maxZ - minZ;
  const STOREY = ROOM_H + 0.9;
  const box = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number) => { const mesh = new THREE.Mesh(unit, mat(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const models = new THREE.Group(); scene.add(models);
  const identityDisposals: (()=>void)[] = [];
  const momentLamps: {light:THREE.PointLight;at:number}[] = [];
  const rings = new Map<string, THREE.LineSegments>(); const rowY = new Map<string, number>(); const floorLook = new Map<string, { color: string; intensity: number }>();
  const ringMaterial = new THREE.LineBasicMaterial({ color: '#ffda83' });
  const target = new THREE.Vector3(0, 4, 0); const wanted = target.clone(); let half = 12; let needV = 12; let needH = 22; let shift = 0; let zoom = 1; let yaw = .5; let goalYaw = .5; const EL = Math.atan2(36, 80); let el = EL;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  // Transitions: the camera eases between framings while the building splits open around a chosen floor
  // (floors above rise, everything below sinks) and closes again for the whole view. Off-screen parts are hidden once still.
  const DURATION = 1100, INTRO = 1500, SPLIT = 38;
  const ease = (p: number) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const tween = { t0: 0, dur: 0, done: true, snap: false, waitForBakes: false, angles: false, fromYaw: .5, fromEl: EL, toYaw: .5, toEl: EL, dive: undefined as undefined | (() => void), from: new THREE.Vector3(), fromHalf: 12, fromShift: 0 };
  function startTween(instant: boolean, duration = DURATION) {
    tween.from.copy(target); tween.fromHalf = half; tween.fromShift = shift; tween.fromYaw = yaw; tween.fromEl = el; tween.toYaw = goalYaw; tween.toEl = EL; tween.dive = undefined; tween.angles = false;
    for (const o of models.children) o.userData.fromOff = o.userData.off ?? 0;
    const still = instant || motion.matches; tween.dur = still ? 0 : duration; tween.t0 = performance.now(); tween.done = false; tween.snap = still; tween.waitForBakes = false;
    if (!selected || !still) for (const o of models.children) o.visible = true;
  }
  /**
   * Entering a floor: glide into it and finish on exactly the live office camera (angle, tilt, zoom), so the hand-off
   * to the office is not a cut. Without a live office (or with reduced motion) it hands off at once.
   */
  function dive(id: string, done: () => void) {
    rememberView();
    const live = host?.view?.(); const y = rowY.get(id);
    root.classList.add('diving'); root.tabIndex = -1; root.focus();
    for (const controls of root.querySelectorAll<HTMLElement>('header, aside, .building-world-labels')) controls.inert = true;
    if (!live || y === undefined || motion.matches) return done();
    root.dataset.directoryOpen = 'false'; root.dataset.controlsOpen = 'false'; zoom = 1;
    for (const ring of rings.values()) ring.visible = false;
    wanted.set(live.target.x - CX, live.target.y + y, live.target.z); needV = live.half; needH = 0;
    startTween(false, 1250); tween.angles = true; tween.toYaw = goalYaw = live.az; tween.toEl = live.el; tween.dive = done;
  }
  function rememberView() {
    const f = floors.find(f => f.id === selected); if (!f) return;
    const v: ReturnView = { id: f.id, scope: f.scope, at: Date.now(), target: [target.x, target.y - (rowY.get(f.id) ?? 0), target.z], half, yaw, zoom };
    try { sessionStorage.setItem(RETURN_KEY, JSON.stringify(v)); } catch { /* optional camera memory */ }
  }
  function cancelDive() {
    if (!root.classList.contains('diving')) return;
    root.classList.remove('diving'); tween.dive = undefined;
    for (const controls of root.querySelectorAll<HTMLElement>('header, aside, .building-world-labels')) controls.inert = false;
    if (selected && floors.some(f => f.id === selected)) select(selected, false); else fit();
    root.querySelector<HTMLButtonElement>('[data-action=close]')!.focus();
  }
  /** Vertical slide for every building part while focusing `id` (0 = in place). */
  function split(id: string | null) {
    const y = id ? rowY.get(id) ?? 0 : 0;
    for (const o of models.children) {
      const f = o.userData.floorId as string | undefined, part = o.userData.part as string | undefined;
      o.userData.toOff = !id ? 0 : f ? (f === id ? 0 : (rowY.get(f) ?? 0) > y ? SPLIT : -SPLIT) : part === 'top' ? SPLIT : -SPLIT;
    }
  }
  let width = 1, height = 1; let cabin: THREE.Mesh | undefined; let cabinTarget = 1.4; let cabinY = 2.7;
  const resize = () => { width = Math.max(1, stage.clientWidth); height = Math.max(1, stage.clientHeight); fallback?.setSize(width, height); };
  const observer = new ResizeObserver(resize); observer.observe(stage); resize();
  /** Agents drawn on a floor: shared count while online; your own floor also shows your local agents (this screen only). */
  const drawnAgents = (f: Floor) => f.isOwner && host?.agents ? Math.max(f.online ? f.agentCount : 0, host.agents()) : f.online ? f.agentCount : 0;
  const pending: { group: THREE.Group; id: string; appearance: Appearance; demand: number[]; agents: number }[] = [];
  /** The real office for one floor (shared baked copy) with its agents seated at real desks. */
  function furnish(group: THREE.Group, id: string, appearance: Appearance, demand: number[], agents: number) {
    const office = bakedOffice(appearance, demand); const shell = instantiate(office); shell.userData.floorId = id; group.add(shell);
    office.seats.slice(0, Math.min(agents, office.seats.length)).forEach((seat, n) => {
      const figure = instantiate(bakedFigure(n)); const back = new THREE.Vector3(0, 0, -.05 * PERSON).applyAxisAngle(new THREE.Vector3(0, 1, 0), seat.rot);
      figure.position.set(seat.x + back.x, 0, seat.z + back.z); figure.rotation.y = seat.rot; figure.updateMatrix(); figure.matrixAutoUpdate = false; group.add(figure);
    });
  }
  function placeLamps(centerY: number) {
    const near = [...rowY].filter(([id]) => floorLook.has(id)).sort((a, b) => Math.abs(a[1] - centerY) - Math.abs(b[1] - centerY)).slice(0, lampPool.length);
    lampPool.forEach((l, i) => { const f = near[i]; if (!f) { l.intensity = 0; return; } const look = floorLook.get(f[0])!; l.color.set(look.color); l.intensity = look.intensity; l.position.set(0, f[1] + ROOM_H - .4, 0); });
  }
  function paintSelection() {
    for (const [id, ring] of rings) ring.visible = id === selected;
    root.dataset.selectedFloor = selected ?? '';
    root.dataset.controlsOpen = String(!!selected || root.dataset.directoryOpen === 'true');
    for (const b of root.querySelectorAll<HTMLElement>('[data-floor]')) b.setAttribute('aria-pressed', String(b.dataset.floor === selected));
    const f = floors.find(f => f.id === selected);
    detail.innerHTML = f ? `<small>${T.focus}</small><h2>${esc(f.name)}</h2><p>${esc(f.ownerName)}</p><p>${f.online ? T.online : T.offline} · ${f.isOwner ? T.ownerScope : f.scope === 'presence' ? T.presence : T.active}</p>${f.scope !== 'presence' ? `<p>${f.isOwner ? drawnAgents(f) : f.agentCount} ${T.agents}</p><p>${f.areas.map(a => `${B.areaLabels[a.area]} (${a.count})`).join(' · ')}</p>` : ''}${f.moment && f.scope !== 'presence' ? `<p class="building-world-moment"><small>★ ${T.moment}</small>${esc(f.moment.title)}</p>` : ''}<button class="building-world-enter" data-action="enter">${f.isOwner ? B.own : T.enter}</button>` : `<h2>${T.choose}</h2><p>${T.chooseHint}</p>`;
  }
  function fit(resetDirectory: boolean | Event = true, instant = false, duration = DURATION) {
    if (resetDirectory !== false) root.dataset.directoryOpen = 'false';
    const tall = rowY.size * STOREY;
    selected = null; zoom = 1; wanted.set(0, Math.max(1.5, tall / 2 - 1.5), 0);
    needV = Math.max(14, tall / 2 + 10); needH = 27; placeLamps(wanted.y);
    Object.assign(sun.shadow.camera, { left: -Math.max(45, tall), right: Math.max(45, tall), top: Math.max(45, tall), bottom: -Math.max(45, tall) }); sun.shadow.camera.updateProjectionMatrix();
    cabinTarget = rowY.get(floors.find(f => f.isOwner)?.id ?? '') ?? 0;
    split(null); startTween(instant, duration); paintSelection();
  }
  function select(id: string, resetScroll = true, instant = false) {
    const index = floors.findIndex(f => f.id === id); if (index < 0) return;
    if (!rowY.has(id)) { windowStart = Math.max(0, index - 10); build(false); }
    selected = id; zoom = 1; wanted.set(0, (rowY.get(id) ?? 0) + 1.6, 0); needV = 9; needH = 21; placeLamps(wanted.y);
    if (width < 700) wanted.y -= needV * .6;
    cabinTarget = rowY.get(id) ?? 0; split(id); startTween(instant); paintSelection(); if (resetScroll) root.querySelector('aside')!.scrollTop = 0;
  }
  function build(intro = false) {
    identityDisposals.splice(0).forEach(dispose=>dispose()); pending.length = 0; models.clear(); momentLamps.length = 0; rings.clear(); rowY.clear(); floorLook.clear(); labelLayer.replaceChildren(); leaderLayer.replaceChildren();
    if (intro && returnView) { const index = floors.findIndex(f => f.id === returnView!.id && f.scope === returnView!.scope); if (index >= 24) windowStart = Math.max(0, index - 10); }
    const shown = floors.slice(windowStart, windowStart + 24); const total = shown.length * STOREY;
    // Street, plinth and lobby sized to the real footprint; trees anchor the corners.
    box(models, theme.slab, 0, -1.9, 2, W + 26, .5, D + 22).userData.part = 'base';
    box(models, '#839188', 0, -1.15, 0, W + 2.4, 1, D + 2.4).userData.part = 'base';
    box(models, '#acc1bd', 0, -1.15, D / 2 + 1.25, 3.2, .9, .12).userData.part = 'base';
    for (const x of [-(W / 2 + 4), W / 2 + 4]) for (const z of [-D / 3, D / 3]) { box(models, '#705a45', x, -.9, z, .5, 2, .5); const tree = new THREE.Mesh(leaves, mat('#597f5a')); tree.position.set(x, .9, z); tree.scale.set(1.7, 2.2, 1.7); tree.castShadow = true; models.add(tree); }
    shown.forEach((f, i) => {
      const y = i * STOREY; rowY.set(f.id, y);
      const group = new THREE.Group(); group.position.set(-CX, y, 0); group.userData.floorId = f.id; models.add(group);
      if (f.scope === 'presence') {
        // Presence-only floors stay opaque: a closed, tinted block with no interior.
        // Same L-shaped footprint as the office (the east wing stops at WING.maxZ).
        const wingW = maxX - WING.x, wingD = WING.maxZ - minZ, mainW = WING.x - minX;
        box(group, '#c3c6b5', minX + mainW / 2, -.35, 0, mainW + .8, .6, D + .8); box(group, '#344d58', minX + mainW / 2, ROOM_H / 2, 0, mainW, ROOM_H, D);
        box(group, '#c3c6b5', WING.x + wingW / 2, -.35, minZ + wingD / 2, wingW + .8, .6, wingD + .8); box(group, '#344d58', WING.x + wingW / 2, ROOM_H / 2, minZ + wingD / 2, wingW, ROOM_H, wingD);
      } else {
        const appearance = f.appearance ?? DEFAULT_APPEARANCE;
        // Desk pods follow the shared work areas (largest first), like the live office groups agents by team.
        const agents = drawnAgents(f); const byArea = f.areas.map(a => a.count).sort((a, b) => b - a);
        const demand = agents ? (byArea.length ? [...byArea.slice(0, 3), byArea.slice(3).reduce((s, n) => s + n, 0)] : [agents]) : [];
        // Cached looks appear at once; new ones bake one per frame behind a plain slab, so opening never stalls.
        if (hasBakedOffice(appearance, demand)) furnish(group, f.id, appearance, demand, agents);
        else { const slab = box(group, '#c3c6b5', CX, -.35, 0, W + .8, .6, D + .8); slab.name = 'placeholder'; pending.push({ group, id: f.id, appearance, demand, agents }); }
        const roomTheme = THEMES.find(t => t.id === appearance.theme) ?? theme;
        floorLook.set(f.id, { color: appearance.lighting === 'cool' ? '#b6deff' : appearance.lighting === 'warm' ? '#ffc080' : roomTheme.lights.lamp, intensity: Math.min(18, Math.max(3, roomTheme.lights.lampIntensity)) });
        if (f.appearance?.identity) { const decor=addFloorIdentity(group,f.appearance.identity);if(decor.userData.dispose)identityDisposals.push(decor.userData.dispose); }
      }
      if (f.moment && f.scope !== 'presence') {
        box(group, '#e8bd61', maxX - 1.6, .4, maxZ - .9, .8, .8, .55); box(group, '#fff0b8', maxX - 1.6, 1.05, maxZ - .9, .36, .5, .36);
        const light = new THREE.PointLight('#ffd67b', 2, 8, 1.5); light.position.set(maxX - 1.6, 1.5, maxZ - 1.4); group.add(light); momentLamps.push({light,at:f.moment.createdAt});
      }
      // Status strip along the street side: green while the office is online.
      box(group, f.online ? '#8dcba4' : '#bdac83', CX, -.3, maxZ + .5, W + .8, .14, .2);
      const ring = new THREE.LineSegments(edges, ringMaterial); ring.scale.set(W + 1.2, ROOM_H + .9, D + 1.2); ring.position.set(CX, ROOM_H / 2 - .2, 0); ring.visible = false; group.add(ring); rings.set(f.id, ring);
      const label = document.createElement('button'); label.dataset.floor = f.id; label.textContent = (f.moment && f.scope !== 'presence' ? '★ ' : '') + (f.isOwner ? `${T.home} · ${f.name}` : `${windowStart + i + 1} · ${f.name}`); label.title = label.textContent ?? ''; labelLayer.append(label);
    });
    // Cutaway roof over the back third leaves the front of the top office visible; the elevator shaft runs up the east side.
    box(models, '#899a8c', 0, total - .45, -D / 3, W + .8, .4, D / 3 + .8).userData.part = 'top'; box(models, '#657b75', -W / 4, total - .05, -D / 3, 2.4, .8, 1.6).userData.part = 'top';
    box(models, '#3d5459', W / 2 + 1.3, total / 2 - 1.3, -D / 4, 1.8, total + 2.6, D / 2);
    box(models, '#90ada5', W / 2 + 2.25, total / 2 - 1.3, 0, .16, total + 2.6, .16);
    cabin = box(models, '#d9bd7f', W / 2 + 1.35, cabinTarget + 1.3, -.1, 1.4, 2.6, .3);
    box(models, '#4a625d', W / 2 + 1.3, total - .1, -D / 4, 2.2, .4, D / 2 + .4);
    directory.innerHTML = [...floors].reverse().map((f, n) => `<button data-floor="${esc(f.id)}"><span>${f.isOwner ? T.home : floors.length - n}</span><div><b>${esc(f.name)}</b><small>${f.online ? T.online : T.offline}${f.scope === 'presence' ? ` · ${T.presence}` : ''}</small></div></button>`).join('');
    for (const o of models.children) { o.userData.baseY = o.position.y; o.userData.off = o.userData.fromOff = o.userData.toOff = 0; }
    if (intro && returnView) {
      const saved = returnView; returnView = undefined;
      // A remembered id is only camera metadata: the fresh authorized directory owns access and scope.
      if (floors.some(f => f.id === saved.id && f.scope === saved.scope) && rowY.has(saved.id)) {
        selected = saved.id; const y = rowY.get(saved.id)!; split(selected);
        for (const o of models.children) { o.userData.off = o.userData.toOff; if (o !== cabin) o.position.y = o.userData.baseY + o.userData.off; }
        const live = host?.view?.();
        target.set(live ? live.target.x - CX : saved.target[0], live ? live.target.y + y : saved.target[1] + y, live ? live.target.z : saved.target[2]);
        half = live?.half ?? saved.half; yaw = live?.az ?? saved.yaw; el = live?.el ?? EL; shift = 0;
        wanted.set(saved.target[0], saved.target[1] + y, saved.target[2]); zoom = saved.zoom; needV = saved.half / zoom; needH = 0; goalYaw = saved.yaw; placeLamps(y);
        startTween(!live, 1250); tween.toYaw = saved.yaw; tween.toEl = EL; tween.angles = true; tween.waitForBakes = true;
        paintSelection(); return;
      }
      try { sessionStorage.removeItem(RETURN_KEY); } catch { /* optional camera memory */ }
    }
    if (intro && !motion.matches) {
      // Open close on your own floor, then pull back to the whole building, as if stepping out of the office.
      // Start like a focused view of your floor with the rest of the building split away; it then assembles around you.
      const params = new URLSearchParams(location.search); const currentId = params.get('source') === 'shared' ? params.get('floor') : floors.find(f => f.isOwner)?.id;
      const ownId = floors.find(f => f.id === currentId)?.id ?? null, own = ownId ? rowY.get(ownId) ?? 0 : 0;
      if (ownId) { split(ownId); for (const o of models.children) { o.userData.off = o.userData.toOff; if (o !== cabin) o.position.y = o.userData.baseY + o.userData.off; } }
      const live = host?.view?.();
      target.set(live ? live.target.x - CX : 0, own + (live?.target.y ?? 1.6), live?.target.z ?? 0); half = live?.half ?? Math.max(9, 21 / Math.max(.3, width / height)); shift = 0;
      if (live) { yaw = live.az; el = live.el; }
    }
    fit(false, !intro, INTRO); tween.angles = intro; tween.waitForBakes = intro;
  }
  async function refresh() {
    if (busy || closed) return; busy = true;
    try {
      let next: Floor[]; let anonymous = false;
      try { next = (await api<{ floors: Floor[] }>('/floors')).floors; }
      catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        anonymous = true; let appearance = { ...DEFAULT_APPEARANCE, theme: settings.get('theme') };
        try { const local = JSON.parse(localStorage.getItem('office.appearance.v1') ?? 'null'); if (isAppearance(local)) appearance = { ...local, theme: settings.get('theme') }; } catch { /* defaults */ }
        next = [{ id: 'local-own', name: T.own, ownerName: T.own, isOwner: true, scope: 'owner', online: false, agentCount: 0, updatedAt: null, areas: [], appearance }];
      }
      if (closed) return;
      const previousScope = floors.find(f => f.id === selected)?.scope;
      floors = next;
      const nextSignature = JSON.stringify(next.map(({ updatedAt: _, ...f }) => f));
      status.textContent = anonymous ? T.local : `${next.length} ${T.count}${next.length > 24 ? ` · ${T.limited}` : ''}`;
      canvas.hidden = false; labelLayer.hidden = false;
      // Keep the camera continuous through routine snapshot updates, but clear revoked access or a changed sharing scope immediately.
      if (root.classList.contains('diving')) {
        if (next.some(f => f.id === selected && f.scope === previousScope)) return;
        cancelDive();
      }
      if (signature !== nextSignature) { const keep = selected; const hadFloors = signature !== ''; signature = nextSignature; if (windowStart >= next.length) windowStart = 0; build(!keep && !hadFloors); if (keep && next.some(f => f.id === keep)) select(keep, false, true); }

    } catch { if (!closed) { cancelDive(); models.clear(); rings.clear(); floors = []; selected = null; signature = ''; canvas.hidden = true; labelLayer.replaceChildren(); leaderLayer.replaceChildren(); directory.innerHTML = `<button data-action="retry">${T.retry}</button>`; detail.replaceChildren(); status.textContent = T.error; root.dataset.controlsOpen = 'true'; root.dataset.directoryOpen = 'true'; } }
    finally { busy = false; }
  }
  function close() {
    if (closed) return; if (!root.classList.contains('diving')) rememberView(); closed = true; closeCurrent = undefined; cancelAnimationFrame(raf); clearInterval(poll); observer.disconnect();
    window.removeEventListener('office-travel-cancel', cancelDive);
    window.removeEventListener('office-elevator-move', moveCabin); window.removeEventListener('office-building-close', close); window.removeEventListener('pagehide', close); window.removeEventListener('office-departure', fit);
    identityDisposals.splice(0).forEach(dispose=>dispose());
    fallback?.dispose(); sun.shadow.map?.dispose(); unit.dispose(); leaves.dispose(); edges.dispose(); ringMaterial.dispose();
    // Baked floors stay cached for the next visit (shared geometry); they are released with the page.
    // Cached toon materials and the host canvas/pipeline belong to the original office.
    canvas.hidden = false;
    if (canvasMarker) { canvasMarker.replaceWith(canvas); }
    if (originalHud && hudMarker) hudMarker.replaceWith(originalHud);
    if (import.meta.env.DEV) delete (window as unknown as { __buildingView?: unknown }).__buildingView;
    root.remove(); document.body.classList.remove('building-view-open'); previous?.focus();
  }
  if (import.meta.env.DEV) (window as unknown as { __buildingView: unknown }).__buildingView = { camera, models, selected: () => selected, pending: () => pending.length, moving: () => !tween.done || tween.waitForBakes };
  const moveCabin = (event: Event) => { const id = (event as CustomEvent<string>).detail; if (rowY.has(id)) cabinTarget = rowY.get(id)!; };
  window.addEventListener('office-travel-cancel', cancelDive);
  window.addEventListener('office-elevator-move', moveCabin);
  closeCurrent = close; window.addEventListener('office-building-close', close); window.addEventListener('pagehide', close, { once: true }); window.addEventListener('office-departure', fit);
  root.addEventListener('click', event => {
    if (root.classList.contains('diving')) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.dataset.floor) return select(button.dataset.floor);
    const action = button.dataset.action;
    if (action === 'close') close(); else if (action === 'all') fit(); else if (action === 'directory') { root.dataset.directoryOpen = String(root.dataset.directoryOpen !== 'true'); paintSelection(); } else if (action === 'retry') void refresh();
    else if (action === 'friends') { close(); openFriends(); }
    else if (action === 'enter') { const f = floors.find(f => f.id === selected); if (!f || root.classList.contains('diving')) return; const params = new URLSearchParams(location.search); const here = params.get('source') === 'shared' ? params.get('floor') === f.id : f.isOwner; dive(f.id, () => { if (here) close(); else void travelToFloor(f.isOwner ? null : f.id, { dived: true, background: (THEMES.find(t => t.id === f.appearance?.theme) ?? theme).bg }); }); }
  });
  root.addEventListener('keydown', event => { event.stopPropagation(); if (root.classList.contains('diving')) { if (event.key === 'Escape') { event.preventDefault(); cancelDive(); } else if (event.key === 'Tab') event.preventDefault(); return; } if (event.key === 'Escape') { event.preventDefault(); selected ? fit() : close(); } if (event.key === 'Tab') { const buttons = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]')].filter(b => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden'); const i = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.shiftKey && i <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); } else if (!event.shiftKey && i === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus(); } } });
  for (const kind of ['pointerdown', 'pointerup', 'pointermove', 'wheel']) root.addEventListener(kind, e => e.stopPropagation());
  const ray = new THREE.Raycaster(); let drag: { x: number; y: number; yaw: number; moved: boolean } | undefined;
  stage.addEventListener('pointerdown', e => { if (root.classList.contains('diving') || (e.target as HTMLElement).closest('button')) return; drag = { x: e.clientX, y: e.clientY, yaw: goalYaw, moved: false }; canvas.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true; if (drag.moved) goalYaw = THREE.MathUtils.clamp(drag.yaw + (e.clientX - drag.x) * .005, -.9, 1.1); });
  stage.addEventListener('pointercancel', () => { drag = undefined; });
  stage.addEventListener('pointerup', e => { const click = drag && !drag.moved; drag = undefined; if (!click || root.classList.contains('diving')) return; const r = canvas.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); for (const hit of ray.intersectObjects(models.children, true)) { let o: THREE.Object3D | null = hit.object; while (o && !o.userData.floorId) o = o.parent; if (o?.userData.floorId) { select(o.userData.floorId); break; } } });
  stage.addEventListener('wheel', e => { e.preventDefault(); if (root.classList.contains('diving')) return; zoom = THREE.MathUtils.clamp(zoom + Math.sign(e.deltaY) * .08, .65, 1.6); }, { passive: false });
  let last = performance.now(); let rendered = 0;
  function loop(now: number) {
    if (closed) return; raf = requestAnimationFrame(loop); if (tween.done && !drag && now - rendered < 30) return; rendered = now;
    const dt = Math.min(.05, (now - last) / 1000); last = now; const k = motion.matches ? 1 : 1 - Math.exp(-dt * 6);
    // The intro waits on your floor until new floors are baked, so the pull-back is not eaten by busy frames.
    if (tween.waitForBakes) { if (pending.length) tween.t0 = now; else tween.waitForBakes = false; }
    const p = tween.dur ? Math.min(1, (now - tween.t0) / tween.dur) : 1, e = ease(p), moving = p < 1;
    if (!tween.done) target.lerpVectors(tween.from, wanted, e); else if (tween.snap) target.copy(wanted); else target.lerp(wanted, k);
    // Angle and tilt follow the tween during a dive (to the office view), otherwise the drag goal and the default tilt.
    if (!tween.done && tween.angles) { yaw = tween.fromYaw + (tween.toYaw - tween.fromYaw) * e; el = tween.fromEl + (tween.toEl - tween.fromEl) * e; }
    else { yaw += (goalYaw - yaw) * k; if (!tween.dive) el += (EL - el) * k; }
    // With the side panel open on wide screens, centre the building in the space left of it.
    const aside = root.querySelector('aside'); const panel = root.dataset.controlsOpen === 'true' && width >= 900 && aside ? aside.getBoundingClientRect().width + 24 : 0;
    // Fit both the needed height and the needed width (in the space left of the panel) of the ortho view.
    const fitHalf = Math.max(needV, needH * (width / Math.max(320, width - panel)) / Math.max(.3, width / height));
    if (!tween.done) half = tween.fromHalf + (fitHalf * zoom - tween.fromHalf) * e; else if (tween.snap) half = fitHalf * zoom; else half += (fitHalf * zoom - half) * k;
    const shiftGoal = (panel / 2) * (2 * half / height); shift = !tween.done ? tween.fromShift + (shiftGoal - tween.fromShift) * e : tween.snap ? shiftGoal : shift + (shiftGoal - shift) * k;
    for (const o of models.children) { const off = o.userData.fromOff + (o.userData.toOff - o.userData.fromOff) * e; o.userData.off = off; if (o !== cabin) o.position.y = o.userData.baseY + off; }
    const finishDive = !moving && !tween.done ? tween.dive : undefined;
    if (!moving && !tween.done) { tween.done = true; tween.snap = false; for (const o of models.children) o.visible = !selected || o.userData.toOff === 0; }
    const look = target.clone().addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), shift);
    camera.position.set(look.x + Math.sin(yaw) * Math.cos(el) * 88, look.y + Math.sin(el) * 88, look.z + Math.cos(yaw) * Math.cos(el) * 88); camera.lookAt(look);
    camera.left = -half * width / height; camera.right = half * width / height; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // At most one new bake per frame (~20 ms); the placeholder slab is replaced in place.
    const next = pending.shift(); if (next && next.group.parent) { next.group.getObjectByName('placeholder')?.removeFromParent(); furnish(next.group, next.id, next.appearance, next.demand, next.agents); }
    if (cabin) { cabinY += (cabinTarget + 1.3 - cabinY) * k; cabin.position.y = cabinY + (cabin.userData.off ?? 0); }
    host?.sync(scene, sun, hemi);
    // Seen from outside, a dark theme (boiler) still needs some sky light to read as a building.
    hemi.intensity = Math.max(hemi.intensity, .9);
    // The office fog is tuned for the close interior camera; the building camera sits much further out and would be swallowed by it.
    scene.fog = null;
    // Keep the shadow camera on the part of the building being looked at.
    sun.position.copy(sunDir).multiplyScalar(90).add(target); sun.target.position.copy(target); sun.target.updateMatrixWorld();
    for (const {light,at} of momentLamps) { const age = Date.now() - at; light.intensity = !motion.matches && age >= 0 && age < 8000 ? 2 + Math.sin(age / 8000 * Math.PI) * 3 : 2; }
    if (host) host.render(scene, camera); else fallback!.render(scene, camera);
    // Measure visible controls (including nested HUD panels), not the HUD's full-screen container.
    const blocked: Rect[] = [];
    for (const node of root.querySelectorAll<HTMLElement>('header, aside, #hud .panel, #hud button, #hud input, #hud select')) {
      const style = getComputedStyle(node); const r = node.getBoundingClientRect();
      if (style.visibility !== 'hidden' && style.display !== 'none' && +style.opacity > 0 && r.width && r.height) blocked.push(r);
    }
    const leaders: string[] = [];
    for (const label of labelLayer.querySelectorAll<HTMLElement>('button')) {
      const g = models.children.find(o => o.userData.floorId === label.dataset.floor);
      const y = g ? g.position.y : rowY.get(label.dataset.floor!) ?? 0;
      const p = new THREE.Vector3(-W / 2, y + 1.4, maxZ + .5).project(camera);
      label.hidden = (!!selected && selected !== label.dataset.floor) || p.y < -.94 || p.y > .94;
      if (label.hidden) continue;
      const rect = placeLabel({ x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height }, label.offsetWidth, label.offsetHeight, { width, height }, blocked);
      label.hidden = !rect;
      if (rect) {
        label.style.left = `${rect.left}px`; label.style.top = `${rect.top}px`; blocked.push(rect);
        const ax = (p.x + 1) / 2 * width, ay = (1 - p.y) / 2 * height;
        const lx = THREE.MathUtils.clamp(ax, rect.left, rect.left + rect.width), ly = THREE.MathUtils.clamp(ay, rect.top, rect.top + rect.height);
        leaders.push(`<line x1="${lx}" y1="${ly}" x2="${ax}" y2="${ay}" />`);
      }
    }
    leaderLayer.innerHTML = leaders.join('');
    root.dataset.rendered = 'true';
    // Render the exact landing pose before restoring the live office or starting its arrival fade.
    finishDive?.();
  }
  raf = requestAnimationFrame(loop); root.querySelector<HTMLButtonElement>('[data-action=close]')!.focus();
  await refresh(); if (!closed) poll = setInterval(() => { void refresh(); }, 5000);
}
