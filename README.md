# Prompt to UI

An open-source, self-hosted AI design tool that generates production-quality UI screens from text prompts. Bring your own API keys and run it locally.

Inspired by [Google Stitch](https://stitch.withgoogle.com/).

## Features

- **Text-to-UI generation** — Describe any interface and get pixel-perfect HTML/CSS screens
- **Multi-model support** — OpenAI (GPT-5.4), Anthropic (Claude), Google (Gemini), xAI (Grok)
- **AI image synthesis** — Embedded image generation for realistic mockups
- **URL replication** — Attach a website URL and the AI will browse it and replicate the design
- **Multi-screen projects** — Generate complete app flows with multiple screens
- **Live editing** — Click any element on the canvas to edit it inline
- **Prototype links** — Clickable flows between screens
- **Version snapshots** — Save and restore design states
- **Export** — Download self-contained HTML/CSS bundles
- **No auth required** — Single-user, fully local deployment

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

```bash
git clone https://github.com/sanyambassi/prompt-to-ui.git
cd prompt-to-ui
docker compose up -d
```

This pulls the pre-built image from Docker Hub and starts the app with a local PostgreSQL database. The repository includes the database schema (`db/migrations/init.sql`) which Postgres runs automatically on first start.

Open [http://localhost:3000/settings](http://localhost:3000/settings) and add at least one API key:

| Provider  | Key format    | Used for                                   |
| --------- | ------------- | ------------------------------------------ |
| OpenAI    | `sk-...`      | UI generation (GPT-5.4), image synthesis   |
| Anthropic | `sk-ant-...`  | UI generation (Claude Sonnet/Opus)         |
| Google AI | `AI...`       | UI generation (Gemini), image synthesis    |
| xAI       | `xai-...`     | UI generation (Grok), image synthesis      |

Keys are stored in the local PostgreSQL database and never leave your machine.

> **Note:** Anthropic (Claude) does not support image generation. If you only add an Anthropic key, UI screens will generate fine but embedded images will be skipped. Add an OpenAI, Google, or xAI key alongside Anthropic for full image synthesis.

Then open [http://localhost:3000](http://localhost:3000), type a prompt, and hit Generate.

---

## Build from Source

To build the Docker image yourself instead of pulling from Docker Hub:

```bash
git clone https://github.com/sanyambassi/prompt-to-ui.git
cd prompt-to-ui
```

Edit `docker-compose.yml` — comment out the `image` line and uncomment `build`:

```yaml
  app:
    # image: sanyambassi/prompt-to-ui:latest
    build: .
```

Then start:

```bash
docker compose up -d --build
```

---

## Local Development (Hot Reload)

Run Postgres in Docker and the Next.js dev server natively:

```bash
# Terminal 1 — start Postgres only
docker compose up db

# Terminal 2 — install dependencies and run dev server
npm install
DATABASE_URL=postgres://studio:studio@localhost:5432/studio npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Changes to source files auto-reload.

---

## Architecture

```
prompt-to-ui/
├── db/migrations/init.sql       # PostgreSQL schema (auto-runs on first start)
├── docker-compose.yml           # App + Postgres containers
├── Dockerfile                   # Multi-stage Next.js production build
├── src/
│   ├── actions/studio/          # Server actions (DB queries)
│   ├── app/                     # Next.js App Router pages & API routes
│   ├── components/              # React components
│   ├── lib/
│   │   ├── db/                  # PostgreSQL connection pool
│   │   ├── llm/                 # LLM provider adapters (OpenAI, Anthropic, Google, xAI)
│   │   ├── prompts/             # System prompt engineering
│   │   ├── schema/              # UI schema types, HTML generation, export
│   │   └── studio/              # Generation pipeline, attachments, references
│   └── store/                   # Zustand client-side state
└── public/uploads/              # Local file storage (Docker volume)
```

## Data Persistence

Both database and uploaded files persist across container restarts via Docker named volumes:

- **`pgdata`** — PostgreSQL data (projects, screens, settings)
- **`uploads`** — AI-generated images and user uploads

To back up your data:

```bash
# Database
docker compose exec db pg_dump -U studio studio > backup.sql

# Uploads
docker cp $(docker compose ps -q app):/app/public/uploads ./uploads-backup
```

## Tech Stack

- [Next.js](https://nextjs.org/) 16 (App Router, Server Actions)
- [React](https://react.dev/) 19
- [Tailwind CSS](https://tailwindcss.com/) 4
- [PostgreSQL](https://www.postgresql.org/) 16
- [Zustand](https://zustand.docs.pmnd.rs/) for client state
- [Zod](https://zod.dev/) for runtime validation

## License

[MIT](./LICENSE)
