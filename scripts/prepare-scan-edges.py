"""Bake distances from open scan boundaries; source GLB remains unchanged.

python3 scripts/prepare-scan-edges.py
UV/normal splits are welded by position for the boundary calculation only.
"""
import heapq
import json
import math
import struct
from array import array
from pathlib import Path

root = Path(__file__).resolve().parent.parent
raw = (root / 'assets/all-scans.glb').read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_size])
binary = memoryview(raw)[28 + json_size:]


def accessor(index):
    value = gltf['accessors'][index]
    view = gltf['bufferViews'][value['bufferView']]
    start = view.get('byteOffset', 0) + value.get('byteOffset', 0)
    codes = {5126: 'f', 5125: 'I', 5123: 'H'}
    result = array(codes[value['componentType']])
    width = {'VEC3': 3, 'SCALAR': 1}[value['type']]
    assert 'byteStride' not in view, 'Expected tightly packed exported attributes'
    result.frombytes(binary[start:start + value['count'] * width * result.itemsize])
    return result


radius = .28
output = bytearray()
metadata = {'radius': radius, 'meshes': []}
for mesh in gltf['meshes']:
    primitive = mesh['primitives'][0]
    positions = accessor(primitive['attributes']['POSITION'])
    indices = accessor(primitive['indices'])
    unique, points, remap = {}, [], []
    for i in range(0, len(positions), 3):
        point = tuple(positions[i:i + 3])
        key = tuple(round(v * 100000) for v in point)
        if key not in unique:
            unique[key] = len(points)
            points.append(point)
        remap.append(unique[key])
    edge_counts, removed = {}, []
    for i in range(0, len(indices), 3):
        a, b, c = (remap[indices[i + j]] for j in range(3))
        p, q, r = points[a], points[b], points[c]
        lengths = [math.dist(p, q), math.dist(q, r), math.dist(r, p)]
        u, v = [q[j] - p[j] for j in range(3)], [r[j] - p[j] for j in range(3)]
        cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        altitude = math.sqrt(sum(x*x for x in cross)) / max(max(lengths), 1e-9)
        # Only long, exceptionally thin scan spikes are omitted in the new view.
        if max(lengths) > .55 and altitude / max(lengths) < .035:
            removed.append(i // 3)
            continue
        for x, y in [(a, b), (b, c), (c, a)]:
            if x == y:
                continue
            edge = (min(x, y), max(x, y))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1
    adjacency = [[] for _ in points]
    distances = [radius] * len(points)
    queue = []
    for (a, b), count in edge_counts.items():
        length = math.dist(points[a], points[b])
        adjacency[a].append((b, length))
        adjacency[b].append((a, length))
        if count == 1:
            for vertex in (a, b):
                if distances[vertex] != 0:
                    distances[vertex] = 0
                    heapq.heappush(queue, (0, vertex))
    while queue:
        distance, vertex = heapq.heappop(queue)
        if distance > distances[vertex]:
            continue
        for neighbor, length in adjacency[vertex]:
            candidate = distance + length
            if candidate < distances[neighbor]:
                distances[neighbor] = candidate
                heapq.heappush(queue, (candidate, neighbor))
    offset = len(output)
    output.extend(round(distances[index] / radius * 255) for index in remap)
    metadata['meshes'].append({'name': mesh['name'], 'offset': offset,
                               'count': len(remap), 'removedTriangles': removed})
    print(mesh['name'], 'vertices', len(remap), 'boundary vertices', distances.count(0),
          'omitted spikes', len(removed), flush=True)

(root / 'assets/scan-edges.bin').write_bytes(output)
(root / 'assets/scan-edges.json').write_text(json.dumps(metadata, separators=(',', ':')))
