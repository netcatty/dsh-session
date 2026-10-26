# dsh-session

Self-written session management for DeepSeek Harness: list, search, open, tag,
favorite, delete to a local trash, restore and purge.

## Features

- sessions grouped by workspace, collapsible; subagent sessions nested under
  their parent and deleted with it
- search by title, preview, ID, project, tags and note
- open a session (including a subagent child) from the list
- favorites and「仅收藏」filter
- tags (comma separated) and free-form notes per session
- delete to `~/.dsh/session-hub/trash/<id>/` (payload + metadata), restore,
  permanently purge, batch restore/purge, empty trash
- refuses to delete live sessions; refuses to delete a subagent on its own
- in-page confirmation dialogs instead of browser confirms

## Install

```sh
dsh plugin --profile web add link:/path/to/dsh-session
```

## Data

```
~/.dsh/session-hub/
  trash/<id>/{payload,meta.json}
  annotations.json        # favorite / tags / note, keyed by session id
~/.dsh/sessions/          # DSH's own session logs (never relocated)
```

`annotations.json` is written with mode 0600. A legacy
`~/.dsh/session-trash` is migrated on startup when the new trash directory does
not exist yet.

## API

All routes are same-origin (loopback or Origin==Host):

```
GET  /api/session-hub/list
GET  /api/session-hub/trash
GET  /api/session-hub/annotations
POST /api/session-hub/annotations { id, patch: { favorite, tags, note } }
POST /api/session-hub/move-to-trash { id, includeChildren }
POST /api/session-hub/batch-trash { ids }
POST /api/session-hub/restore { id }
POST /api/session-hub/batch-restore { ids }
POST /api/session-hub/purge { id }
POST /api/session-hub/batch-purge { ids }
POST /api/session-hub/cleanup-empty
POST /api/session-hub/empty-trash
```

## Safety

- trash moves the whole session directory; restore refuses to overwrite an
  existing path
- every path is fenced by the sessions/trash roots
- deleting a session removes its workspace-archive registration and cascades to
  every descendant subagent
- reading titles requires decompressing multi-frame zstd logs: `zstd -dc` is
  used when present, otherwise a portable frame-split fallback with Node's
  decoder

## Known limits

- no turn-level operations (delete a round, regenerate) yet
- no session export/import
- annotations are local to this machine
