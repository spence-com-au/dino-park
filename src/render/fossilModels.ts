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
  }
  return group;
}
