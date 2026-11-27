import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포 시 저장소 이름 경로(/space-simulator/)를 base로 사용한다.
// 로컬 개발(npm run dev)은 루트(/)에서 동작한다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/space-simulator/') : '/',
  plugins: [react()],
  test: { environment: 'node' },
}))
