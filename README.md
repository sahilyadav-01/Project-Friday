<div align="center">
  <img alt="Friday logo" src="frontend/public/pwa-192x192.png" width="160">
  <h1>Friday</h1>
  <p><strong>Personal AI assistant for your computer.</strong></p>
  <p>Built and maintained by Sahil Yadav.</p>
</div>

Friday is a local-first personal AI assistant with a command-line interface and
a browser-based graphical interface. It supports chat, local models, custom
inference servers, agents, memory, data-source connections, scheduled work,
and developer workflows.

## Features

- Chat with local models or a configured inference server.
- Launch a browser GUI with `friday gui`.
- Create and run agents with tools, memory, schedules, and channels.
- Connect supported personal data sources for search and context.
- Inspect setup health with `friday doctor`.
- Keep configuration and assistant data on your computer by default.

## Requirements

- Python 3.10 to 3.13
- [uv](https://docs.astral.sh/uv/)
- Node.js 22 or newer for the browser GUI
- Ollama or another configured inference server

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

Start a chat:

```bash
uv run friday
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

- `src/` - Friday Python backend and CLI
- `frontend/` — browser interface
- `rust/` — native performance extensions
- `configs/` — assistant and persona configuration
- `tests/` — automated tests
- `docs/` — project documentation

## License

Friday is licensed under the Apache 2.0 License. See [LICENSE](LICENSE) for
details.

Copyright (c) 2026 Sahil Yadav. All rights reserved.
