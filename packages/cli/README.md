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

On first launch, `oi` opens the setup wizard:

1. Ask what you want AI for (coding, chat, PDFs, …)
2. Scan RAM, CPU, GPU, disk, and OS
3. Filter 150+ models → what fits your machine
4. Let you pick and confirm before downloading
5. Install Ollama, pull the model, verify with a quick test
6. On tiny VMs (<4 GB RAM), only micro models are offered; if a model crashes, `-y` auto-retries the next smallest fit

Skip prompts (power users):

```bash
oi setup -y
# safest on a 3–4 GB cloud VM:
oi setup -y -m smollm2:135m
```

## Commands

Familiar, package-manager-style commands. Older names are kept as aliases.

| Command | Aliases | Description |
|---------|---------|-------------|
| `oi` | | Interactive shell (default) — chat + `/search`, `/install`, `/setup` |
| `oi setup` | | Direct setup for scripts and automation |
| `oi setup -y` | | Auto-pick and install (retries on crash) |
| `oi search <query>` | `find` | Search models — shows installed vs available |
| `oi info <model>` | `show` | Details: RAM, size, fit, installed state |
| `oi install <model>` | `pull`, `add` | Download a model |
| `oi use [model]` | | Switch active model (`oi use` = pick from installed) |
| `oi list` | `models`, `ls` | List installed models |
| `oi remove <model>` | `rm`, `uninstall` | Delete a model and free disk space |
| `oi recommend` | | Preview picks for your hardware (no install) |
| `oi chat` | | Chat with active model |
| `oi storage` | | Where models are stored |
| `oi status` | | Current setup |

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
