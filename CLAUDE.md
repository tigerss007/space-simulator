# CLAUDE.md — 핵심 규칙 요약 (전체: `docs/SPEC.md`)

## 프로젝트
복합개발 상업시설 배치·호실 등급 3D 시뮬레이터. 스페이스 신텍스를 "엔진"으로 쓰고 수직동선·앵커·배후수요·외부상권으로 보완한다.
보정 전에는 **절대값 예측기가 아니라 "배치안 상대 비교기"** — 화면에 "보정 전: 상대 비교용" 배지를 항상 표시.

## 작업 방식
- `docs/SPEC.md`의 Phase 순서대로 진행. **Phase 하나 끝나면 실행 방법·확인할 것을 알리고, 사용자가 확인하기 전에는 다음 Phase로 가지 않는다.**
- Phase 종료 시 한국어 커밋 메시지로 커밋하고, main으로 가는 PR을 만든다(merge는 사용자가 직접).
- UI 문구·주석·안내 메시지는 모두 한국어.
- 그래프 알고리즘(최단경로·통합도·선택도)은 단위 테스트 필수. 작은 예제 그래프의 손계산 값과 비교.

## 기술/배포
- Vite + React + TypeScript, three.js(@react-three/fiber, drei), zustand, recharts, xlsx(SheetJS), vitest.
- 서버/DB 없는 정적 사이트. GitHub Pages 자동 배포(`.github/workflows/deploy.yml`), Vite `base`는 저장소 이름(`/space-simulator/`).
- 무거운 계산은 Web Worker. 같은 seed → 같은 결과(시뮬레이션).
- 저장: JSON 파일 + localStorage 자동저장(try/catch 필수).

## 데이터 보호
- 사용자 데이터는 브라우저와 사용자가 저장한 JSON에만 존재. **외부 전송 금지**(분석 도구·외부 API·CDN 폰트 등 포함).
- 화면 하단에 "입력한 데이터는 서버로 전송되지 않습니다" 안내.
- 첫 화면에 샘플 프로젝트 + 3단계 사용 안내.

## 좌표/단위
- 단위 m. 평면 좌표 (x, y) → three.js (x, 높이, -y). `floor.level`은 정수 순서값(B1=-1, 1F=0, 2F=1 …).

## 명령어
- `npm run dev` 로컬 개발 / `npm test` 단위 테스트 / `npm run build` 빌드(타입체크 포함)
