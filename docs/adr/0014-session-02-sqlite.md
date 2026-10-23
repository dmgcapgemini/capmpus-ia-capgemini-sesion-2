# 0014 — Session 2 SQLite and PostgreSQL

Status: accepted. Runtime: Bun 1.4.0.

The Session 2 teaching application defaults to file-backed SQLite, using Bun's built-in driver through Kysely. PostgreSQL remains explicitly selectable with the same workflow contracts and migration identifiers. The current full starter includes earlier reference implementations and requires no previous learner directory.

SQLite stores JSON as validated text and normalizes timestamps/results at the persistence boundary. It serializes transactions through one local application connection; PostgreSQL retains row locks. Both use expected versions, unique submission/result bindings and a single transaction for workflow state and audit events. The classroom contract is one API process per database. This does not add distributed worker ownership or guarantee a single model call.

Use a separate application file, derived test file, demo file ending `_demo.sqlite` and hidden validation file. PostgreSQL connection errors never trigger a backend switch. SQLite restart demos reopen the same file so workflow IDs, attempts and audit survive. Session 3 retains its own PostgreSQL starter.
