# codex-resume

OpenAI Codex CLI 세션을 빠르게 검색하고 이어갈 수 있게 만드는 Windows 친화형 TUI/CLI.

`codex resume` 의 기본 picker 는 세션 누락, 이름 표시, workspace 집중도 측면에서
아쉬운 경우가 있다. `codex-resume` 는 로컬 `~/.codex/sessions` 로그를 직접
인덱싱해서 다음 흐름을 더 빠르게 만든다.

- 최근 세션 검색
- 현재 workspace 기준 필터링
- 대화 preview 확인
- 선택한 세션을 `codex resume <session-id>` 로 재개

## 목표

- Windows PowerShell / CMD / Windows Terminal 친화성
- 로컬 로그 직접 파싱
- 빠른 재인덱싱과 안정적인 preview
- Codex의 native resume 흐름 재사용

## 현재 상태

현재 저장소는 **MVP** 단계다. 세션 경로 탐지, JSONL 파싱, 검색, preview,
resume handoff 를 구현했고, 기본 화면은 `blessed` 기반 split-pane TUI 를 사용한다.
`blessed` 를 불러올 수 없는 환경에서는 Node.js 기본 모듈만 사용하는 fallback picker 로
동작한다.

## 계획된 명령

```powershell
codex-resume
codex-resume doctor
codex-resume index
codex-resume list --json
codex-resume resume <session-id>
```

`codex-resume` 는 세션 목록을 `%USERPROFILE%\.codex\sessions` 에서 읽기 때문에 어느 폴더에서 실행해도 목록 조회는 가능하다.
다만 `Enter` 또는 `resume <session-id>` 로 실제 `codex resume` 을 시작하면 **그때의 현재 폴더가 새 Codex 세션의 작업 폴더**가 된다.
사이트 작업은 `GitHubPageMaker`, 도구 작업은 `codex-resume` 처럼 실제 수정할 프로젝트 폴더에서 실행하는 편이 안전하다.

Windows 에서 `codex` 명령이 PATH 에 없으면 다음 환경변수로 실제 CLI 경로를 지정할 수 있다.

```powershell
[Environment]::SetEnvironmentVariable(
  'CODEX_RESUME_CODEX_BIN',
  "$env:APPDATA\npm\codex.cmd",
  'User'
)
```

## 조작

기본 실행(`codex-resume` 또는 `node .\dist\main.js`)은 키보드 picker 를 띄운다.
좌측에는 세션 요약 리스트, 우측에는 선택한 세션의 상세 preview 가 표시된다.

| 키 | 동작 |
|---|---|
| 문자 입력 | 세션 검색 |
| Backspace | 검색어 삭제 |
| Up / Down | 세션 이동 |
| Enter | 선택한 세션으로 `codex resume <session-id>` 실행 |
| q / Esc / Ctrl+C | 종료 |

## 캐시

`codex-resume index` 는 아래 파일에 세션 인덱스를 저장한다.

```text
%USERPROFILE%\.codex\codex-resume\session-index.json
```

현재 picker/list 는 최신 로그를 직접 읽는다. 캐시는 이후 빠른 시작과 TUI 최적화에
사용할 수 있도록 먼저 생성해 둔다.

## TUI 의존성 결정

초기에는 설치 부담을 줄이기 위해 외부 의존성 없는 화면을 먼저 만들었지만, 실제 사용
화면에서 한글 폭 계산, 긴 경로 줄바꿈, 포커스/스크롤 처리의 품질 한계가 컸다.
`claude-resume` 가 Textual 을 사용한 이유와 마찬가지로, 이 도구도 세션 ID 목록이
아니라 "과거 작업 히스토리 브라우저" 여야 하므로 기본 UI 는 `blessed` 로 전환했다.

로컬 개발 중에는 빌드 없이 바로 실행할 수 있다.

```powershell
node .\dist\main.js
node .\dist\main.js list --limit 10
node .\dist\main.js resume <session-id>
```

## 아키텍처 요약

- `src/core`: 세션 모델, 파서, 인덱서, 검색, resume 로직
- `src/infra`: Codex 경로 탐지, 로컬 캐시, 프로세스 실행
- `src/cli`: 명령 파싱과 실행 진입점
- `docs/`: 구현 메모, Windows 동작 기준, 포트폴리오 반영 문안

세부 설계는 [docs/architecture.md](docs/architecture.md) 참고.

## 개발 방향

1. `~/.codex/sessions` 스캔
2. 세션 메타 인덱스 생성
3. CLI `doctor` / `list` / `index` / `resume`
4. `blessed` 기반 split-pane picker
5. PowerShell / CMD 래퍼 개선

## 라이선스

[MIT](LICENSE)
