import { parseProject, serializeProject } from '../model/storage'
import { useStore } from '../store'
import { download, fileStamp } from './exporters'

// 프로젝트를 JSON 파일로 내려받는다. (브라우저 안에서만 처리, 서버 전송 없음)
export function downloadProjectJson() {
  const { project } = useStore.getState()
  const blob = new Blob([serializeProject(project)], { type: 'application/json' })
  download(blob, `space-simulator_project_${fileStamp()}.json`)
}

export async function openProjectFile(file: File) {
  const { setProject, setNotice } = useStore.getState()
  const r = parseProject(await file.text())
  if (r.ok) setProject(r.project, `'${file.name}' 파일을 불러왔습니다.`)
  else setNotice({ kind: 'error', text: `불러오기 실패: ${r.errors.slice(0, 3).join(' / ')}` })
}
