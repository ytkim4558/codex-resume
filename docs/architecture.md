# codex-resume Architecture

## Product Shape

`codex-resume` 는 Codex 자체를 대체하지 않는다.
역할은 다음 네 가지다.

1. 로컬 Codex 세션 로그 위치 탐지
2. JSONL 세션 메타 인덱싱
3. 검색/preview 제공
4. `codex resume <session-id>` 로 handoff

## Why This Exists

초기 목표는 공식 picker가 커버하지 못하는 부분을 보완하는 것이다.

- 세션 이름/preview 가 빈약할 수 있음
- workspace 중심 탐색이 약함
- 누락된 세션을 직접 로그 기준으로 찾고 싶음
- Windows에서 더 예측 가능한 흐름이 필요함

## Layers

### `src/cli`

사용자 입력 해석과 command dispatch.

- `main.ts`
- `parse-argv.ts`
- `run-app.ts`
- `run-doctor.ts`

### `src/core`

도메인 로직.

- `models.ts`: 세션/메시지 타입
- `session-parser.ts`: JSONL 라인 파싱
- `session-indexer.ts`: 디렉터리 스캔과 메타 추출
- `session-search.ts`: 검색 및 정렬
- `session-resumer.ts`: resume 커맨드 생성

### `src/infra`

OS 및 파일시스템, child process 경계.

- `codex-paths.ts`
- `process-runner.ts`

## Session Source Assumption

초기 기준은 `~/.codex/sessions` 아래의 JSONL 파일이다.

세션 파일마다 아래 메타를 최대한 뽑는다.

- `sessionId`
- `threadName`
- `cwd`
- `startedAt`
- `updatedAt`
- `firstUserMessage`
- `lastAssistantMessage`
- `messageCount`
- `sourcePath`

## Index Strategy

원본 로그를 매 실행마다 full scan 할 수는 있지만, 세션 수가 많아질수록 느려진다.
그래서 캐시 가능한 메타 인덱스를 별도로 둔다.

권장 위치:

- `%USERPROFILE%\\.codex\\codex-resume\\session-index.json`

초기 MVP는 in-memory + file cache 조합이면 충분하다.

## Windows Rules

- 경로 표시는 `C:\\...` 기준으로 유지
- `codex` 실행은 PowerShell에서도 동작해야 함
- UTF-8 preview 가 깨지지 않도록 파일 읽기 시 인코딩 예외 처리
- `doctor` 명령에서 `codex` 바이너리, sessions 디렉터리, cache 디렉터리를 명시적으로 출력

## Non-Goals for MVP

- LLM 요약 생성
- 세션 편집/삭제
- cloud sync
- GitHub 인증 내장

## Implemented MVP

- `doctor`: Codex 홈, 세션 디렉터리, 캐시 디렉터리, `codex` 명령 존재 여부 확인
- `list`: 실제 JSONL 로그 스캔 후 최근 세션 출력
- `list --json`: 포트폴리오/문서화에 쓰기 쉬운 구조화 출력
- `index`: `%USERPROFILE%\\.codex\\codex-resume\\session-index.json` 생성
- 기본 실행: 외부 TUI 라이브러리 없는 키보드 picker
- `resume <id>`: 세션 ID 또는 prefix 로 찾아 `codex resume <id>` 실행

## Near-Term Next Steps

1. 실제 Codex 세션 fixture 확보
2. `doctor`와 `list` 먼저 완성
3. 그 다음 split-pane TUI 도입
