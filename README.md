# MicroSaaS Template

> **Clone. Define. Build.** Full-stack SaaS in minutes with parallel AI agents.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/manojkanur/MicroSaaS-Template-Private.git my-saas
cd my-saas

# 2. Define your product
/setup-project              # Interactive wizard (or edit INITIAL.md manually)

# 3. Generate blueprint
/generate-prp INITIAL.md

# 4. Build with parallel agents
/execute-prp PRPs/[name]-prp.md

# 5. Quality check
/verify
```

---

## What You Get

- FastAPI backend with JWT + Google OAuth
- React + TypeScript frontend with modern UI (Framer Motion)
- PostgreSQL database with SQLAlchemy + Alembic migrations
- Docker + GitHub Actions CI/CD
- 80%+ test coverage (pytest + Vitest + Playwright E2E)
- Security audit (OWASP Top 10)
- Optional: React Native + Flutter mobile apps

---

## Architecture

```
INITIAL.md → /generate-prp → PRP blueprint → /execute-prp → Full App
                                                    │
                                              ORCHESTRATOR
                                                    │
         ┌──────────────────────────────────────────┼──────────────────┐
         │                                          │                  │
    Phase 1 (Parallel)                    Phase 2 (Per Module)   Phase 3 (Parallel)
    ├─ DATABASE-AGENT                     ├─ BACKEND-AGENT       ├─ tdd-guide
    ├─ BACKEND-AGENT                      └─ FRONTEND-AGENT      ├─ code-reviewer
    ├─ FRONTEND-AGENT                                            ├─ security-reviewer
    └─ DEVOPS-AGENT                                              └─ e2e-runner
         │                                          │                  │
    Validation Gate 1                     Validation Gate 2      Final Validation
```

---

## Commands (14)

### Build Phase

| Command | Description |
|---------|-------------|
| `/setup-project` | Interactive wizard — collects product info, generates INITIAL.md + CLAUDE.md |
| `/generate-prp` | Creates implementation blueprint (PRP) from INITIAL.md |
| `/execute-prp` | ORCHESTRATOR dispatches 6+ agents in parallel phases |

### Quality Phase

| Command | Description |
|---------|-------------|
| `/verify` | Full verification: build + types + lint + tests + secrets check |
| `/code-review` | Comprehensive code quality review (security + quality + best practices) |
| `/security-review` | OWASP Top 10 vulnerability scan + dependency audit |
| `/tdd` | Test-driven development — write tests first, then implement |
| `/build-fix` | Auto-fix build and type errors with minimal diffs |
| `/e2e` | Generate and run Playwright E2E tests for critical user flows |
| `/plan` | Create detailed implementation plan — waits for confirmation before coding |
| `/learn` | Extract reusable patterns from current session |

### Mobile Phase

| Command | Description |
|---------|-------------|
| `/generate-mobile-rn` | Generate React Native + Expo app from backend API |
| `/generate-mobile-flutter` | Generate Flutter app with clean architecture |
| `/mobile-review` | Mobile-specific code review (RN / Flutter / both) |

---

## Agents (16)

### Build Agents

| Agent | Role | Skills | Rules |
|-------|------|--------|-------|
| **ORCHESTRATOR** | Coordinates all agents, manages phases and validation gates | 9 skills (all core) | common + python + typescript |
| **database-agent** | SQLAlchemy models, relationships, Alembic migrations | DATABASE, python-patterns, python-testing | common + python |
| **backend-agent** | FastAPI endpoints, services, schemas, auth | BACKEND, api-design, python-patterns, python-testing, security-review | common + python |
| **frontend-agent** | React components, pages, routing, animations | FRONTEND, frontend-patterns, e2e-testing, coding-standards | common + typescript |
| **devops-agent** | Docker, docker-compose, GitHub Actions CI/CD | DEPLOYMENT, docker-patterns, security-review | common |

### Quality Agents

| Agent | Role | Skills | Rules |
|-------|------|--------|-------|
| **code-reviewer** | Code quality, security, best practices review | coding-standards, security-review, api-design, frontend-patterns, python-patterns | common + python + typescript |
| **security-reviewer** | OWASP Top 10, secrets detection, dependency audit | security-review, cloud-infra-security, api-design | common + all language security rules |
| **python-reviewer** | Python PEP 8, type hints, Pythonic patterns | python-patterns, python-testing, security-review, coding-standards, api-design | common + python |
| **typescript-reviewer** | TypeScript strictness, async correctness, React patterns | coding-standards, frontend-patterns, security-review, e2e-testing | common + typescript |
| **flutter-reviewer** | Flutter/Dart idioms, widget composition, state management | flutter-dart-code-review, android-clean-architecture, security-review, coding-standards | common + kotlin + swift |
| **tdd-guide** | Test-driven development (Red-Green-Refactor), 80%+ coverage | tdd-workflow, python-testing, e2e-testing, TESTING | common + python + typescript testing |
| **build-error-resolver** | Fix build/type errors with minimal diffs | frontend-patterns, python-patterns, coding-standards, docker-patterns | common + typescript + python |
| **e2e-runner** | Playwright E2E tests, Page Object Model, artifact capture | e2e-testing, TESTING, frontend-patterns, security-review | common + typescript |
| **planner** | Implementation planning, risk assessment, phased breakdown | api-design, BACKEND, FRONTEND, DATABASE, DEPLOYMENT, TESTING, security-review | common |

### Mobile Agents

| Agent | Role | Skills | Rules |
|-------|------|--------|-------|
| **react-native-agent** | Expo + TypeScript mobile app, navigation, secure storage | FRONTEND, frontend-patterns, e2e-testing, security-review, coding-standards | common + typescript |
| **flutter-agent** | Flutter clean architecture, Riverpod/BLoC, Dio | flutter-dart-code-review, android-clean-architecture, swiftui-patterns, compose-multiplatform, security-review, e2e-testing | common + kotlin + swift |

---

## Skills (26 files)

### Core Skills (5)

| Skill | Contains |
|-------|----------|
| `skills/BACKEND.md` | FastAPI + JWT + OAuth + error handling patterns |
| `skills/FRONTEND.md` | React + UI Kit (GlassCard, GradientButton, PageWrapper) + API integration |
| `skills/DATABASE.md` | SQLAlchemy models + Alembic migrations + relationships |
| `skills/TESTING.md` | pytest + Vitest patterns |
| `skills/DEPLOYMENT.md` | Docker + GitHub Actions CI/CD |

### Extended Skills (21)

| Category | Skills |
|----------|--------|
| **Python** | python-patterns, python-testing |
| **TypeScript/React** | frontend-patterns, coding-standards |
| **API** | api-design |
| **Security** | security-review, cloud-infrastructure-security |
| **Testing** | tdd-workflow, e2e-testing |
| **DevOps** | docker-patterns |
| **Learning** | continuous-learning-v2 |
| **Flutter/Dart** | flutter-dart-code-review |
| **Android** | android-clean-architecture, compose-multiplatform-patterns, kotlin-patterns, kotlin-coroutines-flows |
| **iOS/Swift** | swiftui-patterns, swift-actor-persistence, swift-concurrency-6-2, swift-protocol-di-testing |

---

## Rules (26 files)

Rules enforce coding standards across all agents.

| Category | Files |
|----------|-------|
| `rules/common/` | coding-style, security, testing, code-review, git-workflow, performance |
| `rules/python/` | coding-style, patterns, security, testing, hooks |
| `rules/typescript/` | coding-style, patterns, security, testing, hooks |
| `rules/kotlin/` | coding-style, patterns, security, testing, hooks |
| `rules/swift/` | coding-style, patterns, security, testing, hooks |

---

## Hooks (Quality Gates)

Hooks run automatically to enforce quality during development.

| Hook | When | What |
|------|------|------|
| **SessionStart** | New session | Load previous context, detect package manager |
| **PreToolUse (Bash)** | Before git commit | Lint staged files, validate commit message, detect secrets |
| **PostToolUse (Edit/Write)** | After file edits | Quality gate checks, TypeScript type check, console.log warning |
| **Stop** | After each response | Check for console.log in modified files, persist session state |
| **SessionEnd** | Session closes | Session end lifecycle marker |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI + Python 3.11+ |
| **Frontend** | React + TypeScript + Vite |
| **Database** | PostgreSQL + SQLAlchemy + Alembic |
| **Auth** | JWT + Google OAuth (bcrypt) |
| **UI** | Chakra UI or Tailwind + Framer Motion |
| **Testing** | pytest + Vitest + Playwright |
| **Deploy** | Docker + GitHub Actions |
| **Mobile (optional)** | React Native (Expo) / Flutter |

---

## Project Structure

```
my-saas/
├── INITIAL.md                    # Product definition (you edit this)
├── CLAUDE.md                     # Project rules (auto-generated or manual)
├── agents/                       # 16 agent definitions
│   ├── ORCHESTRATOR.md           #   Main coordinator
│   ├── database-agent.md         #   Models + migrations
│   ├── backend-agent.md          #   API + auth
│   ├── frontend-agent.md         #   UI + pages
│   ├── devops-agent.md           #   Docker + CI/CD
│   ├── react-native-agent.md     #   React Native mobile
│   ├── flutter-agent.md          #   Flutter mobile
│   ├── security-reviewer.md      #   OWASP security audit
│   ├── code-reviewer.md          #   Code quality review
│   ├── python-reviewer.md        #   Python-specific review
│   ├── typescript-reviewer.md    #   TypeScript-specific review
│   ├── flutter-reviewer.md       #   Flutter/Dart review
│   ├── tdd-guide.md              #   Test-driven development
│   ├── build-error-resolver.md   #   Fix build errors
│   ├── e2e-runner.md             #   Playwright E2E tests
│   └── planner.md                #   Implementation planning
├── skills/                       # 26 skill files
│   ├── BACKEND.md, FRONTEND.md, DATABASE.md, TESTING.md, DEPLOYMENT.md
│   ├── api-design/               #   API design patterns
│   ├── security-review/          #   Security checklist
│   ├── python-patterns/          #   Python best practices
│   ├── python-testing/           #   pytest patterns
│   ├── frontend-patterns/        #   React/TS patterns
│   ├── coding-standards/         #   Code review standards
│   ├── tdd-workflow/             #   TDD methodology
│   ├── e2e-testing/              #   Playwright patterns
│   ├── docker-patterns/          #   Docker best practices
│   ├── continuous-learning-v2/   #   Auto pattern learning
│   ├── flutter-dart-code-review/ #   Flutter review checklist
│   ├── android-clean-architecture/
│   ├── compose-multiplatform-patterns/
│   ├── kotlin-patterns/
│   ├── kotlin-coroutines-flows/
│   ├── swiftui-patterns/
│   ├── swift-actor-persistence/
│   ├── swift-concurrency-6-2/
│   └── swift-protocol-di-testing/
├── rules/                        # 26 rule files
│   ├── common/                   #   Security, testing, coding-style, code-review, git, performance
│   ├── python/                   #   PEP 8, patterns, security, testing, hooks
│   ├── typescript/               #   TS style, patterns, security, testing, hooks
│   ├── kotlin/                   #   Kotlin style, patterns, security, testing, hooks
│   └── swift/                    #   Swift style, patterns, security, testing, hooks
├── scripts/                      # Hook scripts + orchestration library
│   ├── hooks/                    #   Quality gate scripts (11 files)
│   └── lib/                      #   Utilities + tmux worktree orchestrator (16 files)
├── hooks/
│   └── hooks.json                # Hook configuration
├── .claude/
│   └── commands/                 # 14 slash commands
└── PRPs/                         # Generated blueprints (after /generate-prp)
```

### Generated App Structure

```
my-saas/
├── backend/
│   ├── app/
│   │   ├── main.py, config.py, database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/
│   │   └── auth/
│   ├── alembic/
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── services/
│       ├── context/
│       └── types/
├── mobile/                       # (optional) React Native
├── mobile_flutter/               # (optional) Flutter
├── docker-compose.yml
├── .github/workflows/ci.yml
└── .env.example
```

---

## Multi-Project Workflow

Work on multiple SaaS products simultaneously using the built-in tmux + git worktree orchestrator.

### Option A: Separate Clones (Simplest)

```bash
# Project 1
git clone MicroSaaS-Template invoice-saas
cd invoice-saas && /setup-project

# Project 2 (separate terminal)
git clone MicroSaaS-Template crm-saas
cd crm-saas && /setup-project
```

Each project gets its own Claude Code session with isolated context.

### Option B: Worktree Orchestration (Advanced)

The template includes a tmux + git worktree orchestrator (`scripts/lib/tmux-worktree-orchestrator.js`) for parallel agent execution within a single project:

```
tmux session: my-saas
┌──────────────────┬──────────────────┐
│   orchestrator   │  database-agent  │
├──────────────────┼──────────────────┤
│  backend-agent   │  frontend-agent  │
├──────────────────┼──────────────────┤
│   devops-agent   │   test-agent     │
└──────────────────┴──────────────────┘

Each pane = isolated git worktree + branch
├── my-saas-session-database/   (branch: orchestrator-session-database)
├── my-saas-session-backend/    (branch: orchestrator-session-backend)
├── my-saas-session-frontend/   (branch: orchestrator-session-frontend)
└── my-saas-session-devops/     (branch: orchestrator-session-devops)
```

**Key files:**
- `scripts/lib/tmux-worktree-orchestrator.js` — Creates worktrees + tmux panes
- `scripts/lib/orchestration-session.js` — Session management
- `scripts/lib/session-manager.js` — Cross-session state persistence

**Coordination directory** (`.orchestration/session-name/`):
- `worker/task.md` — What the agent should do
- `worker/handoff.md` — Agent's output and results
- `worker/status.md` — Current progress

### Session Persistence

Hooks automatically save/restore context between sessions:
- **SessionStart** — Loads previous context and detects environment
- **SessionEnd** — Persists state for next session
- **Stop** — Saves incremental state after each response

---

## Example

```bash
# 1. Define an invoice SaaS
/setup-project
# Answer: "InvoicePro", "Invoice management for freelancers"
# Modules: Invoices, Clients, Dashboard

# 2. Generate blueprint
/generate-prp INITIAL.md
# Creates PRPs/invoicepro-prp.md

# 3. Build (4+ agents in parallel)
/execute-prp PRPs/invoicepro-prp.md

# 4. Quality checks
/verify                    # Build + lint + test
/security-review           # OWASP scan
/e2e                       # E2E tests

# 5. Optional: Add mobile
/generate-mobile-rn        # React Native app
/generate-mobile-flutter   # Flutter app
/mobile-review both        # Review both platforms
```

---

## Run Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Docker (everything)
docker-compose up -d

# URLs
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
```

---

## Validation

```bash
# Backend
ruff check backend/ && pytest backend/tests -v --cov=backend/app --cov-fail-under=80

# Frontend
cd frontend && npm run lint && npm run type-check && npm test

# E2E
npx playwright test

# Docker
docker-compose build && docker-compose up -d

# Full check (all at once)
/verify full
```
