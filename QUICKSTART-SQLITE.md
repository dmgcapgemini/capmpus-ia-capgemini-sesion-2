# Sessions 1 and 2 — SQLite setup

Use this route when Podman, Docker or a PostgreSQL server is unavailable. Bun 1.4.0 includes the SQLite driver; no separate database installation is needed. Each member uses their own local files.

## 1. Prepare

Import the session ZIP into the team repository as described in `QUICKSTART.md`. Install Git, Bun 1.4.0 and Copilot CLI, and sign in with `copilot login`. Skip the PostgreSQL/container steps for this route in Sessions 1 and 2.

## 2. Configure

From the application root:

```bash
cp .env.example .env.local
```

Replace the active `DATABASE_URL` line with:

```dotenv
DATABASE_URL=sqlite:./.loom/session-02.sqlite
```

The example is for Session 2; Session 1 uses `.loom/session-01.sqlite`. Leave `DATABASE_URL_TEST` unset to derive a separate `_test.sqlite` file. If setting it explicitly, use a different SQLite file. Never use the application file for tests. Paths are resolved from the application root. On macOS, follow the CLI path advice from preflight if needed.

## 3. Install and start

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run db:seed
bun run preflight
bun run typecheck
bun run lint
bun run test
bun run dev
```

Session 1 has 13 expected exercise failures and three TODOs; Session 2 has 10 expected failures and four TODOs. Compare exact names with `docs/course/session-NN/workshop-tests.json`. All other tests must pass. The development console normally opens at `http://localhost:5173`.

## 4. Keep the data

Runs, stored analysis and Session 2 workflow history persist in the selected `.loom/session-NN.sqlite` file after restarting the API. SQLite may also create `-wal` and `-shm` files. These files and `.env.local` are ignored by Git and excluded from handover archives. Do not delete application data to fix a test failure.

## 5. Scope and recovery

SQLite is the default for Sessions 1 and 2. PostgreSQL remains an explicit option in QUICKSTART.md. Each full starter begins in a fresh folder with its own data; retain previous folders/files without automatic conversion. Session 3 requires PostgreSQL prepared before class.

Session 2 keeps the same four workflow exercises and ten intended failures on either backend. SQLite serializes transactions through the local application's connection; PostgreSQL uses row locks. Both keep version checks, unique result protection and atomic state/audit changes. Use one API process per database.

For the Session 2 fixture, select a separate file such as `sqlite:./.loom/session-02_demo.sqlite`. Restart against that same file during the hold/kill/succeed demonstration. Restore the normal application URL afterwards. Test and hidden validation files remain separate. For file permission errors, use a writable directory and rerun migration and preflight. PostgreSQL connection failures never switch storage automatically.
