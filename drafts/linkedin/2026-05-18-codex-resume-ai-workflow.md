# LinkedIn Draft — codex-resume / AI Workflow

## Korean

최근 Claude Code와 OpenAI Codex CLI를 같이 쓰면서, AI 에이전트와의 작업 기록을 어떻게 다시 찾고 이어갈지 고민하게 됐습니다.

처음에는 단순히 세션 ID를 고르는 정도면 충분하다고 생각했지만, 실제로는 "그때 어떤 문제를 해결하던 대화였는지"를 빠르게 파악하는 것이 훨씬 중요했습니다.

그래서 두 가지 도구를 만들고 정리했습니다.

- `claude-resume`: Claude Code의 과거 세션을 LLM 요약 기반으로 찾고, 두 패널 TUI에서 대화 흐름을 확인한 뒤 이어가는 도구
- `codex-resume`: OpenAI Codex CLI의 로컬 JSONL 세션을 검색하고 Windows 환경에서 안정적으로 이어가기 위한 TUI 도구

이번 작업에서 얻은 결론은 명확했습니다.

세션 복구 도구의 본질은 ID 목록을 보여주는 것이 아니라, 작업 기억을 다시 찾게 해주는 것입니다. 그래서 단순한 raw preview보다 LLM 요약, 검색 가능한 세션 인덱스, 보기 좋은 TUI, 다른 에이전트에게 넘길 수 있는 문서화 규칙이 중요했습니다.

이 과정에서 포트폴리오도 함께 정리했습니다. 단순 이력 나열보다 OpenSearch 고객 트러블슈팅, support-agent workflow, MCP 기반 Slack/Outlook/wiki 연계, case aging triage, 답변 검증 로직 같은 실제로 반복 문제를 줄이는 작업 중심으로 재구성했습니다.

정리한 글:
https://ytkim4558.github.io/codex-resume-tui-decision

프로필/포트폴리오:
https://ytkim4558.github.io/

#AIWorkflow #OpenSearch #SupportEngineering #Codex #ClaudeCode #DeveloperTools #MCP

## English

Recently, while using Claude Code and OpenAI Codex CLI together, I started thinking more seriously about how to recover and continue past AI-agent work.

At first, I thought a simple session-ID picker would be enough. In practice, the harder problem was understanding "what I was working on in that session" quickly enough to resume the right context.

I ended up building and documenting two tools:

- `claude-resume`: an LLM-summary-based TUI for finding and resuming Claude Code sessions
- `codex-resume`: a Windows-friendly TUI for searching local OpenAI Codex CLI JSONL sessions and resuming them safely

The key lesson was simple:

A session recovery tool should not just show IDs. It should help recover working memory.

That means searchable summaries, a reliable session index, a readable TUI, and handoff notes that another AI agent or future session can continue from.

I also updated my portfolio around the same theme: OpenSearch customer troubleshooting, support-agent workflows, MCP-based Slack/Outlook/wiki integrations, case aging triage, and response verification logic.

Engineering note:
https://ytkim4558.github.io/codex-resume-tui-decision

Profile / portfolio:
https://ytkim4558.github.io/

#AIWorkflow #OpenSearch #SupportEngineering #Codex #ClaudeCode #DeveloperTools #MCP

## Manual Posting Checklist

- Open LinkedIn feed.
- Paste either Korean only or both Korean and English.
- If posting both, keep Korean first and English second.
- Add the `codex-resume` article URL preview.
- Review link preview image. It should show the codex-resume raw TUI screenshot, not the claude-resume screenshot.
