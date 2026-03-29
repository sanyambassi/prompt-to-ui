# Prompt to UI

An open-source, self-hosted AI design tool that generates production-quality UI screens from text prompts. Bring your own API keys and run it locally.

Inspired by [Google Stitch](https://stitch.withgoogle.com/).

## Features

- **Text-to-UI generation** — Describe any interface and get pixel-perfect HTML/CSS screens
- **Multi-model support** — OpenAI (GPT-5.4), Anthropic (Claude), Google (Gemini), xAI (Grok)
- **AI image synthesis** — Embedded image generation for realistic mockups
- **Multi-screen projects** — Generate complete app flows with multiple screens
- **Live editing** — Click any element on the canvas to edit it inline
- **Prototype links** — Clickable flows between screens
- **Version snapshots** — Save and restore design states
- **Export** — Download self-contained HTML/CSS bundles
- **No auth required** — Single-user, fully local deployment

## Quick Start (Docker)

The fastest way to get running. Requires [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

### 1. Create a `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: studio
      POSTGRES_PASSWORD: studio
      POSTGRES_DB: studio
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U studio -d studio"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    image: sanyambassi/prompt-to-ui:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://studio:studio@db:5432/studio
    volumes:
      - uploads:/app/public/uploads
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
  uploads:
```

### 2. Start

```bash
docker compose up -d
```

### 3. Configure API keys

Open [http://localhost:3000/settings](http://localhost:3000/settings) and add at least one API key:

| Provider  | Key format    | Used for                                   |
| --------- | ------------- | ------------------------------------------ |
| OpenAI    | `sk-...`      | UI generation (GPT-5.4), image synthesis   |
| Anthropic | `sk-ant-...`  | UI generation (Claude Sonnet/Opus)         |
| Google AI | `AI...`       | UI generation (Gemini), image synthesis    |
| xAI       | `xai-...`     | UI generation (Grok), image synthesis      |

Keys are stored in the local PostgreSQL database and never leave your machine.

> **Note:** Anthropic (Claude) does not support image generation. If you only add an Anthropic key, UI screens will generate fine but embedded images will be skipped. Add an OpenAI, Google, or xAI key alongside Anthropic for full image synthesis.

### 4. Generate

Open [http://localhost:3000](http://localhost:3000), type a prompt, and hit Generate.

---

## Build & Deploy from Source

If you prefer to build the Docker image yourself or develop locally.

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Option A: Build your own Docker image

```bash
git clone https://github.com/sanyambassi/prompt-to-ui.git
cd prompt-to-ui
docker compose up -d
```

This uses the included `docker-compose.yml` which builds the image from the `Dockerfile` locally instead of pulling from Docker Hub.

### Option B: Local development (hot reload)

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
