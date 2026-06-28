# @openinference/cli

**OpenInference Core** — find, install, and chat with the best open-source model for your computer.

Not an agent. A hardware-aware model package manager on top of [Ollama](https://ollama.com).

## Quick start

```bash
npx @openinference/cli
```

The wizard will:

1. Ask what you want AI for (coding, chat, PDFs, …)
2. Scan RAM, CPU, GPU, disk, and OS
3. Filter 150+ models → what fits your machine
4. Let you pick and confirm before downloading
5. Install Ollama, pull the model, open chat

Skip prompts (power users):

```bash
npx @openinference/cli -y
```

## Commands

| Command | Description |
|---------|-------------|
| `oi` | Setup wizard + chat |
| `oi -y` | Auto-pick and install |
| `oi recommend` | Preview picks (no install) |
| `oi browse` | Browse filtered catalog |
| `oi use <model>` | Switch model (pulls if needed) |
| `oi pull <model>` | Download another model |
| `oi chat` | Chat with active model |
| `oi models` | List downloaded models |
| `oi storage` | Where Ollama stores files |
| `oi status` | Current setup |

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
