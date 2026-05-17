# Windows Notes

## Primary Environment

- PowerShell 5.1 / 7.x
- Windows Terminal
- Node.js 20+
- Codex CLI installed and available as `codex`

## Behaviors to Validate

1. `codex` 가 PATH 에 없을 때 `doctor` 가 정확히 안내하는지
2. `~/.codex/sessions` 대신 `%USERPROFILE%\\.codex\\sessions` 를 안정적으로 찾는지
3. 한글/UTF-8 preview 가 깨지지 않는지
4. 긴 경로와 OneDrive 홈 디렉터리에서도 cache path 가 안전한지

## Planned Wrapper Scripts

향후 추가 예정:

- `bin/codex-resume.ps1`
- `bin/codex-resume.cmd`

이 래퍼들은 다음 역할을 맡는다.

- Node entrypoint 호출
- PowerShell UTF-8 설정
- 필요 시 `codex` 명령 handoff

## Operational Notes

- `gh` 재사용 기반 GitHub 연동은 별도 구현으로 둔다
- 앱 자체가 GitHub 인증을 직접 다루지 않는다
- PowerShell 실행 정책 때문에 `npm.ps1` 이 막힌 환경에서는 `npm.cmd` 를 사용한다
- 현재 MVP는 `node .\\dist\\main.js` 로 바로 실행 가능하므로 의존성 설치가 필요 없다
