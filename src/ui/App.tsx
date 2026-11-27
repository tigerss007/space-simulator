import { useRef, useMemo } from 'react'
import { useStore, floorsByLevel, markGuideSeen } from '../store'
import type { ColorMode, LayoutMode } from '../store'
import { effectiveUnits } from '../model/scenario'
import { Viewer3D } from './Viewer3D'
import { downloadProjectJson, openProjectFile } from './fileio'
import { CATEGORY_COLORS, ENTRANCE_COLORS, VERTICAL_COLORS, VERTICAL_LABELS, FLOOR_COLORS } from './colors'

function Header() {
  const project = useStore((s) => s.project)
  const setName = useStore((s) => s.setProjectName)
  const scenarioId = useStore((s) => s.scenarioId)
  const setScenario = useStore((s) => s.setScenario)
  const resetToSample = useStore((s) => s.resetToSample)
  const setShowGuide = useStore((s) => s.setShowGuide)
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <header className="topbar">
      <input
        className="name-input"
        value={project.meta.name}
        onChange={(e) => setName(e.target.value)}
        aria-label="프로젝트 이름"
      />
      <span className="badge" title="보정 데이터가 들어가기 전까지는 절대값 예측이 아니라 배치안끼리의 상대 비교용입니다.">
        보정 전: 상대 비교용
      </span>
      <div className="spacer" />
      <label className="inline">
        배치안
        <select value={scenarioId ?? ''} onChange={(e) => setScenario(e.target.value || null)}>
          <option value="">(기본 배치)</option>
          {project.scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <button onClick={downloadProjectJson}>JSON 저장</button>
      <button onClick={() => fileRef.current?.click()}>JSON 불러오기</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) openProjectFile(f)
          e.target.value = ''
        }}
      />
      <button onClick={resetToSample}>샘플 불러오기</button>
      <button onClick={() => setShowGuide(true)}>사용 안내</button>
    </header>
  )
}

function LeftPanel() {
  const project = useStore((s) => s.project)
  const layoutMode = useStore((s) => s.layoutMode)
  const setLayoutMode = useStore((s) => s.setLayoutMode)
  const gap = useStore((s) => s.explodeGap)
  const setGap = useStore((s) => s.setExplodeGap)
  const visible = useStore((s) => s.visible)
  const toggle = useStore((s) => s.toggleFloor)
  const setAll = useStore((s) => s.setAllFloors)
  const single = useStore((s) => s.singleFloorId)
  const setSingle = useStore((s) => s.setSingleFloor)
  const colorMode = useStore((s) => s.colorMode)
  const setColorMode = useStore((s) => s.setColorMode)
  const floors = [...floorsByLevel(project)].reverse() // 위층이 위에 오도록

  const modes: [LayoutMode, string][] = [['explode', '층 분리'], ['all', '전체'], ['single', '한 층만']]
  const colors: [ColorMode, string][] = [['category', '업종'], ['floor', '층'], ['plain', '단색']]

  return (
    <aside className="panel left">
      <h3>보기 방식</h3>
      <div className="seg">
        {modes.map(([m, label]) => (
          <button key={m} className={layoutMode === m ? 'on' : ''} onClick={() => setLayoutMode(m)}>{label}</button>
        ))}
      </div>
      {layoutMode === 'explode' && (
        <label className="slider">
          층 간격 {gap}m
          <input type="range" min={0} max={20} step={1} value={gap} onChange={(e) => setGap(+e.target.value)} />
        </label>
      )}

      <h3>층 {layoutMode !== 'single' && (
        <span className="mini">
          <button onClick={() => setAll(true)}>모두 켜기</button>
          <button onClick={() => setAll(false)}>모두 끄기</button>
        </span>
      )}</h3>
      <ul className="floors">
        {floors.map((f, i) => (
          <li key={f.id}>
            <label>
              {layoutMode === 'single' ? (
                <input type="radio" name="single" checked={single === f.id} onChange={() => setSingle(f.id)} />
              ) : (
                <input type="checkbox" checked={!!visible[f.id]} onChange={() => toggle(f.id)} />
              )}
              <span className="dot" style={{ background: FLOOR_COLORS[(floors.length - 1 - i) % FLOOR_COLORS.length] }} />
              {f.name}
              <span className="dim"> {project.units.filter((u) => u.floorId === f.id).length}호실</span>
            </label>
          </li>
        ))}
      </ul>

      <h3>색상 기준</h3>
      <div className="seg">
        {colors.map(([m, label]) => (
          <button key={m} className={colorMode === m ? 'on' : ''} onClick={() => setColorMode(m)}>{label}</button>
        ))}
      </div>

      <h3>분석 보기 모드</h3>
      <div className="chips">
        {['통합도', '선택도', '출입구 깊이', '통행량', '호실 등급'].map((m) => (
          <button key={m} disabled title="다음 단계에서 추가됩니다">{m}</button>
        ))}
      </div>
      <p className="hint">분석 기능은 Phase 2부터 순서대로 추가됩니다.</p>
    </aside>
  )
}

function RightPanel() {
  const project = useStore((s) => s.project)
  const colorMode = useStore((s) => s.colorMode)
  const hoverId = useStore((s) => s.hoverUnitId)
  const scenarioId = useStore((s) => s.scenarioId)
  const hovered = useMemo(
    () => effectiveUnits(project, scenarioId).find((u) => u.id === hoverId),
    [project, scenarioId, hoverId],
  )
  const floorName = (id: string) => project.floors.find((f) => f.id === id)?.name ?? id
  return (
    <aside className="panel right">
      <h3>선택 호실</h3>
      {hovered ? (
        <dl className="info">
          <dt>호실</dt><dd>{hovered.name}</dd>
          <dt>층</dt><dd>{floorName(hovered.floorId)}</dd>
          <dt>업종</dt><dd>{hovered.category || '(미지정)'}{hovered.isAnchor ? ' · 앵커' : ''}</dd>
          <dt>면적</dt><dd>{hovered.area.toLocaleString()}㎡</dd>
          <dt>전면 폭</dt><dd>{hovered.frontageWidth}m</dd>
          <dt>잠금</dt><dd>{hovered.locked ? '예' : '아니오'}</dd>
        </dl>
      ) : (
        <p className="hint">3D 화면에서 호실 위로 마우스를 올려 보세요.</p>
      )}

      <h3>범례</h3>
      {colorMode === 'category' && (
        <ul className="legend">
          {Object.entries(CATEGORY_COLORS).map(([k, c]) => (
            <li key={k}><span className="dot" style={{ background: c }} />{k}</li>
          ))}
        </ul>
      )}
      <ul className="legend">
        {Object.entries(ENTRANCE_COLORS).map(([k, c]) => (
          <li key={k}><span className="dot cone" style={{ background: c }} />출입구: {k}</li>
        ))}
        {Object.entries(VERTICAL_COLORS).map(([k, c]) => (
          <li key={k}><span className="dot sq" style={{ background: c }} />{VERTICAL_LABELS[k]}</li>
        ))}
      </ul>
      <h3>변수 패널</h3>
      <p className="hint">수직동선 비용·분석 반경·외부 요인·점수 가중치·등급 기준·임대료·시뮬레이션 설정은 이후 단계에서 이 자리에 추가됩니다.</p>
    </aside>
  )
}

function ResultPanel() {
  const project = useStore((s) => s.project)
  const scenarioId = useStore((s) => s.scenarioId)
  const rows = useMemo(() => {
    const units = effectiveUnits(project, scenarioId)
    return floorsByLevel(project).reverse().map((f) => {
      const us = units.filter((u) => u.floorId === f.id)
      return {
        floor: f.name,
        count: us.length,
        area: us.reduce((a, u) => a + u.area, 0),
        anchors: us.filter((u) => u.isAnchor).length,
      }
    })
  }, [project, scenarioId])
  return (
    <section className="results">
      <h3>층별 요약 <span className="dim">(등급표·차트·배치안 비교는 이후 단계에서 추가됩니다)</span></h3>
      <table>
        <thead><tr><th>층</th><th>호실 수</th><th>임대 면적(㎡)</th><th>앵커 수</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.floor}><td>{r.floor}</td><td>{r.count}</td><td>{r.area.toLocaleString()}</td><td>{r.anchors}</td></tr>
          ))}
          <tr className="total">
            <td>합계</td>
            <td>{rows.reduce((a, r) => a + r.count, 0)}</td>
            <td>{rows.reduce((a, r) => a + r.area, 0).toLocaleString()}</td>
            <td>{rows.reduce((a, r) => a + r.anchors, 0)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function Guide() {
  const show = useStore((s) => s.showGuide)
  const setShow = useStore((s) => s.setShowGuide)
  if (!show) return null
  const close = () => { markGuideSeen(); setShow(false) }
  return (
    <div className="overlay" onClick={close}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>상업시설 배치·호실 등급 3D 시뮬레이터</h2>
        <p>복합개발 상업시설의 층·호실·복도·수직동선을 3D로 보고, 배치안을 서로 비교하기 위한 도구입니다. 지금 보이는 건물은 <b>샘플 프로젝트</b>입니다.</p>
        <ol>
          <li><b>둘러보기</b> — 마우스로 회전(왼쪽 드래그)·이동(오른쪽 드래그)·확대(휠)하세요. 왼쪽에서 층을 껐다 켜거나 층 간격을 벌려 볼 수 있습니다.</li>
          <li><b>배치안 바꿔보기</b> — 위쪽 '배치안'에서 A(앵커 3층)와 B(앵커 1층)를 바꾸면 업종 배치가 달라집니다.</li>
          <li><b>저장하기</b> — 'JSON 저장'으로 내 컴퓨터에 파일로 저장하고, 다음에 'JSON 불러오기'로 이어서 작업하세요.</li>
        </ol>
        <p className="hint">이 도구는 보정 데이터가 들어가기 전까지 <b>절대값 예측기가 아니라 배치안 상대 비교기</b>입니다. 입력한 데이터는 서버로 전송되지 않습니다.</p>
        <button className="primary" onClick={close}>시작하기</button>
      </div>
    </div>
  )
}

function Notice() {
  const n = useStore((s) => s.notice)
  const set = useStore((s) => s.setNotice)
  if (!n) return null
  return (
    <div className={`notice ${n.kind}`} role="status">
      {n.text}
      <button onClick={() => set(null)} aria-label="닫기">×</button>
    </div>
  )
}

export function App() {
  const project = useStore((s) => s.project)
  return (
    <div className="app">
      <Header />
      <div className="main">
        <LeftPanel />
        <div className="center">
          <Viewer3D />
          <Notice />
          <div className="viewer-hint">{project.meta.site}</div>
        </div>
        <RightPanel />
      </div>
      <ResultPanel />
      <footer className="footer">입력한 데이터는 서버로 전송되지 않습니다. 모든 계산과 저장은 이 브라우저 안에서만 이루어집니다.</footer>
      <Guide />
    </div>
  )
}
