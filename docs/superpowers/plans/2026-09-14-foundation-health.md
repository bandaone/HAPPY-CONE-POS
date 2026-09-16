# POS Foundation & Health Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the monorepo development foundation with a runnable FastAPI health endpoint, a runnable React/Vite shell, automated smoke tests, and a local PostgreSQL service.

**Architecture:** The repository is a small monorepo with `apps/api` and `apps/web`. The API is independently testable with FastAPI TestClient; the web application is independently testable with Vitest/React Testing Library. PostgreSQL is available through Docker Compose but the health endpoint deliberately does not depend on database availability yet.

**Tech Stack:** Python 3.12+, FastAPI, Uvicorn, Pytest, HTTPX, React 18+, TypeScript 5+, Vite, Vitest, React Testing Library, PostgreSQL 16, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-14-icecream-pos-design.md`

## Global Constraints

- Responsive web/PWA is the primary client; no proprietary POS hardware is required.
- Backend and frontend must start independently.
- Tests must be runnable before later POS domains exist.
- Configuration comes from environment variables, not hard-coded secrets.
- This plan implements foundation only. Do not add auth, products, orders, payments, stock, reporting or PWA offline behavior yet.

---

## File Structure

- `docker-compose.yml` — local PostgreSQL service.
- `.env.example` — documented local environment variables.
- `apps/api/pyproject.toml` — API runtime/dev dependencies and pytest settings.
- `apps/api/app/__init__.py` — Python package marker.
- `apps/api/app/main.py` — FastAPI app and health route.
- `apps/api/app/core/__init__.py` — core package marker.
- `apps/api/app/core/config.py` — typed environment settings.
- `apps/api/app/core/db.py` — SQLAlchemy engine/session factory.
- `apps/api/tests/test_health.py` — API smoke test.
- `apps/web/package.json` — web dependencies/scripts.
- `apps/web/index.html` — Vite HTML entry.
- `apps/web/tsconfig.json` — TypeScript config.
- `apps/web/vite.config.ts` — Vite/Vitest config.
- `apps/web/src/main.tsx` — React browser bootstrap.
- `apps/web/src/App.tsx` — first application shell.
- `apps/web/src/test/setup.ts` — Testing Library setup.
- `apps/web/src/App.test.tsx` — UI smoke test.

---

### Task 1: FastAPI health endpoint

**Files:**
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/app/__init__.py`
- Create: `apps/api/app/main.py`
- Create: `apps/api/app/core/__init__.py`
- Create: `apps/api/tests/test_health.py`

**Interfaces:**
- Produces: `app: FastAPI` from `app.main`.
- Produces: `GET /health` returning HTTP 200 and JSON `{ "status": "ok" }`.

- [ ] **Step 1: Create backend dependency manifest**

Create `apps/api/pyproject.toml`:

```toml
[project]
name = "icecream-pos-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.116,<1.0",
  "uvicorn[standard]>=0.35,<1.0",
  "sqlalchemy>=2.0,<3.0",
  "psycopg[binary]>=3.2,<4.0",
  "pydantic-settings>=2.10,<3.0"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.4,<9.0",
  "httpx>=0.28,<1.0"
]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 2: Write the failing API test**

Create `apps/api/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: Run the test and verify failure**

From `apps/api`:

```bash
python -m pip install -e '.[dev]'
pytest tests/test_health.py -v
```

Expected: test collection/import fails because `app.main` does not yet exist.

- [ ] **Step 4: Implement the minimum FastAPI app**

Create empty package markers `apps/api/app/__init__.py` and `apps/api/app/core/__init__.py`.

Create `apps/api/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="Lusaka Ice-Cream POS API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run the health test and verify pass**

```bash
pytest tests/test_health.py -v
```

Expected: `1 passed`.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/api
git commit -m "chore: establish FastAPI health endpoint"
```

---

### Task 2: Typed configuration and database session factory

**Files:**
- Create: `.env.example`
- Create: `apps/api/app/core/config.py`
- Create: `apps/api/app/core/db.py`
- Create: `apps/api/tests/test_config.py`

**Interfaces:**
- Produces: `Settings` with `database_url`, `app_env`, and `branch_timezone`.
- Produces: `get_settings()` cached settings factory.
- Produces: SQLAlchemy `engine` and `SessionLocal` objects.

- [ ] **Step 1: Write configuration test**

Create `apps/api/tests/test_config.py`:

```python
from app.core.config import Settings


def test_settings_accept_explicit_values() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://pos:pos@localhost:5432/icecream_pos",
        app_env="test",
        branch_timezone="Africa/Lusaka",
    )

    assert settings.app_env == "test"
    assert settings.branch_timezone == "Africa/Lusaka"
```

- [ ] **Step 2: Run test and verify failure**

```bash
pytest tests/test_config.py -v
```

Expected: import fails because `app.core.config` does not exist.

- [ ] **Step 3: Implement settings**

Create `apps/api/app/core/config.py`:

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://pos:pos@localhost:5432/icecream_pos"
    app_env: str = "development"
    branch_timezone: str = "Africa/Lusaka"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Create `.env.example`:

```dotenv
DATABASE_URL=postgresql+psycopg://pos:pos@localhost:5432/icecream_pos
APP_ENV=development
BRANCH_TIMEZONE=Africa/Lusaka
```

- [ ] **Step 4: Add database factory**

Create `apps/api/app/core/db.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
```

- [ ] **Step 5: Run backend tests**

```bash
pytest -v
```

Expected: both health and settings tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add .env.example apps/api/app/core apps/api/tests/test_config.py
git commit -m "chore: add typed application configuration"
```

---

### Task 3: Local PostgreSQL with Docker Compose

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Produces local PostgreSQL on `localhost:5432` with database `icecream_pos` and development credentials matching `.env.example`.

- [ ] **Step 1: Create compose file**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: icecream_pos
      POSTGRES_USER: pos
      POSTGRES_PASSWORD: pos
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pos -d icecream_pos"]
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - pos_postgres_data:/var/lib/postgresql/data

volumes:
  pos_postgres_data:
```

- [ ] **Step 2: Validate Compose syntax**

```bash
docker compose config
```

Expected: configuration renders without errors.

- [ ] **Step 3: Start database and verify health**

```bash
docker compose up -d db
docker compose ps
```

Expected: `db` reaches `healthy`.

- [ ] **Step 4: Commit Task 3**

```bash
git add docker-compose.yml
git commit -m "chore: add local PostgreSQL service"
```

---

### Task 4: React/Vite application shell with test

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces web app whose root heading reads `Lusaka Ice-Cream POS`.
- Produces `npm test` and `npm run build` scripts.

- [ ] **Step 1: Create frontend manifest**

Create `apps/web/package.json`:

```json
{
  "name": "icecream-pos-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create TypeScript/Vite test configuration**

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
```

- [ ] **Step 3: Write failing UI test**

Create `apps/web/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `apps/web/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("shows the POS product name", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Lusaka Ice-Cream POS" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Install and run test to verify failure**

From `apps/web`:

```bash
npm install
npm test
```

Expected: fails because `App.tsx` does not exist.

- [ ] **Step 5: Implement minimal application shell**

Create `apps/web/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main>
      <h1>Lusaka Ice-Cream POS</h1>
      <p>Point of sale system foundation.</p>
    </main>
  );
}
```

Create `apps/web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lusaka Ice-Cream POS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Run UI test and production build**

```bash
npm test
npm run build
```

Expected: test passes and Vite creates `dist/`.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/web
git commit -m "chore: establish React application shell"
```

---

### Task 5: Foundation verification and developer instructions

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces exact local startup/test instructions for the next implementation plan.

- [ ] **Step 1: Add commands to README**

Document:

```bash
# database
docker compose up -d db

# API
cd apps/api
python -m venv .venv
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
# Linux/macOS: source .venv/bin/activate
python -m pip install -e '.[dev]'
uvicorn app.main:app --reload

# API tests
pytest -v

# Web
cd apps/web
npm install
npm run dev

# Web tests/build
npm test
npm run build
```

- [ ] **Step 2: Run final foundation verification**

```bash
cd apps/api && pytest -v
cd ../web && npm test && npm run build
cd ../.. && docker compose config
```

Expected: all tests/build/config checks pass.

- [ ] **Step 3: Inspect git diff and ensure no product-domain features were added**

```bash
git status --short
git diff --stat HEAD
```

Expected: only foundation/readme changes since the previous commit.

- [ ] **Step 4: Commit Task 5**

```bash
git add README.md
git commit -m "docs: add local development workflow"
```

## Plan Self-Review

- Spec coverage for this sub-project: development foundation only, intentionally no POS domain logic.
- Placeholder scan: no TBD/TODO/"implement later" instructions.
- Type consistency: `Settings`, `app`, `engine`, and `SessionLocal` names are consistent across tasks.
- Next plan after completion: authentication/roles, followed by catalog/recipes.
