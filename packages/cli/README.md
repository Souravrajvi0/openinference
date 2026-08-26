# @openinference/cli

**OpenInference Core** — a package manager for local AI models.

`oi` finds, installs, and runs the right open-source model for your computer —
the same way `apt`, `brew`, or `npm` manage software. It is **hardware-aware**:
it scans your machine and only offers models that will actually run on it.

Powered by a local inference engine ([Ollama](https://ollama.com) today) — but
you manage *models*, not the engine.

## Quick start

**Install globally, then type `oi` anytime:**

```bash
npm install -g @openinference/cli
oi
```

One line (install + open the terminal):

```bash
npm install -g @openinference/cli && oi
```

On Linux you may need `sudo npm install -g @openinference/cli`, then run `oi`.

The default is an **interactive shell** — chat when you already have a model, or `/setup` to run the wizard.

The setup wizard (`oi start`):

1. Ask what you want AI for (coding, chat, PDFs, …)
2. Scan RAM, CPU, GPU, disk, and OS
3. Filter 150+ models → what fits your machine
4. Let you pick and confirm before downloading
5. Install Ollama, pull the model, verify with a quick test
6. On tiny VMs (<4 GB RAM), only micro models are offered; if a model crashes, `-y` auto-retries the next smallest fit

Skip prompts (power users):

```bash
oi start -y
# safest on a 3–4 GB cloud VM:
oi start -y -m smollm2:135m
```

## Commands

Familiar, package-manager-style commands. Older names are kept as aliases.

| Command | Aliases | Description |
|---------|---------|-------------|
| `oi` | | Interactive shell (default) — chat + `/search`, `/install`, `/setup`, `/agent` |
| `oi start` | `setup` | Setup wizard |
| `oi start -y` | | Auto-pick and install (retries on crash) |
| `oi search <query>` | `find` | Search models — shows installed vs available |
| `oi info <model>` | `show` | Details: RAM, size, fit, installed state |
| `oi install <model>` | `pull`, `add` | Download a model |
| `oi use [model]` | | Switch active model (`oi use` = pick from installed) |
| `oi list` | `models`, `ls` | List installed models |
| `oi remove <model>` | `rm`, `uninstall` | Delete a model and free disk space |
| `oi recommend` | | Preview picks for your hardware (no install) |
| `oi chat` | | Chat with active model |
| `oi agent [goal]` | `run` | Agent harness — plan, todos, unique edits, sessions |
| `oi init` | | Create `.oi/config.json`, `.oiignore`, `AGENTS.md` |
| `oi sessions` | `session` | List / show / replay agent session logs |
| `oi undo` | | Restore the last agent file edit |
| `oi storage` | | Where models are stored |
| `oi status` | | Current setup |

## Agent harness

`oi agent` is a tool loop on the model you installed — the same shape as the
hosted OpenInference agent: plan mode, a live todo list, unique `str_replace`
edits, glob, ask-user, project config, checkpoints, and an append-only session
log (resume / replay).

```bash
oi init
oi agent "what TypeScript files are in packages/cli?"
oi agent --plan "add auth to the gateway"
oi agent -y --mode minimal "replace the timeout in src/ollama.ts"
oi agent --resume
oi agent --json --max-steps 8 "summarize this repo"
oi undo
oi sessions
oi sessions replay
```

Turn a folder into an agent project with `oi init`. That writes:

- `.oi/config.json` — `mode`, `maxSteps`, `plan`, `model`
- `.oiignore` — skip folders in glob/search (plus the usual `node_modules` / `.git`)
- `AGENTS.md` — project instructions loaded into the system prompt

Checkpoints live in `.oi/checkpoints.jsonl`. File edits (`write_file`,
`str_replace`) snapshot the previous contents; `oi undo` restores the last one.

No goal opens an agent session (`agent ❯`). Slash commands: `/plan`, `/todos`,
`/resume`, `/sessions`, `/undo`, `/init`. From the normal shell: `/agent <goal>`.

Tools (workspace-sandboxed to `--cwd`, default `.`):

`glob` · `list_dir` · `read_file` · `str_replace` · `write_file` · `search` · `run_command` · `todo_write` · `ask_user_question` · `exit_plan_mode` · `web_fetch` · `calculate` · `explore`

`--mode minimal` keeps `read_file`, `str_replace`, and `run_command` (plus plan/todos).
`explore` is a short read-only sub-agent (list/read/glob/search).

`write_file`, `str_replace`, and `run_command` ask before running unless `-y`.
In `--plan` mode, file edits are blocked until you approve `exit_plan_mode`.
Sessions are stored in `~/.openinference/sessions/`.

Use a 7B+ instruct model for reliable tool calling; tiny models will chat
but often skip tools.

## Use cases

`coding` · `chat` · `pdfs` · `writing` · `image` · `research`

```bash
oi recommend --use-case coding
oi --use-case coding -y
```

## Model storage

OpenInference does **not** store model files. Ollama downloads to:

- **Windows:** `%USERPROFILE%\.ollama\models`
- **macOS / Linux:** `~/.ollama/models`

## Requirements

- Node.js 18+
- Windows, macOS, or Linux

## License

MIT
