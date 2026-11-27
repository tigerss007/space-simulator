import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useStore, floorsByLevel } from '../store'
import { effectiveUnits } from '../model/scenario'
import type { Floor, Project, Unit, Vec2 } from '../model/types'
import { heatColor, normalize, nodeValue, unitValue, valueRange } from './heat'
import { categoryColor, ENTRANCE_COLORS, FLOOR_COLORS, UNKNOWN_COLOR, VERTICAL_COLORS } from './colors'

// 평면 (x, y) → 3D (x, 높이, -y)
const p3 = (p: Vec2, y: number): [number, number, number] => [p[0], y, -p[1]]

function useFloorLayout() {
  const project = useStore((s) => s.project)
  const mode = useStore((s) => s.layoutMode)
  const gap = useStore((s) => s.explodeGap)
  const visible = useStore((s) => s.visible)
  const single = useStore((s) => s.singleFloorId)
  return useMemo(() => {
    const sorted = floorsByLevel(project)
    const yOf: Record<string, number> = {}
    const shown: Record<string, boolean> = {}
    sorted.forEach((f, i) => {
      yOf[f.id] = f.elevation + (mode === 'explode' ? i * gap : 0)
      shown[f.id] = mode === 'single' ? f.id === single : !!visible[f.id]
    })
    return { sorted, yOf, shown }
  }, [project, mode, gap, visible, single])
}

function footprint(project: Project, floorId: string) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const add = (p: Vec2) => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
  }
  project.units.filter((u) => u.floorId === floorId).forEach((u) => u.polygon.forEach(add))
  project.corridors.filter((c) => c.floorId === floorId).forEach((c) => c.points.forEach(add))
  if (!isFinite(minX)) return null
  return { minX: minX - 1, minY: minY - 1, maxX: maxX + 1, maxY: maxY + 1 }
}

function FloorSlab({ project, floor, y, index }: { project: Project; floor: Floor; y: number; index: number }) {
  const fp = footprint(project, floor.id)
  if (!fp) return null
  const w = fp.maxX - fp.minX
  const d = fp.maxY - fp.minY
  return (
    <mesh position={[fp.minX + w / 2, y - 0.15, -(fp.minY + d / 2)]}>
      <boxGeometry args={[w, 0.3, d]} />
      <meshStandardMaterial color={FLOOR_COLORS[index % FLOOR_COLORS.length]} transparent opacity={0.18} />
    </mesh>
  )
}

function UnitMesh({ unit, y, height, color }: { unit: Unit; y: number; height: number; color: string }) {
  const hovered = useStore((s) => s.hoverUnitId === unit.id)
  const setHover = useStore((s) => s.setHoverUnit)
  const geo = useMemo(() => {
    const shape = new THREE.Shape(unit.polygon.map(([x, yy]) => new THREE.Vector2(x, yy)))
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  }, [unit.polygon, height])
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo])
  // 압출은 XY 평면 → 위쪽으로 쌓이므로 -90° 회전해 (x, y)→(x, 높이, -y)로 맞춘다.
  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={geo}
        onPointerOver={(e) => { e.stopPropagation(); setHover(unit.id) }}
        onPointerOut={() => setHover(null)}
      >
        <meshStandardMaterial
          color={color}
          emissive={hovered ? '#ffffff' : unit.isAnchor ? color : '#000000'}
          emissiveIntensity={hovered ? 0.45 : unit.isAnchor ? 0.25 : 0}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={hovered ? '#111' : '#3a3f4b'} />
      </lineSegments>
    </group>
  )
}

function Scene() {
  const project = useStore((s) => s.project)
  const scenarioId = useStore((s) => s.scenarioId)
  const colorMode = useStore((s) => s.colorMode)
  const analysis = useStore((s) => s.analysis)
  const metric = useStore((s) => s.viewMetric)
  const radiusKey = useStore((s) => s.radiusKey)
  const { sorted, yOf, shown } = useFloorLayout()
  const heat = analysis && metric ? { a: analysis, m: metric, range: valueRange(analysis, metric, radiusKey) } : null
  const unitRes = useMemo(() => new Map((analysis?.units ?? []).map((u) => [u.unitId, u])), [analysis])
  const units = useMemo(() => effectiveUnits(project, scenarioId), [project, scenarioId])
  const floorIndex = Object.fromEntries(sorted.map((f, i) => [f.id, i]))

  const colorOf = (u: Unit) => {
    if (heat) {
      const r = unitRes.get(u.id)
      const v = r ? unitValue(r, heat.m, radiusKey) : null
      return v === null ? '#cfd3da' : heatColor(normalize(v, heat.range, heat.m))
    }
    return baseColor(u)
  }
  const baseColor = (u: Unit) =>
    colorMode === 'plain' ? '#c9ced6'
      : colorMode === 'floor' ? FLOOR_COLORS[floorIndex[u.floorId] % FLOOR_COLORS.length]
      : u.category ? categoryColor(u.category) : UNKNOWN_COLOR

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[60, 120, 40]} intensity={1.1} />
      <gridHelper args={[160, 32, '#9aa0aa', '#d5d8de']} position={[40, (sorted[0]?.elevation ?? -5) - 1, -20]} />

      {sorted.map((f, i) =>
        shown[f.id] ? <FloorSlab key={f.id} project={project} floor={f} y={yOf[f.id]} index={i} /> : null,
      )}

      {units.map((u) =>
        shown[u.floorId] ? (
          <UnitMesh
            key={u.id}
            unit={u}
            y={yOf[u.floorId]}
            height={u.isAnchor ? 3.6 : 2.6}
            color={colorOf(u)}
          />
        ) : null,
      )}

      {heat &&
        heat.a.nodes.map((n) => {
          if (!shown[n.floorId]) return null
          const v = nodeValue(n, heat.m, radiusKey)
          if (v === null) return null
          const ang = Math.atan2(n.b[1] - n.a[1], n.b[0] - n.a[0])
          return (
            <mesh key={n.id} position={p3(n.mid, yOf[n.floorId] + 0.12)} rotation={[0, ang, 0]}>
              <boxGeometry args={[Math.max(n.length - 0.15, 0.1), 0.12, 3]} />
              <meshStandardMaterial color={heatColor(normalize(v, heat.range, heat.m))} />
            </mesh>
          )
        })}

      {project.corridors.map((c) =>
        shown[c.floorId] ? (
          <Line key={c.id} points={c.points.map((p) => p3(p, yOf[c.floorId] + 0.1))} color="#1d2433" lineWidth={3} />
        ) : null,
      )}

      {project.entrances.map((e) =>
        shown[e.floorId] ? (
          <mesh key={e.id} position={p3(e.point, yOf[e.floorId] + 1.2)}>
            <coneGeometry args={[1.1, 2.4, 16]} />
            <meshStandardMaterial color={ENTRANCE_COLORS[e.type]} />
          </mesh>
        ) : null,
      )}

      {project.verticals.map((v) => {
        const cs = [...v.connects]
          .filter((c) => shown[c.floorId])
          .sort((a, b) => (yOf[a.floorId] ?? 0) - (yOf[b.floorId] ?? 0))
        const color = VERTICAL_COLORS[v.type] ?? '#444'
        return (
          <group key={v.id}>
            {cs.map((c) => (
              <mesh key={c.floorId} position={p3(c.point, yOf[c.floorId] + 0.4)}>
                <boxGeometry args={[1.6, 0.8, 1.6]} />
                <meshStandardMaterial color={color} />
              </mesh>
            ))}
            {cs.slice(1).map((c, i) => (
              <Line
                key={c.floorId}
                points={[p3(cs[i].point, yOf[cs[i].floorId] + 0.8), p3(c.point, yOf[c.floorId] + 0.8)]}
                color={color}
                lineWidth={v.type === 'escalator' ? 3 : 2}
                dashed={v.type === 'stairs'}
                dashSize={0.8}
                gapSize={0.5}
              />
            ))}
            {v.voidVisible && cs.length > 1 && (
              <mesh
                position={p3(cs[0].point, (yOf[cs[0].floorId] + yOf[cs[cs.length - 1].floorId]) / 2 + 2)}
              >
                <cylinderGeometry args={[6, 6, yOf[cs[cs.length - 1].floorId] - yOf[cs[0].floorId] + 4, 32, 1, true]} />
                <meshStandardMaterial color="#9ad1ff" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

export function Viewer3D() {
  return (
    <Canvas camera={{ position: [95, 70, 70], fov: 45, near: 0.5, far: 1000 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={['#eef1f5']} />
      <Scene />
      <OrbitControls target={[40, 8, -20]} maxPolarAngle={Math.PI * 0.49} makeDefault />
    </Canvas>
  )
}
