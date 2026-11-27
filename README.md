# 복합개발 상업시설 배치·호실 등급 3D 시뮬레이터

브라우저만으로 동작하는 정적 웹 도구입니다. 입력한 데이터는 서버로 전송되지 않습니다.
보정 데이터가 들어가기 전까지는 절대값 예측기가 아니라 **배치안 상대 비교기**입니다.

- 명세: [`docs/SPEC.md`](docs/SPEC.md) / 작업 규칙: [`CLAUDE.md`](CLAUDE.md)
- 로컬 실행: `npm install` → `npm run dev`
- 테스트: `npm test` / 빌드: `npm run build`
- 배포: main 브랜치에 push 하면 GitHub Actions가 GitHub Pages로 자동 배포합니다.
  (저장소 Settings → Pages → Source를 **GitHub Actions**로 한 번 설정해야 합니다.)
