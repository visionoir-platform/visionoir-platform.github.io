import { BufferGeometry, Float32BufferAttribute } from 'three';

// Copy small groups of adjacent source triangles. Their shared pivot lets each
// piece lift as a solid surface while keeping the original texture and folds.
export function makeFlakeGeometry(source, mobile) {
  const { position, normal, uv } = source.attributes;
  const cells = new Map();
  const grid = 13;
  const index = source.index;
  const count = index ? index.count : position.count;
  for (let face = 0; face < count; face += 3) {
    const a = index ? index.getX(face) : face;
    const b = index ? index.getX(face + 1) : face + 1;
    const c = index ? index.getX(face + 2) : face + 2;
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    // Stay below the collar on every vertex, including the coarser mobile LOD.
    if (x <= .12 || y < -.70 || Math.max(position.getY(a), position.getY(b), position.getY(c)) >= .39) continue;
    const cx = Math.floor(x * grid), cy = Math.floor(y * grid), cz = Math.floor(z * grid);
    const key = (cx + 32) * 4096 + (cy + 32) * 64 + cz + 32;
    // Stable spatial sampling across LODs and visits. Keep the intervening dust visible.
    let hash = Math.imul(key ^ (key >>> 13), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
    if (hash % 4 !== 0) continue;
    let cell = cells.get(key);
    if (!cell) {
      cell = { triangles: [], hash, pivot: [(cx + .5) / grid, (cy + .5) / grid, (cz + .5) / grid] };
      cells.set(key, cell);
    }
    cell.triangles.push(a, b, c);
  }

  const positions = [], normals = [], uvs = [], origins = [];
  const vertexBudget = 3 * (mobile ? 1100 : 3500);
  // Budget complete patches so a crowded cell cannot split a flake in half.
  for (const cell of [...cells.values()].sort((a, b) => a.hash - b.hash)) {
    if (positions.length / 3 + cell.triangles.length > vertexBudget) continue;
    const seed = cell.hash / 4294967296;
    for (const i of cell.triangles) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
      origins.push(...cell.pivot, seed);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('flakeOrigin', new Float32BufferAttribute(origins, 4));
  return geometry;
}
