import * as THREE from 'three';

import type { FossilId } from '../core/fossils';

/** Fossils are old bone, a warm cream, or prints and shapes in grey-brown stone. */
const BONE = 0xeadbb8;
const BONE_DARK = 0xc9b48a;
const STONE = 0x9c8f7f;
const STONE_DARK = 0x6f6458;

function part(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 }));
  mesh.castShadow = true;
  return mesh;
}

/** A flat slab of stone for a print or shape to sit in. */
function slab(radius: number): THREE.Mesh {
  return part(new THREE.CylinderGeometry(radius, radius * 1.05, 0.3, 9).translate(0, 0.15, 0), STONE);
}

/**
 * Each fossil the dig can turn up (docs/design.md §5), built from primitives like the park's other props: about 2 m
 * across, lying flat with its best side up, so it reads from the close-up camera above.
 */
export function buildFossil(id: FossilId): THREE.Group {
  const group = new THREE.Group();
  group.name = `fossil-${id}`;
  switch (id) {
    case 'trex-tooth': {
      // A big, curved, pointed tooth lying on its side: a cone bent into a gentle hook, its root a little darker.
      const tooth = part(new THREE.ConeGeometry(0.45, 2, 10, 6).translate(0, 1, 0), BONE);
      const positions = tooth.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        positions.setX(i, positions.getX(i) + 0.18 * y * y);
      }
      tooth.geometry.computeVertexNormals();
      tooth.scale.set(1, 1, 0.75);
      tooth.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.3);
      tooth.position.set(-0.9, 0.35, 0.3);
      const root = part(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 10), BONE_DARK);
      root.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.3);
      root.scale.set(1, 1, 0.75);
      root.position.set(-1.1, 0.35, 0.37);
      group.add(tooth, root);
      break;
    }
    case 'triceratops-horn': {
      // A long horn core, thick at its base and curving gently up to a blunt point, lying on its side.
      const horn = part(new THREE.ConeGeometry(0.5, 2.2, 10, 6).translate(0, 1.1, 0), BONE);
      const positions = horn.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        positions.setX(i, positions.getX(i) + 0.08 * y * y);
      }
      horn.geometry.computeVertexNormals();
      horn.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.2);
      horn.position.set(-1, 0.45, 0.2);
      // Where it broke from the skull: a rough, darker end.
      const end = part(new THREE.CylinderGeometry(0.5, 0.52, 0.12, 10), BONE_DARK);
      end.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.2);
      end.position.copy(horn.position);
      group.add(horn, end);
      break;
    }
    case 'stegosaurus-plate': {
      // A tall, rounded, kite-shaped plate lying flat, with ridges radiating from its base.
      const shape = new THREE.Shape();
      shape.moveTo(-0.7, -1);
      shape.quadraticCurveTo(-1, 0.2, 0, 1.2);
      shape.quadraticCurveTo(1, 0.2, 0.7, -1);
      shape.closePath();
      const plate = part(
        new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }),
        BONE,
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = 0.1;
      group.add(plate);
      for (const angle of [-0.4, 0, 0.4]) {
        const ridge = part(new THREE.BoxGeometry(0.06, 0.05, 1.4), BONE_DARK);
        ridge.position.set(Math.sin(angle) * 0.7, 0.33, 0.3 - Math.cos(angle) * 0.7);
        ridge.rotation.y = angle;
        group.add(ridge);
      }
      break;
    }
    case 'footprint': {
      // Three long, pointed toes spread wide from a round heel, pressed into stone, like a giant bird's.
      group.add(slab(1.3));
      for (const angle of [-0.6, 0, 0.6]) {
        const toe = part(new THREE.ConeGeometry(0.2, 0.95, 8).rotateX(Math.PI / 2), STONE_DARK);
        toe.scale.y = 0.35;
        toe.position.set(Math.sin(angle) * 0.7, 0.31, 0.15 - Math.cos(angle) * 0.7);
        toe.rotation.y = -angle;
        group.add(toe);
      }
      const heel = part(new THREE.SphereGeometry(0.34, 10, 6), STONE_DARK);
      heel.scale.y = 0.15;
      heel.position.set(0, 0.31, 0.35);
      group.add(heel);
      break;
    }
    case 'ammonite': {
      // A coiled shell on stone: a tube winding inwards, thinning as it goes, with ribs across it.
      group.add(slab(1.3));
      const turns = 2.5;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const angle = t * turns * 2 * Math.PI;
        const radius = 1 - 0.85 * t;
        points.push(new THREE.Vector3(radius * Math.cos(angle), 0.45, radius * Math.sin(angle)));
      }
      const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.2, 8);
      // Thinner towards the middle, like the real shell's newest whorl outside and oldest in the centre.
      const positions = coil.getAttribute('position');
      const centre = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        const along = Math.floor(i / 9) / 80;
        const point = new THREE.CatmullRomCurve3(points).getPointAt(Math.min(1, along), centre);
        const scale = 1 - 0.7 * along;
        positions.setXYZ(
          i,
          point.x + (positions.getX(i) - point.x) * scale,
          point.y + (positions.getY(i) - point.y) * scale,
          point.z + (positions.getZ(i) - point.z) * scale,
        );
      }
      coil.computeVertexNormals();
      group.add(part(coil, 0xc9a46a));
      break;
    }
    case 'trilobite': {
      // An oval in three lobes, nose to tail: a rounded head shield, a ribbed body and a little tail, on stone.
      group.add(slab(1.3));
      const head = part(new THREE.SphereGeometry(1, 14, 8), STONE_DARK);
      head.scale.set(0.75, 0.2, 0.42);
      head.position.set(0, 0.3, -0.42);
      group.add(head);
      for (let i = 0; i < 6; i++) {
        const width = 1.25 - i * 0.12;
        const rib = part(new THREE.CapsuleGeometry(0.09, width, 3, 6).rotateZ(Math.PI / 2), STONE_DARK);
        rib.scale.y = 0.6;
        rib.position.set(0, 0.36, -0.15 + i * 0.2);
        group.add(rib);
      }
      // The raised ridge down its middle that gives it its three lobes.
      const ridge = part(new THREE.CapsuleGeometry(0.14, 1.1, 3, 6).rotateX(Math.PI / 2), 0x5a5048);
      ridge.scale.x = 1;
      ridge.position.set(0, 0.42, 0.2);
      group.add(ridge);
      break;
    }
    case 'archaeopteryx-feather': {
      // A long feather pressed flat into pale stone: a shaft with a vane either side, narrower on one side.
      const stone = slab(1.3);
      (stone.material as THREE.MeshStandardMaterial).color.set(0xd8cdb6);
      group.add(stone);
      const shaft = part(new THREE.BoxGeometry(0.06, 0.06, 2), STONE_DARK);
      shaft.position.set(0, 0.33, 0);
      shaft.rotation.y = 0.5;
      group.add(shaft);
      for (const [side, width] of [
        [-1, 0.32],
        [1, 0.2],
      ] as const) {
        const vane = part(new THREE.SphereGeometry(1, 12, 6), 0x7d6f5f);
        vane.scale.set(width, 0.03, 0.9);
        vane.position.set(side * width * 0.9, 0.32, 0.05);
        const holder = new THREE.Group();
        holder.rotation.y = 0.5;
        holder.add(vane);
        group.add(holder);
      }
      break;
    }
    case 'megalodon-tooth': {
      // A huge, flat, triangular shark's tooth, dark and glossy, with a paler root along its top.
      const shape = new THREE.Shape();
      shape.moveTo(-1, 0.6);
      shape.quadraticCurveTo(0, 0.9, 1, 0.6);
      shape.quadraticCurveTo(0.55, -0.2, 0, -1.3);
      shape.quadraticCurveTo(-0.55, -0.2, -1, 0.6);
      const tooth = part(
        new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08 }),
        0x55555e,
      );
      tooth.rotation.x = -Math.PI / 2;
      tooth.position.y = 0.15;
      const root = part(new THREE.BoxGeometry(1.9, 0.36, 0.35), 0x9a8a72);
      root.position.set(0, 0.25, -0.68);
      group.add(tooth, root);
      break;
    }
  }
  return group;
}
