# Codex Session Format Notes

Observed path:

```text
%USERPROFILE%\.codex\sessions\YYYY\MM\DD\rollout-<timestamp>-<session-id>.jsonl
```

Observed record types:

- `session_meta`: contains `payload.id`, `payload.cwd`, `payload.cli_version`, and start timestamp
- `user_message`: contains `payload.message`
- `response_item`: contains assistant/user message payloads under `payload.content`
- `event_msg` with `payload.type = task_complete`: can contain `payload.last_agent_message`

Parsing rules used by the MVP:

- Session ID comes from `session_meta.payload.id`, falling back to the UUID suffix in the filename.
- System/bootstrap messages such as `<environment_context>` are ignored for title and preview.
- The title is derived from the first real user message.
- `updatedAt` is the latest top-level JSONL timestamp observed in the file.
- Resume handoff uses `codex resume <session-id>`.
