# Handoff for Gemini: LinkedIn post workflow

## Goal

Help Yongtak Kim draft and publish a LinkedIn post about recent AI workflow work:

- `claude-resume`: LLM-summary-based Claude Code session picker.
- `codex-resume`: Windows-friendly OpenAI Codex CLI session search/resume tool.
- GitHub Pages portfolio updates around OpenSearch SME, support automation, MCP workflows, Slack bot, case aging triage, and response verification.
- LinkedIn API/OAuth permission investigation.

## Current state

Repositories already pushed:

- `ytkim4558/codex-resume`
- `ytkim4558/linkedin-posting-mcp`
- `ytkim4558/GitHubPageMaker`
- `ytkim4558/ytkim4558.github.io`

Relevant public pages:

- Profile/home: `https://ytkim4558.github.io/`
- codex-resume decision note: `https://ytkim4558.github.io/codex-resume-tui-decision`
- LinkedIn API permission note: `https://ytkim4558.github.io/linkedin-api-permission-check`

Local draft:

- `drafts/linkedin/2026-05-18-codex-resume-ai-workflow.md`

## LinkedIn API findings

Official OAuth flow works.

Confirmed token scopes:

- `openid`
- `profile`
- `email`
- `w_member_social`

Missing scope:

- `r_member_social`

`posts:me` fails with:

```text
ACCESS_DENIED
Not enough permissions to access: partnerApiPostsExternal.FINDER-author.20250601
```

Conclusion:

- Posting may be possible with `w_member_social`.
- Reading existing personal posts is not currently available because `r_member_social` is not granted.
- Official FAQ indicates `r_member_social` is a closed/restricted permission.

## User preference

The user wants existing LinkedIn writing tone reflected before posting.

Since official API read access is blocked, Gemini can use the user's logged-in Chrome session to inspect the user's own LinkedIn activity page visually, if Gemini has browser access and the user approves that workflow.

Important:

- Do not use browser cookies, private LinkedIn internal APIs, automated scraping, DM automation, or connection automation.
- If using the browser, treat it as assisted manual viewing of the user's own logged-in page.
- Avoid collecting unrelated personal data.
- Extract only the user's own recent post text/tone needed for drafting.

## Suggested next steps for Gemini

1. Open the user's LinkedIn profile/activity page in Chrome.
2. Inspect 2-3 recent posts written by the user.
3. Summarize tone:
   - Korean vs English ratio
   - paragraph length
   - level of technical detail
   - hashtag style
   - whether links go inline or at the end
4. Rewrite the current draft in that tone.
5. Put final text on the clipboard for manual posting.

## Security notes

- Do not ask the user to paste Client Secret or access token.
- A previously exposed LinkedIn Client Secret was deleted/rotated by the user.
- Do not commit OAuth tokens, authorization codes, or browser session data.
