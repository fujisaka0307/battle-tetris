# Battle Tetris

Real-time multiplayer Tetris battle game built with React, Express, and SignalR.

Two players compete head-to-head in real time: clear lines to send garbage to your opponent, and the last one standing wins.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand 5 |
| Backend | Express 5, Node.js 22, SignalR 8, WebSocket |
| Shared | TypeScript shared types and constants (workspace) |
| Infrastructure | Azure Static Web Apps, Azure App Service, Azure SignalR Service |
| IaC | Bicep (Azure Resource Manager templates) |

## Project Structure

```
battle-tetris/
├── client/                  # React frontend (Vite + Tailwind)
│   └── src/
│       ├── game/            # Game engine, board, tetromino, renderer
│       ├── network/         # SignalR client for real-time communication
│       ├── pages/           # TopPage, LobbyPage, BattlePage, ResultPage
│       └── stores/          # Zustand state management
├── server/                  # Express backend
│   └── src/
│       ├── hubs/            # GameHub (game logic), SignalR adapter
│       ├── services/        # RoomManager, MatchmakingService, GameSessionManager
│       └── models/          # Room, Player data models
├── shared/                  # Shared types, constants, message definitions
├── e2e/                     # 33 Playwright E2E test suites
├── infrastructure/          # Azure Bicep templates
│   ├── modules/             # App Service, Static Web App, SignalR, Monitoring
│   └── parameters/          # Dev / Prod environment parameters
├── scripts/                 # CI tooling (Allure converters, dev helpers)
└── .github/
    └── workflows/           # 6 GitHub Actions workflows
```

## Getting Started

### Prerequisites

- Node.js 22+
- npm 10+

### Development

```bash
# Install dependencies
npm ci

# Start both client and server in development mode
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- SignalR Hub: ws://localhost:4000/hub

### Build

```bash
npm run build
```

### Lint & Format

```bash
npm run lint          # ESLint (zero warnings policy)
npm run format        # Prettier
```

---

## Testing

This project has comprehensive testing at every layer, with **28 unit tests** and **33 E2E test suites** covering the full application lifecycle.

### Unit Tests (Vitest)

```bash
npm test              # Run all unit tests
npm run test:client   # Client tests only
npm run test:server   # Server tests only
npm run test:shared   # Shared tests only
```

| Workspace | Test Files | Coverage |
|-----------|-----------|----------|
| Client | 16 files (game engine, pages, network, stores) | Board, Tetromino, GameEngine, Renderer, SignalR, all pages |
| Server | 9 files (hubs, services, models) | GameHub, RoomManager, MatchmakingService, GameSessionManager, GarbageCalculator |
| Shared | 3 files (types, messages, constants) | Message definitions, type exports, constant values |

### E2E Tests (Playwright)

```bash
npm run test:e2e          # Run all E2E tests
npm run test:e2e:prod     # Production smoke tests
```

33 test suites covering:

| Category | Tests | What's Covered |
|----------|-------|----------------|
| Room & Lobby | `lobby.spec.ts`, `lobby-extended.spec.ts`, `lobby-copy-leave.spec.ts`, `room-join-errors.spec.ts` | Room creation, joining, copying room ID, leaving, error handling |
| Battle Mechanics | `battle.spec.ts`, `battle-controls.spec.ts`, `battle-opponent.spec.ts`, `score-level.spec.ts` | Piece movement, rotation, hard drop, opponent board sync, scoring |
| Matchmaking | `random-match.spec.ts`, `random-match-multi.spec.ts`, `random-match-lifecycle.spec.ts`, `random-match-edge.spec.ts`, `random-match-disconnect.spec.ts` | Queue matching, lifecycle, edge cases, disconnection during matching |
| Disconnection | `disconnect.spec.ts`, `disconnect-battle.spec.ts`, `disconnect-variations.spec.ts` | Mid-game disconnect, reconnection handling, various disconnect scenarios |
| Game Lifecycle | `countdown-flow.spec.ts`, `game-over.spec.ts`, `full-game-cycle.spec.ts` | Countdown, game over detection, full game flow from start to result |
| Rematch | `rematch-scenario.spec.ts`, `rematch-full.spec.ts`, `rematch-variations.spec.ts` | Rematch request, acceptance, decline, various rematch scenarios |
| Multi-room | `multi-room-battle.spec.ts`, `cross-match.spec.ts`, `room-concurrency.spec.ts` | Multiple simultaneous rooms, cross-match isolation, concurrent access |
| Navigation & UI | `top-page.spec.ts`, `top-page-validation.spec.ts`, `not-found.spec.ts`, `result-navigation.spec.ts` | Page navigation, input validation, 404 handling, result page |
| Opponent Sync | `opponent-sync.spec.ts` | Real-time board state synchronization between players |
| Waiting Room | `waiting-room-list.spec.ts` | Room list subscription, join from list |
| Smoke Tests | `smoke.spec.ts`, `production-smoke.spec.ts` | Basic functionality, production health check |

### Test Reporting

All test results are aggregated into a unified **Allure Report** published to GitHub Pages on every CI run.

---

## CI/CD Pipeline

The CI/CD system runs **8 parallel quality checks** on every push and pull request, covering code quality, security, performance, and functional correctness. All results are unified into a single Allure dashboard.

### Pipeline Overview

```
push / pull request
│
├─ lint-and-test          Lint, typecheck, unit tests, build
├─ npm-audit              Dependency vulnerability scanning (SCA)
│
│  (after lint-and-test passes)
├─ sonarcloud             Static analysis + code coverage
├─ e2e                    33 Playwright E2E test suites
├─ zap-scan               OWASP ZAP dynamic security scan (DAST)
├─ lighthouse             Performance, accessibility, SEO audit
│
│  (after all jobs complete)
└─ allure-report          Unified dashboard → GitHub Pages

Independent workflows (run in parallel):
├─ codeql                 GitHub-native SAST (push/PR + weekly)
└─ gitleaks               Secret leak detection (push/PR)
```

### Quality Gates & Checks

| Check | Tool | What It Does | Fail Condition |
|-------|------|-------------|----------------|
| **Lint** | ESLint | Static code analysis | Any warning or error |
| **Type Safety** | TypeScript | Type checking all 3 workspaces | Any type error |
| **Unit Tests** | Vitest | 28 test files across all workspaces | Any test failure |
| **E2E Tests** | Playwright | 33 browser-based test suites | Any test failure |
| **SAST** | SonarCloud | Bugs, vulnerabilities, code smells, duplication | Quality gate failure |
| **SAST** | CodeQL | Security vulnerabilities + code quality | Security findings |
| **SCA** | npm audit | Dependency vulnerability scanning | Critical/high severity |
| **SCA** | Dependabot | Automated dependency update PRs | N/A (advisory) |
| **DAST** | OWASP ZAP | Dynamic application security testing | Medium/high risk alerts |
| **Secrets** | Gitleaks | Secret/credential leak detection | Any leak detected |
| **Performance** | Lighthouse CI | Performance, accessibility, best practices, SEO | Below threshold |
| **Server Hardening** | helmet + rate-limit | Security headers, API rate limiting | N/A (runtime) |

### Unified Allure Report

All results from every tool are converted to Allure format and aggregated into a single report:

```
Allure Report (GitHub Pages)
├── Unit Tests           Vitest results (client, server, shared)
├── E2E Tests            Playwright results (33 suites)
├── SonarCloud           Code quality metrics, bugs, vulnerabilities
├── CodeQL               SAST security findings
├── npm audit            Dependency vulnerability findings
├── Gitleaks             Secret scanning results
├── OWASP ZAP            DAST scan alerts by risk level
├── Lighthouse           Performance / Accessibility / SEO scores
└── Security Dashboard   Aggregated security posture across all tools
```

Custom converter scripts (`scripts/*-to-allure.mjs`) transform each tool's native output into Allure-compatible JSON, enabling a single dashboard view of all quality dimensions.

### Deployment Workflows

| Workflow | Trigger | Target |
|----------|---------|--------|
| `deploy-frontend.yml` | Push to main (`client/` or `shared/` changes) | Azure Static Web Apps |
| `deploy-backend.yml` | Push to main (`server/` or `shared/` changes) | Azure App Service |
| `production-e2e.yml` | After deployment succeeds | Production smoke tests |

### Dependabot Configuration

Automated dependency updates run weekly:

- **npm packages**: Minor/patch updates grouped into a single PR to reduce noise
- **GitHub Actions**: Action version updates tracked separately
- Labels applied automatically for filtering (`dependencies`, `security`, `ci`)

---

## Security

### Server-Side Protections

| Protection | Implementation |
|-----------|---------------|
| Security Headers | `helmet` (X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.) |
| Rate Limiting | `express-rate-limit` on `/api` routes (100 req / 15 min) |
| Input Validation | `zod` schema validation on all incoming messages |
| CORS | Configured with credentials support |
| Framework Fingerprint | `x-powered-by` header disabled |

### Security Scanning

| Layer | Tool | Frequency |
|-------|------|-----------|
| Static Analysis (SAST) | SonarCloud + CodeQL | Every push/PR + weekly |
| Dependency Analysis (SCA) | npm audit + Dependabot | Every push/PR + weekly |
| Dynamic Analysis (DAST) | OWASP ZAP Baseline | Every push/PR |
| Secret Detection | Gitleaks | Every push/PR |

### GitHub Security Integration

- **Code scanning alerts**: CodeQL findings in the Security tab
- **Dependabot alerts**: Known vulnerability notifications
- **Secret scanning**: GitHub-native push protection

---

## Infrastructure

Azure resources managed with Bicep (IaC):

```
Azure (Japan East)
├── Static Web App          Frontend hosting (global CDN)
├── App Service (Linux)     Backend API + WebSocket
├── Azure SignalR Service   Managed real-time messaging
├── Application Insights    Monitoring + telemetry
└── Log Analytics           Centralized logging
```

Environment parameters for `dev` and `prod` in `infrastructure/parameters/`.

Deploy infrastructure:

```bash
cd infrastructure
./deploy.sh dev    # or prod
```

---

## Architecture

```
┌──────────────┐     WebSocket/SignalR     ┌──────────────┐
│              │ ◄────────────────────────► │              │
│  React App   │                            │  Express API │
│  (Vite)      │     HTTP (health, API)     │  (Node.js)   │
│              │ ◄────────────────────────► │              │
└──────┬───────┘                            └──────┬───────┘
       │                                           │
       │  imports                          imports  │
       ▼                                           ▼
┌──────────────────────────────────────────────────┐
│              @battle-tetris/shared                │
│         Types, Constants, Message Definitions     │
└──────────────────────────────────────────────────┘
```

- **Real-time Communication**: SignalR over WebSocket for game state synchronization
- **State Management**: Zustand stores on client, in-memory room/game management on server
- **Monorepo**: npm workspaces with shared type safety across client and server

---

## License

MIT
