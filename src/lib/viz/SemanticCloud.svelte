<script lang="ts">
	/**
	 * Presentational 3D cloud. Each lab passes its own points/links/mode.
	 * The cloud does projection + rendering and emits click/hover events.
	 *
	 *   <SemanticCloud
	 *     points={[{ id, vector, hue, label, variant }]}
	 *     links={[{ from, to, style, color }]}
	 *     mode='pca' | 'plane' | 'trajectory'
	 *     planeAxis={{ aId, bId }}
	 *     pathPoints={[id1, id2, id3, ...]}
	 *     selectedId={...}
	 *     onPointClick={fn}
	 *   />
	 */

	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { oklchToRgb } from '$lib/theme/palette.js';
	import { pca } from '$lib/math/pca.js';

	export type CloudVariant = 'sphere' | 'ring' | 'dot';
	export type CloudMode = 'pca' | 'plane' | 'trajectory';

	export interface CloudPoint {
		id: string;
		vector: Float32Array;
		hue: number;
		label?: string;
		hoverText?: string;
		size?: number;
		variant?: CloudVariant;
		group?: string;
	}
	export interface CloudLink {
		from: string;
		to: string;
		style?: 'dashed' | 'solid';
		color?: number; // 0xRRGGBB
		opacity?: number;
	}

	interface Props {
		points: CloudPoint[];
		links?: CloudLink[];
		mode?: CloudMode;
		planeAxis?: { aId: string; bId: string };
		pathPoints?: string[]; // ordered ids forming a path (trajectory mode)
		selectedId?: string | null;
		hideGrid?: boolean;
		onPointClick?: (id: string) => void;
	}

	let {
		points = [],
		links = [],
		mode = 'pca',
		planeAxis,
		pathPoints,
		selectedId = null,
		hideGrid = false,
		onPointClick
	}: Props = $props();

	let container = $state<HTMLDivElement | undefined>();
	let canvas = $state<HTMLCanvasElement | undefined>();
	let hoverText = $state<string | null>(null);

	let renderer: THREE.WebGLRenderer;
	let labelRenderer: CSS2DRenderer;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	let raf = 0;

	// scene groups
	let pointMeshes = new Map<string, THREE.Object3D>(); // by point id
	let dotPoints: THREE.Points | null = null;
	let dotIds: string[] = [];
	let linkGroup: THREE.Group | null = null;
	let pathLine: THREE.Line | null = null;
	let groundGrid: THREE.GridHelper | null = null;
	let dataCube: THREE.LineSegments | null = null;
	let axisGizmo: THREE.Group | null = null;
	let ambient: THREE.AmbientLight | null = null;
	let dirLight: THREE.DirectionalLight | null = null;

	const raycaster = new THREE.Raycaster();
	raycaster.params.Points = { threshold: 0.04 };
	const mouse = new THREE.Vector2(2, 2);

	let hoveredId: string | null = null;

	onMount(() => {
		if (!canvas || !container) return;
		setupThree();
		const ro = new ResizeObserver(onResize);
		ro.observe(container);
		onResize();
		animate();
		return () => {
			ro.disconnect();
			cancelAnimationFrame(raf);
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

		// Subtle three-point lighting so spheres read as actual 3D objects
		// rather than flat discs. The intensities are low enough that hue still
		// dominates and labels stay readable.
		ambient = new THREE.AmbientLight(0xffffff, 0.55);
		scene.add(ambient);
		dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
		dirLight.position.set(2.5, 4, 2);
		scene.add(dirLight);
		const fill = new THREE.DirectionalLight(0x6a86c8, 0.25);
		fill.position.set(-3, 1, -2);
		scene.add(fill);

		buildGround();
		buildDataCube();
		buildAxisGizmo();

		canvas!.addEventListener('mousemove', onMouseMove);
		canvas!.addEventListener('mouseleave', () => {
			hoverText = null;
			hoveredId = null;
			mouse.set(2, 2);
		});
		canvas!.addEventListener('click', onClick);
	}

	function buildGround() {
		if (groundGrid) {
			scene.remove(groundGrid);
			(groundGrid.material as THREE.Material).dispose();
			groundGrid.geometry.dispose();
			groundGrid = null;
		}
		if (hideGrid) return;
		const grid = new THREE.GridHelper(4, 16, 0x2a3038, 0x1a1f25);
		grid.position.y = -1.5;
		(grid.material as THREE.Material).transparent = true;
		(grid.material as THREE.Material).opacity = 0.35;
		groundGrid = grid;
		scene.add(grid);
	}

	// A very faint wireframe cube at the data extents. Reads as a "stage" for
	// the data, gives the eye three lines of perspective for free, and stops
	// the scene from feeling like it's floating in featureless space.
	function buildDataCube() {
		if (dataCube) {
			scene.remove(dataCube);
			dataCube.geometry.dispose();
			(dataCube.material as THREE.Material).dispose();
		}
		const r = 1.5;
		const verts: number[] = [];
		const c: [number, number, number][] = [
			[-r, -r, -r],
			[r, -r, -r],
			[r, r, -r],
			[-r, r, -r],
			[-r, -r, r],
			[r, -r, r],
			[r, r, r],
			[-r, r, r]
		];
		const edges: [number, number][] = [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[4, 5],
			[5, 6],
			[6, 7],
			[7, 4],
			[0, 4],
			[1, 5],
			[2, 6],
			[3, 7]
		];
		for (const [a, b] of edges) {
			verts.push(...c[a], ...c[b]);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
		const mat = new THREE.LineBasicMaterial({
			color: 0x4a5260,
			transparent: true,
			opacity: 0.18
		});
		dataCube = new THREE.LineSegments(geo, mat);
		scene.add(dataCube);
	}

	// Axis gizmo at the back-bottom-left corner of the cube — three short
	// colored arrows pointing along +X / +Y / +Z so users can orient the
	// scene at a glance.
	function buildAxisGizmo() {
		if (axisGizmo) {
			axisGizmo.traverse((o: THREE.Object3D) => {
				const obj = o as THREE.Mesh & THREE.Line;
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
		const axes: { dir: [number, number, number]; color: number; label: string }[] = [
			{ dir: [1, 0, 0], color: 0xc26b6b, label: 'x' },
			{ dir: [0, 1, 0], color: 0x6dbf85, label: 'y' },
			{ dir: [0, 0, 1], color: 0x7188c8, label: 'z' }
		];
		const group = new THREE.Group();
		for (const a of axes) {
			const tip = new THREE.Vector3(origin.x + a.dir[0] * len, origin.y + a.dir[1] * len, origin.z + a.dir[2] * len);
			const geo = new THREE.BufferGeometry().setFromPoints([origin.clone(), tip.clone()]);
			const mat = new THREE.LineBasicMaterial({
				color: a.color,
				transparent: true,
				opacity: 0.7
			});
			group.add(new THREE.Line(geo, mat));

			const el = document.createElement('div');
			el.className = 'axis-tick';
			el.textContent = a.label;
			el.style.setProperty('--axis-color', `#${a.color.toString(16).padStart(6, '0')}`);
			const label = new CSS2DObject(el);
			label.position.copy(tip).add(new THREE.Vector3(a.dir[0] * 0.06, a.dir[1] * 0.06, a.dir[2] * 0.06));
			group.add(label);
		}
		axisGizmo = group;
		scene.add(group);
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

	function animate() {
		raf = requestAnimationFrame(animate);
		controls?.update();

		// hover detection
		raycaster.setFromCamera(mouse, camera);
		let foundId: string | null = null;
		let foundText: string | null = null;

		// sphere/ring meshes first (they're the protagonists)
		const meshObjects: THREE.Object3D[] = [];
		for (const m of pointMeshes.values()) meshObjects.push(m);
		const hits = raycaster.intersectObjects(meshObjects, true);
		if (hits.length > 0) {
			let o: THREE.Object3D | null = hits[0].object;
			while (o && !(o.userData as { pointId?: string }).pointId) o = o.parent;
			const id = o ? (o.userData as { pointId?: string }).pointId : undefined;
			if (id) {
				foundId = id;
				const p = points.find((p) => p.id === id);
				if (p) foundText = p.hoverText ?? p.label ?? id;
			}
		}

		// then dot points (corpus)
		if (!foundId && dotPoints) {
			const pHits = raycaster.intersectObject(dotPoints, false);
			if (pHits.length > 0) {
				const idx = pHits[0].index ?? -1;
				const id = dotIds[idx];
				const p = points.find((p) => p.id === id);
				if (p) {
					foundId = id;
					foundText = p.hoverText ?? p.label ?? id;
				}
			}
		}

		hoveredId = foundId;
		hoverText = foundText;

		if (canvas) canvas.style.cursor = hoveredId ? 'pointer' : 'grab';

		renderer.render(scene, camera);
		labelRenderer?.render(scene, camera);
	}

	// -----------------------------------------------------------------------
	// Projection
	// -----------------------------------------------------------------------
	type Vec3 = [number, number, number];

	function project(): Map<string, Vec3> {
		const coords = new Map<string, Vec3>();
		if (points.length === 0) return coords;

		// Filter to points whose vectors share a common dim (drop mismatched).
		const vectors = points.map((p) => p.vector);
		const D = vectors[0]?.length ?? 0;
		const valid = points.filter((p) => p.vector.length === D);
		if (valid.length === 0) return coords;

		let raw: Vec3[];

		if (mode === 'plane' && planeAxis) {
			const a = valid.find((p) => p.id === planeAxis.aId)?.vector;
			const b = valid.find((p) => p.id === planeAxis.bId)?.vector;
			if (a && b) {
				raw = projectPlane(valid.map((p) => p.vector), a, b);
			} else {
				raw = projectPCA(valid.map((p) => p.vector));
			}
		} else {
			raw = projectPCA(valid.map((p) => p.vector));
		}

		// Normalize so positions fit roughly inside the wireframe data cube.
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

	function projectPCA(vecs: Float32Array[]): Vec3[] {
		if (vecs.length === 0) return [];
		const res = pca(vecs, { k: 3, seed: 0xc0ffee });
		return res.scores.map((s) => [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0]);
	}

	function projectPlane(vecs: Float32Array[], a: Float32Array, b: Float32Array): Vec3[] {
		const D = vecs[0]?.length ?? 0;
		if (D === 0) return vecs.map(() => [0, 0, 0]);
		const center = new Float32Array(D);
		const u = new Float32Array(D);
		let un = 0;
		for (let i = 0; i < D; i++) {
			center[i] = (a[i] + b[i]) * 0.5;
			u[i] = b[i] - a[i];
			un += u[i] * u[i];
		}
		un = Math.sqrt(un);
		if (un === 0) return vecs.map(() => [0, 0, 0]);
		for (let i = 0; i < D; i++) u[i] /= un;

		const xs: number[] = new Array(vecs.length);
		const residuals: Float32Array[] = new Array(vecs.length);
		for (let i = 0; i < vecs.length; i++) {
			const v = vecs[i];
			let xc = 0;
			for (let d = 0; d < D; d++) xc += (v[d] - center[d]) * u[d];
			xs[i] = xc;
			const r = new Float32Array(D);
			for (let d = 0; d < D; d++) r[d] = v[d] - center[d] - xc * u[d];
			residuals[i] = r;
		}
		const yPca = pca(residuals, { k: 1, seed: 0xc0ffee });
		return vecs.map((_, i) => [xs[i], yPca.scores[i]?.[0] ?? 0, 0] as Vec3);
	}

	// -----------------------------------------------------------------------
	// Scene rebuild
	// -----------------------------------------------------------------------
	function rebuildAll() {
		if (!scene) return;
		rebuildMeshes();
		rebuildDots();
		const coords = project();
		applyPositions(coords);
		rebuildLinks(coords);
		rebuildPath(coords);
		updateSelectionStyling();
	}

	function rebuildMeshes() {
		// dispose old
		for (const obj of pointMeshes.values()) {
			obj.traverse((o) => {
				const m = o as THREE.Mesh;
				m.geometry?.dispose?.();
				if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
				else m.material?.dispose?.();
				for (const child of [...o.children]) {
					if (child instanceof CSS2DObject) {
						child.element.remove();
						o.remove(child);
					}
				}
			});
			scene.remove(obj);
		}
		pointMeshes.clear();

		const labelOffsets: Vec3[] = [
			[0, 0.13, 0],
			[0.14, 0.09, 0],
			[-0.14, 0.09, 0],
			[0.14, -0.06, 0],
			[-0.14, -0.06, 0],
			[0, -0.12, 0]
		];
		let labeledIdx = 0;

		for (const p of points) {
			const variant = p.variant ?? 'sphere';
			if (variant === 'dot') continue; // dots are batched as Points

			const [r, g, b] = oklchToRgb(0.78, 0.2, p.hue);
			const colorCss = `rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`;
			const baseSize = 0.05 * (p.size ?? 1);

			let obj: THREE.Object3D;
			if (variant === 'ring') {
				const group = new THREE.Group();
				const torus = new THREE.Mesh(
					new THREE.TorusGeometry(baseSize * 1.4, baseSize * 0.22, 12, 36),
					new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: 0.85 })
				);
				const core = new THREE.Mesh(
					new THREE.SphereGeometry(baseSize * 0.5, 20, 20),
					new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: 0.7 })
				);
				group.add(torus);
				group.add(core);
				obj = group;
			} else {
				// Phong (not Basic) so the sphere catches the directional light
				// and reads as a real 3D object. emissive keeps the chosen hue
				// dominant even in dim regions of the scene.
				const mat = new THREE.MeshPhongMaterial({
					color: new THREE.Color(r, g, b),
					emissive: new THREE.Color(r, g, b),
					emissiveIntensity: 0.45,
					specular: 0xffffff,
					shininess: 60,
					transparent: true,
					opacity: 1
				});
				obj = new THREE.Mesh(new THREE.SphereGeometry(baseSize, 32, 32), mat);

				// Selection ring: a thin Sprite that always faces the camera —
				// no halo sphere that rotates with the scene. Toggled visible
				// by updateSelectionStyling().
				const ringMat = new THREE.SpriteMaterial({
					map: getRingTexture(),
					color: new THREE.Color(r, g, b),
					transparent: true,
					opacity: 0.9,
					depthTest: false,
					depthWrite: false
				});
				const ring = new THREE.Sprite(ringMat);
				const ringSize = baseSize * 4.2;
				ring.scale.set(ringSize, ringSize, 1);
				ring.visible = false;
				ring.userData = { halo: true };
				obj.add(ring);
			}

			obj.userData = { pointId: p.id };

			if (p.label) {
				const el = document.createElement('div');
				el.className = 'cloud-slot-label';
				el.textContent = p.label;
				el.style.setProperty('--slot-color', colorCss);
				const label = new CSS2DObject(el);
				const off = labelOffsets[labeledIdx % labelOffsets.length];
				const dy = baseSize * 2 + 0.04;
				label.position.set(off[0], off[1] + (dy - 0.13), off[2]);
				obj.add(label);
				labeledIdx++;
			}

			scene.add(obj);
			pointMeshes.set(p.id, obj);
		}
	}

	function rebuildDots() {
		if (dotPoints) {
			scene.remove(dotPoints);
			dotPoints.geometry.dispose();
			(dotPoints.material as THREE.Material).dispose();
			dotPoints = null;
		}
		dotIds = [];
		const dots = points.filter((p) => (p.variant ?? 'sphere') === 'dot');
		if (dots.length === 0) return;

		const positions = new Float32Array(dots.length * 3);
		const colors = new Float32Array(dots.length * 3);
		for (let i = 0; i < dots.length; i++) {
			const [r, g, b] = oklchToRgb(0.55, 0.09, dots[i].hue);
			colors[i * 3] = r;
			colors[i * 3 + 1] = g;
			colors[i * 3 + 2] = b;
			dotIds.push(dots[i].id);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		// Bigger dots so they actually read as embeddings instead of dust
		// — PointsMaterial units are different from Mesh units and at typical
		// camera distance, 0.075 was still 4-6 px. 0.13 gives them real weight
		// against the lit slot spheres while staying clearly subordinate.
		const mat = new THREE.PointsMaterial({
			size: 0.13,
			sizeAttenuation: true,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			alphaTest: 0.05,
			opacity: 0.88,
			map: makeDiscTexture()
		});
		dotPoints = new THREE.Points(geo, mat);
		scene.add(dotPoints);
	}

	function applyPositions(coords: Map<string, Vec3>) {
		for (const [id, obj] of pointMeshes) {
			const c = coords.get(id);
			if (c) obj.position.set(c[0], c[1], c[2]);
		}
		if (dotPoints) {
			const attr = dotPoints.geometry.attributes.position as THREE.BufferAttribute;
			for (let i = 0; i < dotIds.length; i++) {
				const c = coords.get(dotIds[i]);
				if (c) attr.setXYZ(i, c[0], c[1], c[2]);
				else attr.setXYZ(i, 0, 0, 0);
			}
			attr.needsUpdate = true;
		}
	}

	function rebuildLinks(coords: Map<string, Vec3>) {
		if (linkGroup) {
			linkGroup.traverse((o) => {
				const l = o as THREE.Line;
				l.geometry?.dispose?.();
				if (l.material) (l.material as THREE.Material).dispose();
			});
			scene.remove(linkGroup);
		}
		linkGroup = new THREE.Group();
		for (const link of links) {
			const a = coords.get(link.from);
			const b = coords.get(link.to);
			if (!a || !b) continue;
			const geo = new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(...a),
				new THREE.Vector3(...b)
			]);
			const color = link.color ?? 0xa3a8b0;
			const opacity = link.opacity ?? 0.6;
			if (link.style === 'dashed') {
				const mat = new THREE.LineDashedMaterial({
					color,
					transparent: true,
					opacity,
					dashSize: 0.06,
					gapSize: 0.05
				});
				const line = new THREE.Line(geo, mat);
				line.computeLineDistances();
				linkGroup.add(line);
			} else {
				const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
				linkGroup.add(new THREE.Line(geo, mat));
			}
		}
		scene.add(linkGroup);
	}

	function rebuildPath(coords: Map<string, Vec3>) {
		if (pathLine) {
			scene.remove(pathLine);
			pathLine.geometry.dispose();
			(pathLine.material as THREE.Material).dispose();
			pathLine = null;
		}
		if (!pathPoints || pathPoints.length < 2) return;

		const positions: number[] = [];
		const colors: number[] = [];
		const n = pathPoints.length;
		for (let i = 0; i < n; i++) {
			const c = coords.get(pathPoints[i]);
			if (!c) continue;
			positions.push(c[0], c[1], c[2]);
			// cool → warm temperature gradient along the path
			const t = i / Math.max(1, n - 1);
			const hue = 220 - 220 * t; // 220 (blue) → 0 (red)
			const [r, g, b] = oklchToRgb(0.78, 0.18, hue);
			colors.push(r, g, b);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		const mat = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.9,
			linewidth: 2
		});
		pathLine = new THREE.Line(geo, mat);
		scene.add(pathLine);
	}

	function updateSelectionStyling() {
		for (const [id, obj] of pointMeshes) {
			const isSel = id === selectedId;
			let ring: THREE.Sprite | undefined;
			let labelEl: HTMLElement | undefined;
			for (const c of obj.children) {
				if ((c.userData as { halo?: boolean }).halo) ring = c as THREE.Sprite;
				if (c instanceof CSS2DObject) labelEl = c.element as HTMLElement;
			}
			if (ring) {
				ring.visible = isSel;
				(ring.material as THREE.SpriteMaterial).opacity = isSel ? 0.9 : 0;
			}
			obj.scale.setScalar(isSel ? 1.18 : 1);
			if (labelEl) labelEl.classList.toggle('is-selected', isSel);
		}
	}

	// Reactive rebuilds — Svelte 5 effect on prop changes.
	$effect(() => {
		void points;
		void mode;
		void planeAxis;
		if (!scene) return;
		rebuildAll();
	});
	$effect(() => {
		void links;
		void pathPoints;
		if (!scene) return;
		const coords = project();
		rebuildLinks(coords);
		rebuildPath(coords);
	});
	$effect(() => {
		void selectedId;
		if (!scene) return;
		updateSelectionStyling();
	});
	$effect(() => {
		void hideGrid;
		if (!scene) return;
		buildGround();
	});
	$effect(() => {
		void theme.tokens;
	});

	// Cached ring texture for selection sprites — thin stroke, soft edge.
	let _ringTex: THREE.Texture | null = null;
	function getRingTexture(): THREE.Texture {
		if (_ringTex) return _ringTex;
		const size = 128;
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d')!;
		ctx.clearRect(0, 0, size, size);
		const cx = size / 2;
		const cy = size / 2;
		// Outer ring with a soft anti-aliased edge.
		ctx.strokeStyle = 'rgba(255,255,255,1)';
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
		ctx.stroke();
		// Inner faint glow ring for some depth.
		ctx.strokeStyle = 'rgba(255,255,255,0.35)';
		ctx.lineWidth = 14;
		ctx.beginPath();
		ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
		ctx.stroke();
		const tex = new THREE.CanvasTexture(c);
		tex.needsUpdate = true;
		_ringTex = tex;
		return tex;
	}

	function makeDiscTexture(): THREE.Texture {
		const size = 64;
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const ctx = c.getContext('2d')!;
		const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);
		const tex = new THREE.CanvasTexture(c);
		tex.needsUpdate = true;
		return tex;
	}
</script>

<div class="wrap glass" bind:this={container}>
	<canvas bind:this={canvas}></canvas>
	{#if hoverText}
		<div class="tooltip">
			<span class="text">{hoverText}</span>
		</div>
	{/if}
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
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.wrap :global(.label-layer) {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}
	.wrap :global(.cloud-slot-label) {
		font-family: 'Inter', sans-serif;
		font-weight: 700;
		font-size: 12px;
		letter-spacing: 0.01em;
		color: var(--slot-color, #e0e0e0);
		padding: 1px 7px;
		background: rgba(10, 12, 16, 0.8);
		border: 1px solid color-mix(in oklab, var(--slot-color, #888) 55%, transparent);
		border-radius: 4px;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		transform: translate(-50%, -50%);
		white-space: nowrap;
		text-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
		opacity: 0.88;
		transition:
			color 0.2s,
			border-color 0.2s,
			box-shadow 0.2s,
			opacity 0.2s,
			font-size 0.2s;
		user-select: none;
		-webkit-user-select: none;
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
		opacity: 0.65;
	}
	.wrap :global(.cloud-slot-label.is-selected) {
		font-size: 13px;
		opacity: 1;
		z-index: 2;
		box-shadow: 0 0 14px color-mix(in oklab, var(--slot-color, #888) 55%, transparent);
		border-color: var(--slot-color, #fff);
	}
	canvas {
		flex: 1;
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
		bottom: 36px;
		left: 50%;
		transform: translateX(-50%);
		padding: 6px 12px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: 5px;
		font-size: 11px;
		color: var(--text-primary);
		max-width: 80%;
		text-align: center;
		backdrop-filter: blur(10px);
		pointer-events: none;
		z-index: 2;
	}
	.hint {
		position: absolute;
		bottom: 10px;
		right: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		pointer-events: none;
	}
	.hint .dot {
		color: var(--border-strong);
	}
</style>
