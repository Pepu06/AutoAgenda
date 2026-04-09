# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (all apps in parallel)
npm run dev

# Build all apps
npm run build

# Lint all apps
npm run lint

# Format with Prettier
npm run format

# Run a single app
cd apps/api && npm run dev
cd apps/web && npm run dev

# Database migrations: apply SQL files manually in Supabase SQL Editor
# See packages/db/migrations/ for migration files
```

There are no tests configured yet.

## Architecture

**RecordAI** is a multi-tenant SaaS for WhatsApp appointment confirmations. It uses a Turborepo monorepo with npm workspaces.

### Packages

| Package | Path | Role |
|---|---|---|
| `@autoagenda/db` | `packages/db/` | Supabase client singleton + `convertKeys` helper |
| `@recordai/shared` | `packages/shared/` | Shared enums/constants (AppointmentStatus, JobName, etc.) |
| API | `apps/api/` | Express REST API + BullMQ workers |
| Web | `apps/web/` | Next.js 15 dashboard |

### Backend (apps/api)

The API is structured around multi-tenancy: every DB query scopes by `tenantId` from the JWT. Authentication middleware (`src/middleware/auth.js`) injects `req.tenantId`, `req.userId`, and `req.role`.

**Request lifecycle:**
1. `src/index.js` — starts Express, boots queue workers, listens on PORT
2. `src/app.js` — registers middleware (helmet, cors, json) and routes
3. `src/middleware/auth.js` — validates Bearer JWT on protected routes
4. `src/controllers/*.controller.js` — business logic, calls Supabase
5. `src/middleware/errorHandler.js` — catches `AppError` subclasses, returns JSON

**Error handling:** Throw from `src/errors/index.js` (`NotFoundError`, `ValidationError`, etc.) and the global error handler formats the response. Never throw plain `Error` objects in controllers.

**WhatsApp integration** (`src/services/whatsapp.js`): wraps Meta Cloud API v18.0. Each tenant stores its own `whatsappPhoneNumberId` and `whatsappAccessToken` on the `Tenant` model — these are passed as `tenantConfig` to every WhatsApp call.

**Job queue** (`src/workers/queue.js`): BullMQ queue named `'appointments'` backed by Redis. Three job types dispatched at appointment creation:
- `sendConfirmation` — immediate, sends interactive "Confirmar/Cancelar" buttons
- `sendReminder` — delayed until 24h before `scheduledAt`
- `sendFollowUp` — delayed until 2h after `scheduledAt`

### Frontend (apps/web)

Next.js 15 App Router with CSS Modules. Route groups:
- `(auth)/` — login and register pages, no auth required
- `(dashboard)/` — protected pages using `layout.jsx` which checks the JWT in localStorage

API calls go through `src/lib/api.js`, which reads `NEXT_PUBLIC_API_URL` and auto-attaches the Bearer token from localStorage.

### Database Schema

Key relationships:
- `Tenant` → has many `User`, `Contact`, `Service`, `Appointment`
- `Appointment` → belongs to `Contact`, `Service`, `User`; has many `MessageLog`
- `AvailabilityRule` → per-user weekly schedule

Phone numbers are stored in E.164 format. All content and messages are in Spanish (es locale).

### Environment Variables

See `.env.example`. The API reads from the root `.env` and validates with Zod on startup (will exit if required vars are missing). Key vars:

| Variable | Used by |
|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Supabase client (packages/db) |
| `JWT_SECRET` | API auth middleware |
| `REDIS_URL` | BullMQ (Upstash Redis) |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification handshake |
| `NEXT_PUBLIC_API_URL` | Web frontend API client |


### RULES:
## Approach
- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
