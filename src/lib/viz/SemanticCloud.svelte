<script lang="ts">
	/**
	 * Presentational 3D cloud. Labs pass points/links/path + selection; the
	 * cloud does PCA projection and rendering, and emits clicks.
	 *
	 * Internals (rewritten from the original teardown-everything version):
	 *   • Incremental sync — meshes persist across updates; only what changed
	 *     is touched. Progressive batch embeds no longer thrash the scene.
	 *   • Animated projection — points glide to new positions (~exponential
	 *     ease) instead of teleporting, so the space reads as continuous.
	 *   • Fully themed — every material color derives from theme.scene /
	 *     theme.pointRgb; a primitive change re-colors the 3D scene live.
	 *   • One PCA pass per update, shared by positions, links and path.
	 */

	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { oklchToRgb } from '$lib/theme/palette.js';
	import { pca } from '$lib/math/pca.js';
	import { shellUI } from '$lib/shell/shellState.svelte.js';

	export type CloudVariant = 'sphere' | 'ring' | 'dot';

	export interface CloudPoint {
		id: string;
		vector: Float32Array;
		hue: number;
		label?: string;
		hoverText?: string;
		size?: number;
		variant?: CloudVariant;
		/** Always-on crosshair reticle (the active query in RAG/Classify). */
		pinned?: boolean;
		/**
		 * Not yet revealed (trajectory playback). Hidden points still feed the
		 * PCA, so the projection basis is computed over the COMPLETE set and
		 * revealed points never shift as more appear.
		 */
		hidden?: boolean;
	}
	export interface CloudLink {
		from: string;
		to: string;
		style?: 'dashed' | 'solid';
		/** Data hue (OKLCH degrees). Omit for the neutral link color. */
		hue?: number;
		opacity?: number;
	}

	interface Props {
		points: CloudPoint[];
		links?: CloudLink[];
		pathPoints?: string[]; // ordered ids forming a polyline
		/** Multiple polylines (e.g. one per token across layers). Wins over pathPoints. */
		paths?: string[][];
		selectedId?: string | null;
		/**
		 * Cinematic follow: while set, the camera's look-at target glides to
		 * this point's position each frame (orbit angle and zoom preserved, so
		 * it composes with spin and user drags). Trajectory playback points it
		 * at the newest node.
		 */
		focusId?: string | null;
		onPointClick?: (id: string) => void;
	}

	let {
		points = [],
		links = [],
		pathPoints,
		paths,
		selectedId = null,
		focusId = null,
		onPointClick
	}: Props = $props();

	const allPaths = $derived<string[][]>(
		paths ?? (pathPoints && pathPoints.length > 1 ? [pathPoints] : [])
	);

	let container = $state<HTMLDivElement | undefined>();
	let canvas = $state<HTMLCanvasElement | undefined>();
	let hoverText = $state<string | null>(null);

	let renderer: THREE.WebGLRenderer;
	let labelRenderer: CSS2DRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	let raf = 0;
	let lastT = 0;

	// ---- persistent scene nodes ----
	interface Node {
		group: THREE.Group;
		mesh: THREE.Mesh;
		mat: THREE.MeshPhongMaterial;
		marker: THREE.Sprite;
		markerMat: THREE.SpriteMaterial;
		label: CSS2DObject | null;
		labelEl: HTMLDivElement | null;
		hue: number;
		pinned: boolean;
		hidden: boolean;
		baseSize: number;
		target: THREE.Vector3;
	}
	const nodes = new Map<string, Node>();

	let dotPoints: THREE.Points | null = null;
	let dotMat: THREE.PointsMaterial | null = null;
	let dotIds: string[] = [];
	let dotHues: number[] = [];
	let dotTargets = new Float32Array(0);

	interface LinkObj {
		line: THREE.Line;
		from: string;
		to: string;
	}
	let linkObjs: LinkObj[] = [];
	let linkGroup: THREE.Group | null = null;

	let pathLines: { line: THREE.Line; ids: string[] }[] = [];

	let groundGrid: THREE.GridHelper | null = null;
	let dataCube: THREE.LineSegments | null = null;
	let cubeMat: THREE.LineBasicMaterial | null = null;
	let axisGizmo: THREE.Group | null = null;
	let fillLight: THREE.DirectionalLight | null = null;

	const raycaster = new THREE.Raycaster();
	raycaster.params.Points = { threshold: 0.05 };
	const mouse = new THREE.Vector2(2, 2);
	let hoveredId: string | null = null;

	// Shared geometry — scaled per-node, never disposed per-point.
	const SPHERE_GEO = new THREE.SphereGeometry(1, 28, 28);

	const pointsById = $derived(new Map(points.map((p) => [p.id, p])));

	// -----------------------------------------------------------------------
	// Cached sprite textures (module-scope canvases drawn once).
	// -----------------------------------------------------------------------
	let _ringTex: THREE.Texture | null = null;
	function ringTexture(): THREE.Texture {
		if (_ringTex) return _ringTex;
		const size = 128;
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d')!;
		ctx.strokeStyle = 'rgba(255,255,255,1)';
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.35)';
		ctx.lineWidth = 14;
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
		ctx.stroke();
		_ringTex = new THREE.CanvasTexture(c);
		return _ringTex;
	}

	let _reticleTex: THREE.Texture | null = null;
	function reticleTexture(): THREE.Texture {
		if (_reticleTex) return _reticleTex;
		const size = 128;
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d')!;
		const cx = size / 2;
		const r = size * 0.36;
		ctx.strokeStyle = 'rgba(255,255,255,1)';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(cx, cx, r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.95)';
		ctx.lineWidth = 3;
		const inner = r * 1.08;
		const outer = r * 1.5;
		ctx.beginPath();
		ctx.moveTo(cx, cx - inner);
		ctx.lineTo(cx, cx - outer);
		ctx.moveTo(cx, cx + inner);
		ctx.lineTo(cx, cx + outer);
		ctx.moveTo(cx - inner, cx);
		ctx.lineTo(cx - outer, cx);
		ctx.moveTo(cx + inner, cx);
		ctx.lineTo(cx + outer, cx);
		ctx.stroke();
		_reticleTex = new THREE.CanvasTexture(c);
		return _reticleTex;
	}

	let _discTex: THREE.Texture | null = null;
	function discTexture(): THREE.Texture {
		if (_discTex) return _discTex;
		const size = 64;
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d')!;
		const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);
		_discTex = new THREE.CanvasTexture(c);
		return _discTex;
	}

	// -----------------------------------------------------------------------
	// Setup / teardown
	// -----------------------------------------------------------------------
	onMount(() => {
		if (!canvas || !container) return;
		setupThree();
		const ro = new ResizeObserver(onResize);
		ro.observe(container);
		onResize();
		lastT = performance.now();
		animate();
		return () => {
			ro.disconnect();
			cancelAnimationFrame(raf);
			for (const id of [...nodes.keys()]) removeNode(id);
			disposeDots();
			disposeLinks();
			disposePath();
			renderer?.dispose();
			labelRenderer?.domElement?.parentElement?.removeChild(labelRenderer.domElement);
		};
	});

	function setupThree() {
		renderer = new THREE.WebGLRenderer({ canvas: canvas!, antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
		camera.position.set(2.4, 1.8, 2.8);
		camera.lookAt(0, 0, 0);

		labelRenderer = new CSS2DRenderer();
		labelRenderer.domElement.style.position = 'absolute';
		labelRenderer.domElement.style.inset = '0';
		labelRenderer.domElement.style.pointerEvents = 'none';
		labelRenderer.domElement.classList.add('label-layer');
		container!.appendChild(labelRenderer.domElement);

		controls = new OrbitControls(camera, canvas!);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.rotateSpeed = 0.8;
		controls.zoomSpeed = 0.7;
		controls.panSpeed = 0.6;
		controls.minDistance = 0.4;
		controls.maxDistance = 12;
		controls.autoRotateSpeed = 0.6; // one slow, cinematic revolution/minute
		controls.autoRotate = shellUI.spin;

		scene.add(new THREE.AmbientLight(0xffffff, 0.55));
		const key = new THREE.DirectionalLight(0xffffff, 0.8);
		key.position.set(2.5, 4, 2);
		scene.add(key);
		fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
		fillLight.position.set(-3, 1, -2);
		scene.add(fillLight);

		buildFurniture();

		canvas!.addEventListener('mousemove', onMouseMove);
		canvas!.addEventListener('mouseleave', () => {
			hoverText = null;
			hoveredId = null;
			mouse.set(2, 2);
		});
		canvas!.addEventListener('click', onClick);
	}

	function rgbColor([r, g, b]: [number, number, number]): THREE.Color {
		return new THREE.Color(r, g, b);
	}

	/** Ground grid, wireframe data cube, axis gizmo — all colored from theme.scene. */
	function buildFurniture() {
		const sc = theme.scene;
		// grid
		if (groundGrid) {
			scene.remove(groundGrid);
			(groundGrid.material as THREE.Material).dispose();
			groundGrid.geometry.dispose();
		}
		groundGrid = new THREE.GridHelper(4, 16, rgbColor(sc.grid), rgbColor(sc.gridCenter));
		groundGrid.position.y = -1.5;
		const gm = groundGrid.material as THREE.Material;
		gm.transparent = true;
		gm.opacity = 0.32;
		scene.add(groundGrid);

		// cube
		if (!dataCube) {
			const r = 1.5;
			const c: [number, number, number][] = [
				[-r, -r, -r], [r, -r, -r], [r, r, -r], [-r, r, -r],
				[-r, -r, r], [r, -r, r], [r, r, r], [-r, r, r]
			];
			const edges: [number, number][] = [
				[0, 1], [1, 2], [2, 3], [3, 0],
				[4, 5], [5, 6], [6, 7], [7, 4],
				[0, 4], [1, 5], [2, 6], [3, 7]
			];
			const verts: number[] = [];
			for (const [a, b] of edges) verts.push(...c[a], ...c[b]);
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
			cubeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.16 });
			dataCube = new THREE.LineSegments(geo, cubeMat);
			scene.add(dataCube);
		}
		cubeMat!.color = rgbColor(sc.cube);

		// axis gizmo
		if (axisGizmo) {
			axisGizmo.traverse((o) => {
				const obj = o as THREE.Line;
				obj.geometry?.dispose?.();
				if (obj.material) (obj.material as THREE.Material).dispose?.();
				for (const child of [...o.children]) {
					if (child instanceof CSS2DObject) {
						child.element.remove();
						o.remove(child);
					}
				}
			});
			scene.remove(axisGizmo);
		}
		const origin = new THREE.Vector3(-1.5, -1.5, -1.5);
		const len = 0.4;
		const axes: { dir: [number, number, number]; color: [number, number, number]; label: string }[] = [
			{ dir: [1, 0, 0], color: sc.axisX, label: 'x' },
			{ dir: [0, 1, 0], color: sc.axisY, label: 'y' },
			{ dir: [0, 0, 1], color: sc.axisZ, label: 'z' }
		];
		axisGizmo = new THREE.Group();
		for (const a of axes) {
			const tip = new THREE.Vector3(
				origin.x + a.dir[0] * len,
				origin.y + a.dir[1] * len,
				origin.z + a.dir[2] * len
			);
			const geo = new THREE.BufferGeometry().setFromPoints([origin.clone(), tip.clone()]);
			const mat = new THREE.LineBasicMaterial({ color: rgbColor(a.color), transparent: true, opacity: 0.7 });
			axisGizmo.add(new THREE.Line(geo, mat));
			const el = document.createElement('div');
			el.className = 'axis-tick';
			el.textContent = a.label;
			el.style.setProperty(
				'--axis-color',
				`rgb(${(a.color[0] * 255) | 0}, ${(a.color[1] * 255) | 0}, ${(a.color[2] * 255) | 0})`
			);
			const label = new CSS2DObject(el);
			label.position.copy(tip).add(new THREE.Vector3(a.dir[0] * 0.06, a.dir[1] * 0.06, a.dir[2] * 0.06));
			axisGizmo.add(label);
		}
		scene.add(axisGizmo);

		if (fillLight) fillLight.color = rgbColor(sc.fillLight);
	}

	function onResize() {
		if (!container || !renderer) return;
		const w = container.clientWidth;
		const h = container.clientHeight;
		renderer.setSize(w, h, false);
		labelRenderer?.setSize(w, h);
		camera.aspect = w / Math.max(1, h);
		camera.updateProjectionMatrix();
	}

	function onMouseMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	}

	function onClick() {
		if (hoveredId && onPointClick) onPointClick(hoveredId);
	}

	// -----------------------------------------------------------------------
	// Projection — one PCA pass shared by everything.
	// -----------------------------------------------------------------------
	type Vec3 = [number, number, number];

	function project(): Map<string, Vec3> {
		const coords = new Map<string, Vec3>();
		if (points.length === 0) return coords;
		const D = points[0]?.vector.length ?? 0;
		const valid = points.filter((p) => p.vector.length === D && D > 0);
		if (valid.length === 0) return coords;

		const res = pca(
			valid.map((p) => p.vector),
			{ k: 3, seed: 0xc0ffee }
		);
		const raw: Vec3[] = res.scores.map((s) => [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0]);

		let maxR = 0;
		for (const [x, y, z] of raw) {
			const r = Math.sqrt(x * x + y * y + z * z);
			if (r > maxR) maxR = r;
		}
		const scale = maxR > 0 ? 1.25 / maxR : 1;
		for (let i = 0; i < valid.length; i++) {
			coords.set(valid[i].id, [raw[i][0] * scale, raw[i][1] * scale, raw[i][2] * scale]);
		}
		return coords;
	}

	// -----------------------------------------------------------------------
	// Incremental node sync
	// -----------------------------------------------------------------------
	function makeNode(p: CloudPoint): Node {
		const group = new THREE.Group();
		const mat = new THREE.MeshPhongMaterial({
			specular: 0xffffff,
			shininess: 60,
			transparent: true,
			opacity: 1,
			emissiveIntensity: 0.5
		});
		const mesh = new THREE.Mesh(SPHERE_GEO, mat);
		const markerMat = new THREE.SpriteMaterial({
			map: p.pinned ? reticleTexture() : ringTexture(),
			transparent: true,
			opacity: 0,
			depthTest: false,
			depthWrite: false
		});
		const marker = new THREE.Sprite(markerMat);
		marker.userData = { halo: true };
		group.add(mesh);
		group.add(marker);
		group.userData = { pointId: p.id };
		// Grow in from nothing — the frame loop eases scale up to 1, which is
		// what makes trajectory playback read as points "arriving".
		group.scale.setScalar(0.01);
		scene.add(group);
		const node: Node = {
			group,
			mesh,
			mat,
			marker,
			markerMat,
			label: null,
			labelEl: null,
			hue: NaN,
			pinned: !p.pinned, // force first-update to apply
			hidden: false,
			baseSize: -1,
			target: new THREE.Vector3()
		};
		nodes.set(p.id, node);
		return node;
	}

	function removeNode(id: string) {
		const n = nodes.get(id);
		if (!n) return;
		n.mat.dispose();
		n.markerMat.dispose();
		if (n.label) {
			n.label.element.remove();
			n.group.remove(n.label);
		}
		scene.remove(n.group);
		nodes.delete(id);
	}

	function syncNode(p: CloudPoint, isNew: boolean, target: Vec3 | undefined) {
		const n = nodes.get(p.id) ?? makeNode(p);
		const baseSize = 0.05 * (p.size ?? 1);

		if (n.hue !== p.hue) {
			const [r, g, b] = theme.pointRgb(p.hue);
			n.mat.color.setRGB(r, g, b, THREE.SRGBColorSpace);
			n.mat.emissive.setRGB(r, g, b, THREE.SRGBColorSpace);
			n.markerMat.color.setRGB(r, g, b, THREE.SRGBColorSpace);
			if (n.labelEl) n.labelEl.style.setProperty('--slot-color', cssRgb(r, g, b));
			n.hue = p.hue;
		}
		if (n.pinned !== !!p.pinned) {
			n.pinned = !!p.pinned;
			n.markerMat.map = n.pinned ? reticleTexture() : ringTexture();
			n.markerMat.needsUpdate = true;
		}
		if (n.baseSize !== baseSize) {
			n.baseSize = baseSize;
			n.mesh.scale.setScalar(baseSize);
			const ms = baseSize * (n.pinned ? 5.5 : 4.2);
			n.marker.scale.set(ms, ms, 1);
		}

		// label
		if (p.label) {
			if (!n.label) {
				const el = document.createElement('div');
				el.className = 'cloud-slot-label';
				const [r, g, b] = theme.pointRgb(p.hue);
				el.style.setProperty('--slot-color', cssRgb(r, g, b));
				const label = new CSS2DObject(el);
				label.position.set(0, baseSize * 2 + 0.045, 0);
				n.group.add(label);
				n.label = label;
				n.labelEl = el;
				if (n.hidden) el.style.display = 'none';
			}
			if (n.labelEl!.textContent !== p.label) n.labelEl!.textContent = p.label;
		} else if (n.label) {
			n.label.element.remove();
			n.group.remove(n.label);
			n.label = null;
			n.labelEl = null;
		}

		// reveal state — hidden points keep their slot in the projection but
		// don't render; on reveal they pop in at their (already fixed) position.
		if (n.hidden !== !!p.hidden) {
			n.hidden = !!p.hidden;
			n.group.visible = !n.hidden;
			if (n.labelEl) n.labelEl.style.display = n.hidden ? 'none' : '';
			if (!n.hidden) n.group.scale.setScalar(0.01);
		}

		if (target) {
			n.target.set(target[0], target[1], target[2]);
			if (isNew || n.hidden) n.group.position.copy(n.target);
		}
	}

	function cssRgb(r: number, g: number, b: number): string {
		return `rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`;
	}

	function disposeDots() {
		if (dotPoints) {
			scene.remove(dotPoints);
			dotPoints.geometry.dispose();
			dotMat?.dispose();
			dotPoints = null;
			dotMat = null;
		}
		dotIds = [];
		dotHues = [];
		dotTargets = new Float32Array(0);
	}

	function syncDots(dots: CloudPoint[], coords: Map<string, Vec3>) {
		const sameIds =
			dots.length === dotIds.length && dots.every((d, i) => d.id === dotIds[i]);

		if (!sameIds) {
			// Rebuild geometry at the new size; start new dots at their target.
			disposeDots();
			if (dots.length === 0) return;
			dotIds = dots.map((d) => d.id);
			dotHues = dots.map((d) => d.hue);
			const positions = new Float32Array(dots.length * 3);
			const colors = new Float32Array(dots.length * 3);
			dotTargets = new Float32Array(dots.length * 3);
			for (let i = 0; i < dots.length; i++) {
				const c = coords.get(dots[i].id) ?? [0, 0, 0];
				positions[i * 3] = c[0];
				positions[i * 3 + 1] = c[1];
				positions[i * 3 + 2] = c[2];
				dotTargets.set(c, i * 3);
				const [r, g, b] = theme.dotRgb(dots[i].hue);
				colors[i * 3] = r;
				colors[i * 3 + 1] = g;
				colors[i * 3 + 2] = b;
			}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
			dotMat = new THREE.PointsMaterial({
				size: 0.13,
				sizeAttenuation: true,
				vertexColors: true,
				transparent: true,
				depthWrite: false,
				alphaTest: 0.05,
				opacity: 0.88,
				map: discTexture()
			});
			dotPoints = new THREE.Points(geo, dotMat);
			scene.add(dotPoints);
			return;
		}

		if (!dotPoints) return;
		// Same dots — update targets, and colors only where the hue changed.
		const colorAttr = dotPoints.geometry.attributes.color as THREE.BufferAttribute;
		let colorsDirty = false;
		for (let i = 0; i < dots.length; i++) {
			const c = coords.get(dots[i].id);
			if (c) dotTargets.set(c, i * 3);
			if (dotHues[i] !== dots[i].hue) {
				const [r, g, b] = theme.dotRgb(dots[i].hue);
				colorAttr.setXYZ(i, r, g, b);
				dotHues[i] = dots[i].hue;
				colorsDirty = true;
			}
		}
		if (colorsDirty) colorAttr.needsUpdate = true;
	}

	// -----------------------------------------------------------------------
	// Links + path — rebuilt on spec change, endpoints follow animation.
	// -----------------------------------------------------------------------
	function disposeLinks() {
		if (linkGroup) {
			for (const lo of linkObjs) {
				lo.line.geometry.dispose();
				(lo.line.material as THREE.Material).dispose();
			}
			scene.remove(linkGroup);
		}
		linkGroup = null;
		linkObjs = [];
	}

	function rebuildLinks() {
		disposeLinks();
		if (links.length === 0) return;
		linkGroup = new THREE.Group();
		for (const link of links) {
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
			const color = link.hue != null ? rgbColor(theme.pointRgb(link.hue)) : rgbColor(theme.scene.linkDefault);
			const opacity = link.opacity ?? 0.6;
			let line: THREE.Line;
			if (link.style === 'dashed') {
				line = new THREE.Line(
					geo,
					new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.06, gapSize: 0.05 })
				);
			} else {
				line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
			}
			// Endpoints move every frame; skip culling instead of recomputing
			// bounding spheres per frame.
			line.frustumCulled = false;
			linkGroup.add(line);
			linkObjs.push({ line, from: link.from, to: link.to });
		}
		scene.add(linkGroup);
	}

	function disposePath() {
		for (const pl of pathLines) {
			scene.remove(pl.line);
			pl.line.geometry.dispose();
			(pl.line.material as THREE.Material).dispose();
		}
		pathLines = [];
	}

	function rebuildPath() {
		disposePath();
		const opacity = allPaths.length > 6 ? 0.55 : 0.9;
		for (const ids of allPaths) {
			if (ids.length < 2) continue;
			const n = ids.length;
			const positions = new Float32Array(n * 3);
			const colors = new Float32Array(n * 3);
			const p = theme.primitives;
			const hueStart = p.accentHue + 20;
			const hueEnd = p.contrastHue - 30;
			for (let i = 0; i < n; i++) {
				const t = i / Math.max(1, n - 1);
				const hue = hueStart + (hueEnd - hueStart) * t;
				const [r, g, b] = oklchToRgb(0.78, p.accentChroma, hue);
				colors[i * 3] = r;
				colors[i * 3 + 1] = g;
				colors[i * 3 + 2] = b;
			}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
			const line = new THREE.Line(
				geo,
				new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity })
			);
			line.frustumCulled = false;
			scene.add(line);
			pathLines.push({ line, ids: [...ids] });
		}
	}

	/** Current animated position of any point id (node or dot). */
	const _tmpV = new THREE.Vector3();
	const _followV = new THREE.Vector3();
	function currentPos(id: string, out: THREE.Vector3): boolean {
		const n = nodes.get(id);
		if (n) {
			out.copy(n.group.position);
			return true;
		}
		const di = dotIds.indexOf(id);
		if (di >= 0 && dotPoints) {
			const attr = dotPoints.geometry.attributes.position as THREE.BufferAttribute;
			out.set(attr.getX(di), attr.getY(di), attr.getZ(di));
			return true;
		}
		return false;
	}

	function updateLineEndpoints() {
		for (const lo of linkObjs) {
			const attr = lo.line.geometry.attributes.position as THREE.BufferAttribute;
			if (currentPos(lo.from, _tmpV)) attr.setXYZ(0, _tmpV.x, _tmpV.y, _tmpV.z);
			if (currentPos(lo.to, _tmpV)) attr.setXYZ(1, _tmpV.x, _tmpV.y, _tmpV.z);
			attr.needsUpdate = true;
			if ((lo.line.material as THREE.LineDashedMaterial).isLineDashedMaterial) {
				lo.line.computeLineDistances();
			}
		}
		for (const pl of pathLines) {
			const attr = pl.line.geometry.attributes.position as THREE.BufferAttribute;
			for (let i = 0; i < pl.ids.length; i++) {
				if (currentPos(pl.ids[i], _tmpV)) attr.setXYZ(i, _tmpV.x, _tmpV.y, _tmpV.z);
			}
			attr.needsUpdate = true;
		}
	}

	// -----------------------------------------------------------------------
	// Selection styling
	// -----------------------------------------------------------------------
	function updateSelectionStyling() {
		for (const [id, n] of nodes) {
			const isSel = id === selectedId;
			if (n.pinned) {
				n.marker.visible = true;
				n.markerMat.opacity = isSel ? 1 : 0.85;
			} else {
				n.marker.visible = isSel;
				n.markerMat.opacity = isSel ? 0.95 : 0;
			}
			n.mesh.scale.setScalar(n.baseSize * (isSel ? 1.18 : 1));
			if (n.labelEl) n.labelEl.classList.toggle('is-selected', isSel);
		}
	}

	// -----------------------------------------------------------------------
	// Reactive sync
	// -----------------------------------------------------------------------
	$effect(() => {
		void points;
		if (!scene) return;
		const coords = project();

		const labeled = points.filter((p) => (p.variant ?? 'sphere') !== 'dot');
		const dots = points.filter((p) => (p.variant ?? 'sphere') === 'dot');

		const seen = new Set<string>();
		for (const p of labeled) {
			seen.add(p.id);
			syncNode(p, !nodes.has(p.id), coords.get(p.id));
		}
		for (const id of [...nodes.keys()]) {
			if (!seen.has(id)) removeNode(id);
		}
		syncDots(dots, coords);
		updateSelectionStyling();
	});

	$effect(() => {
		void links;
		if (!scene) return;
		rebuildLinks();
	});

	$effect(() => {
		void allPaths;
		if (!scene) return;
		rebuildPath();
	});

	$effect(() => {
		void selectedId;
		if (!scene) return;
		updateSelectionStyling();
	});

	// Global spin preference → slow camera orbit.
	$effect(() => {
		const on = shellUI.spin;
		if (controls) controls.autoRotate = on;
	});

	// Theme change → re-color everything in place.
	$effect(() => {
		void theme.scene;
		if (!scene) return;
		buildFurniture();
		for (const [id, n] of nodes) {
			const p = pointsById.get(id);
			if (!p) continue;
			const [r, g, b] = theme.pointRgb(p.hue);
			n.mat.color.setRGB(r, g, b, THREE.SRGBColorSpace);
			n.mat.emissive.setRGB(r, g, b, THREE.SRGBColorSpace);
			n.markerMat.color.setRGB(r, g, b, THREE.SRGBColorSpace);
			if (n.labelEl) n.labelEl.style.setProperty('--slot-color', cssRgb(r, g, b));
		}
		if (dotPoints) {
			const colorAttr = dotPoints.geometry.attributes.color as THREE.BufferAttribute;
			for (let i = 0; i < dotIds.length; i++) {
				const [r, g, b] = theme.dotRgb(dotHues[i]);
				colorAttr.setXYZ(i, r, g, b);
			}
			colorAttr.needsUpdate = true;
		}
		rebuildLinks();
		rebuildPath();
	});

	// -----------------------------------------------------------------------
	// Frame loop — damped controls, position animation, hover raycast.
	// -----------------------------------------------------------------------
	function animate() {
		raf = requestAnimationFrame(animate);
		const now = performance.now();
		const dt = Math.min(0.1, (now - lastT) / 1000);
		lastT = now;
		controls?.update();

		// Ease every node/dot toward its projection target; new nodes also
		// ease their scale up from ~0 (entrance pop).
		const k = 1 - Math.exp(-dt * 7);
		const kScale = 1 - Math.exp(-dt * 9);
		for (const n of nodes.values()) {
			n.group.position.lerp(n.target, k);
			const s = n.group.scale.x;
			if (s < 0.999) n.group.scale.setScalar(s + (1 - s) * kScale);
		}
		// Cinematic follow — pan the view (target + camera together) toward
		// the focused node, so each newly revealed point draws the eye without
		// disturbing the user's orbit angle or zoom.
		if (focusId) {
			const fn = nodes.get(focusId);
			if (fn && fn.group.visible) {
				_followV.copy(fn.group.position).sub(controls.target);
				const kf = 1 - Math.exp(-dt * 3.2);
				_followV.multiplyScalar(kf);
				controls.target.add(_followV);
				camera.position.add(_followV);
			}
		}

		if (dotPoints && dotTargets.length > 0) {
			const attr = dotPoints.geometry.attributes.position as THREE.BufferAttribute;
			const arr = attr.array as Float32Array;
			let moving = false;
			for (let i = 0; i < arr.length; i++) {
				const d = dotTargets[i] - arr[i];
				if (Math.abs(d) > 1e-5) {
					arr[i] += d * k;
					moving = true;
				}
			}
			if (moving) {
				attr.needsUpdate = true;
				dotPoints.geometry.computeBoundingSphere();
			}
		}
		updateLineEndpoints();

		// Hover raycast — visible meshes first, then dots.
		raycaster.setFromCamera(mouse, camera);
		let foundId: string | null = null;
		const groups: THREE.Object3D[] = [];
		for (const n of nodes.values()) {
			if (n.group.visible) groups.push(n.group);
		}
		const hits = raycaster.intersectObjects(groups, true);
		if (hits.length > 0) {
			let o: THREE.Object3D | null = hits[0].object;
			while (o && !(o.userData as { pointId?: string }).pointId) o = o.parent;
			const id = o ? (o.userData as { pointId?: string }).pointId : undefined;
			if (id) foundId = id;
		}
		if (!foundId && dotPoints) {
			const pHits = raycaster.intersectObject(dotPoints, false);
			if (pHits.length > 0) {
				const idx = pHits[0].index ?? -1;
				if (idx >= 0 && idx < dotIds.length) foundId = dotIds[idx];
			}
		}
		hoveredId = foundId;
		if (foundId) {
			const p = pointsById.get(foundId);
			hoverText = p ? (p.hoverText ?? p.label ?? foundId) : null;
		} else {
			hoverText = null;
		}
		if (canvas) canvas.style.cursor = hoveredId ? 'pointer' : 'grab';

		renderer.render(scene, camera);
		labelRenderer?.render(scene, camera);
	}
</script>

<div class="wrap" bind:this={container}>
	<canvas bind:this={canvas}></canvas>
	{#if hoverText}
		<div class="tooltip glass">
			<span class="text">{hoverText}</span>
		</div>
	{/if}
	<label class="spin-toggle no-select" title="Slowly orbit the camera around the cloud">
		<input type="checkbox" bind:checked={shellUI.spin} />
		<span>spin</span>
	</label>
	<div class="hint no-select">
		<span>drag — rotate</span>
		<span class="dot">·</span>
		<span>scroll — zoom</span>
		<span class="dot">·</span>
		<span>right-drag — pan</span>
	</div>
</div>

<style>
	.wrap {
		position: relative;
		overflow: hidden;
		width: 100%;
		height: 100%;
	}
	.wrap :global(.label-layer) {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}
	.wrap :global(.cloud-slot-label) {
		font-family: 'Inter', sans-serif;
		font-weight: 650;
		font-size: 12px;
		letter-spacing: 0.01em;
		color: var(--slot-color, #e0e0e0);
		padding: 1px 8px;
		/* No backdrop-filter here: with dozens of labels (long trajectories),
		   per-label blur regions crush the compositor. A more opaque fill
		   reads the same and costs nothing. */
		background: oklch(0.09 0.01 200 / 0.92);
		border: 1px solid color-mix(in oklab, var(--slot-color, #888) 55%, transparent);
		border-radius: 6px;
		transform: translate(-50%, calc(-50% - 14px));
		white-space: nowrap;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		text-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
		opacity: 0.9;
		transition:
			color 0.2s,
			border-color 0.2s,
			box-shadow 0.2s,
			opacity 0.2s;
		user-select: none;
		-webkit-user-select: none;
	}
	.wrap :global(.cloud-slot-label.is-selected) {
		opacity: 1;
		z-index: 2;
		box-shadow: 0 0 14px color-mix(in oklab, var(--slot-color, #888) 55%, transparent);
		border-color: var(--slot-color, #fff);
	}
	.wrap :global(.axis-tick) {
		font-family: 'Inter', sans-serif;
		font-weight: 600;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--axis-color, #888);
		transform: translate(-50%, -50%);
		pointer-events: none;
		opacity: 0.6;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
		cursor: grab;
	}
	canvas:active {
		cursor: grabbing;
	}
	.tooltip {
		position: absolute;
		bottom: 62px;
		left: 50%;
		transform: translateX(-50%);
		padding: 6px 13px;
		border-radius: 8px;
		font-size: 11.5px;
		color: var(--text-primary);
		max-width: min(560px, 70%);
		text-align: center;
		pointer-events: none;
		z-index: 22;
	}
	.spin-toggle {
		position: absolute;
		bottom: 80px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-subtle);
		cursor: pointer;
		z-index: 6;
		opacity: 0.75;
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
	}
	.spin-toggle:hover {
		opacity: 1;
		color: var(--text-muted);
	}
	.spin-toggle input {
		width: 11px;
		height: 11px;
		accent-color: var(--lab, var(--accent));
		cursor: pointer;
	}
	.spin-toggle:has(input:checked) {
		color: var(--lab, var(--accent));
		opacity: 1;
	}
	.hint {
		position: absolute;
		bottom: 58px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		pointer-events: none;
		z-index: 5;
	}
	.hint .dot {
		color: var(--border-strong);
	}
</style>
