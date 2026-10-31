<div align="center">
  <img alt="Friday logo" src="frontend/public/pwa-192x192.png" width="160">
  <h1>Friday</h1>
  <p><strong>Personal AI assistant for your computer.</strong></p>
  <p>Built and maintained by <strong>Sahil Yadav</strong> &middot; Copyright &copy; 2026 Sahil Yadav</p>
</div>

Friday is a local-first personal AI assistant with a command-line interface and
a browser-based graphical interface. It supports chat, local models, custom
inference servers, agents, memory, data-source connections, scheduled work,
and developer workflows.

## Features

- **Multi-Engine Intelligence**: Chat with local models (Ollama, vLLM, llama.cpp) or cloud providers (ChatGPT/OpenAI, Google Gemini, Claude).
- **Voice & Speech**: Real-time voice interaction with local Speech-to-Text (`faster-whisper`) and neural Text-to-Speech (`edge-tts` & `kokoro`).
- **Graphical Web Dashboard**: Modern browser interface with chat, model picker, and settings (`friday gui`).
- **Autonomous Agents & Custom Tools**: Create and run agents with extensible tools (`system_status`, `calculator`, `web_search`, `file_read`, etc.).
- **Memory & Personal Data**: Connect personal data sources with persistent memory store and context search.
- **Diagnostic System Health**: One-command diagnostic checks with `friday doctor`.
- **Privacy First**: Keeps configuration and assistant data local on your device.

## Requirements

- Python 3.10 to 3.13
- [uv](https://docs.astral.sh/uv/)
- Node.js 22 or newer for the browser GUI
- Ollama or another configured inference server / cloud API keys

## Quick Start

From the project directory:

```bash
uv sync
```

Initialize Friday and check the installation:

```bash
uv run friday init
uv run friday doctor
```

Start a local chat:

```bash
uv run friday ask "What's on my calendar today?"
```

Expose an OpenAI-compatible local API:

```bash
uv run friday serve --port 8000
```

## Usage

Start an interactive chat:

```bash
uv run friday chat
```

Start the browser interface:

```bash
uv run friday gui
```

Desktop builds are available on the
[GitHub Releases page](https://github.com/open-jarvis/OpenJarvis/releases).

Useful commands:

```bash
uv run friday --help
uv run friday ask "What should I focus on today?"
uv run friday model
uv run friday memory
uv run friday tool list
uv run friday agents list
uv run friday connect
uv run friday doctor
```

The GUI installs its frontend dependencies automatically when needed. To
install them manually:

```bash
cd frontend
npm install
npm run dev
```

## Development

Install development dependencies:

```bash
uv sync --extra server --extra desktop --extra dev
```

Run the Python test suite:

```bash
uv run pytest tests/ -v
```

Build the frontend:

```bash
cd frontend
npm run build
```

## Project Layout

- `src/` — Friday Python backend and CLI
- `frontend/` — browser and desktop interface
- `rust/` — native performance extensions
- `configs/` — assistant and persona configuration
- `tests/` — automated test suite
- `docs/` — project documentation

## License

Friday is licensed under the Apache 2.0 License. See [LICENSE](LICENSE) for details.

---

**Copyright &copy; 2026 Sahil Yadav. All rights reserved.**
