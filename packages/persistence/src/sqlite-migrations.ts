import { type Kysely, sql } from "kysely";

// Same logical Session 2 schema and migration names; PostgreSQL migrations remain untouched.
export const sqliteMigrations = {
  "s00-0001-loom-meta": {
    // biome-ignore lint/suspicious/noExplicitAny: migrations are independent of current table types
    async up(db: Kysely<any>) {
      await sql`create table loom_meta (
        key text primary key, value text not null,
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`.execute(db);
    },
  },
  "s01-0001-agent-runs": {
    // biome-ignore lint/suspicious/noExplicitAny: migrations are independent of current table types
    async up(db: Kysely<any>) {
      await sql`create table agent_runs (
        id text primary key,
        task text not null,
        status text not null check (status in ('running', 'completed', 'incomplete', 'failed', 'stopped')),
        client_profile text not null check (client_profile in ('workshop', 'production')),
        model text, session_id text,
        started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        finished_at text, error text,
        model_calls integer not null default 0, input_tokens integer not null default 0,
        output_tokens integer not null default 0, tool_calls integer not null default 0,
        denied_tool_calls integer not null default 0
      )`.execute(db);
      await sql`create index agent_runs_started_at_idx on agent_runs (started_at desc)`.execute(db);
      await sql`create table analysis_results (
        id integer primary key autoincrement,
        agent_run_id text not null unique references agent_runs (id),
        result text not null check (json_valid(result)),
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`.execute(db);
    },
  },
  "s02-0001-workflows": {
    // biome-ignore lint/suspicious/noExplicitAny: migrations are independent of current table types
    async up(db: Kysely<any>) {
      await sql`create table workflows (
        id text primary key,
        task text not null,
        state text not null check (state in ('CREATED','ANALYSING','PROPOSAL_READY','AWAITING_REVIEW','ACCEPTED','REJECTED','FAILED')),
        version integer not null default 0 check (version >= 0),
        attempt integer not null default 0 check (attempt >= 0),
        max_attempts integer not null check (max_attempts between 1 and 5),
        run_id text references agent_runs(id),
        result_id integer unique references analysis_results(id),
        submission_key text not null unique,
        error text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        check (attempt <= max_attempts),
        check (state not in ('PROPOSAL_READY','AWAITING_REVIEW','ACCEPTED','REJECTED') or result_id is not null)
      )`.execute(db);
      await sql`create table workflow_events (
        workflow_id text not null references workflows(id),
        version integer not null,
        from_state text,
        to_state text not null,
        reason text not null,
        run_id text references agent_runs(id),
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        primary key (workflow_id, version)
      )`.execute(db);
      await sql`create index workflows_pending_idx on workflows(state, created_at)`.execute(db);
    },
  },
};
