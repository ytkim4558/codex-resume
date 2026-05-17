# Portfolio / Wiki Summary Draft

## codex-resume

- OpenAI Codex CLI 세션 로그를 직접 인덱싱해 검색, preview, resume 를 빠르게 수행하는 Windows 친화형 TUI/CLI 도구 설계
- 공식 `codex resume` picker 의 탐색성 한계를 보완하기 위해 workspace 중심 세션 탐색 구조와 native resume handoff 방식 정의
- 로컬 JSONL 파싱, 세션 메타 인덱스, PowerShell 중심 사용 흐름을 기준으로 아키텍처를 모듈화

## toolkit / workflow angle

- AI 코딩 에이전트와 협업해 도구 요구사항 정리, repo 구조 설계, README/문서 초안, Windows 사용 시나리오를 빠르게 고정
- `claude-resume`, `claude-toolkit`, `linkedin-update`, `codex-resume` 로 이어지는 AI 협업 도구 체계를 문서 중심으로 축적

## short Korean copy

OpenAI Codex CLI 세션을 검색하고 이어가기 위한 Windows 친화형 TUI/CLI `codex-resume` 를 설계했다. 로컬 JSONL 세션 로그를 직접 인덱싱해 workspace 기준 탐색, 대화 preview, `codex resume <session-id>` 기반 재개 흐름을 더 빠르게 만드는 구조를 정의했다.
