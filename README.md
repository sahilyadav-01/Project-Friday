<div align="center">
  <img alt="Friday logo" src="frontend/public/pwa-192x192.png" width="144">
  <h1>Friday</h1>
  <p><strong>Your private AI assistant for Windows, macOS, and Linux.</strong></p>
  <p>Desktop app · Local-first · Voice enabled · Extensible</p>
</div>

Friday is a local-first personal AI assistant built for the desktop. It combines
a native Tauri application, a Python intelligence backend, local or cloud AI
models, voice interaction, memory, agents, and personal data connections in one
workspace.

## Highlights

- **Native desktop app** — a focused Tauri window, system tray support, global
  shortcuts, notifications, autostart, and a compact voice overlay.
- **Local or cloud models** — use Ollama, vLLM, llama.cpp, LM Studio, OpenAI,
  Gemini, Claude, or another compatible inference server.
- **Voice interaction** — local speech-to-text and neural text-to-speech.
- **Agents and tools** — run tool-using agents, scheduled work, and custom
  workflows.
- **Memory and connected data** — search your personal sources and preserve
  useful context locally.
- **Privacy first** — configuration, credentials, conversations, and memory stay
  on your computer by default.
- **Developer friendly** — CLI, OpenAI-compatible API, browser UI, Python SDK,
  and native Rust extensions.

## Requirements

### Core

- Python 3.10–3.13
- [uv](https://docs.astral.sh/uv/)
- Ollama, a compatible inference server, or cloud API keys

### Desktop development

- Node.js 22 or newer
- Rust stable (`rustup`, `rustc`, and `cargo`)
- Platform prerequisites required by
  [Tauri 2](https://v2.tauri.app/start/prerequisites/)
- Windows: WebView2 and Microsoft C++ Build Tools

## Quick start

Install the backend and initialize Friday:

```bash
uv sync --extra server --extra desktop
uv run friday init
uv run friday doctor
```

Start the browser interface:

```bash
uv run friday gui
```

Start an interactive terminal chat:

```bash
uv run friday chat
```

## Desktop app

Install frontend dependencies once:

```bash
cd frontend
npm install
```

Run Friday as a native desktop application in development mode:

```bash
npm run tauri dev
```

Create a release build and platform installer:

```bash
npm run tauri build
```

On Windows, Tauri writes the executable and installers under:

```text
frontend/src-tauri/target/release/
frontend/src-tauri/target/release/bundle/msi/
frontend/src-tauri/target/release/bundle/nsis/
```

The desktop app can locate the source checkout automatically. Set
`OPENJARVIS_ROOT` to the repository path when using a non-standard checkout
location.

## CLI and API

```bash
uv run friday --help
uv run friday ask "What should I focus on today?"
uv run friday model
uv run friday memory
uv run friday agents list
uv run friday connect
uv run friday doctor
uv run friday serve --port 8000
```

## Development

Install development dependencies:

```bash
uv sync --extra server --extra desktop --extra dev
```

Run backend tests:

```bash
uv run pytest tests/ -v
```

Run frontend tests and create a production web build:

```bash
cd frontend
npm test
npm run build
```

Format and validate the native desktop crate:

```bash
cd frontend/src-tauri
cargo fmt --check
cargo test
```

## Project layout

- `src/` — Friday Python backend and CLI
- `frontend/` — React browser UI and Tauri desktop application
- `frontend/src-tauri/` — native desktop shell and platform integration
- `rust/` — native Python performance extensions
- `configs/` — assistant and persona configuration
- `tests/` — automated test suite
- `docs/` — user and developer documentation
- `deploy/` — platform deployment helpers

## License

Friday is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

Copyright © 2026 Sahil Yadav.
