import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./database.ts";
import { checkDatabase } from "./health.ts";
import { migrateToLatest } from "./migrate.ts";
import { createRun, getAnalysisResult, getRun, saveAnalysisResult } from "./runs.ts";
import { claimWorkflowAttempt, createWorkflow, workflowDetail } from "./workflows.ts";

const analysis = {
  actors: ["Dispatcher"],
  capabilities: ["Reassign routes"],
  externalSystems: ["ERP"],
  constraints: [],
  openQuestions: ["Who approves?"],
  evidence: [{ sourceId: "solution-brief", quotation: "route changes" }],
};

describe("Session 2 SQLite persistence", () => {
  it("reopens workflow state, attempt ownership and audit history from the same file", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-sqlite-workflow-reopen-"));
    const url = `sqlite:${join(root, "workflow.sqlite")}`;
    let db = createDatabase(url);
    try {
      expect((await migrateToLatest(db)).error).toBeUndefined();
      const workflow = await createWorkflow(db, "Resume this analysis");
      const run = await createRun(db, {
        id: randomUUID(),
        task: workflow.task,
        clientProfile: "workshop",
        model: null,
      });
      await claimWorkflowAttempt(db, workflow.id, workflow.version, run.id);
      const before = await workflowDetail(db, workflow.id);
      await db.destroy();
      db = createDatabase(url);
      expect(await workflowDetail(db, workflow.id)).toEqual(before);
      expect(before.workflow).toMatchObject({ state: "ANALYSING", attempt: 1, runId: run.id });
    } finally {
      await db.destroy();
      await rm(root, { recursive: true, force: true });
    }
  });
  it("reopens a file with runs, structured results and timestamp contracts intact", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-sqlite-reopen-"));
    const url = `sqlite:${join(root, "application.sqlite")}`;
    let db = createDatabase(url);
    try {
      expect((await migrateToLatest(db)).error).toBeUndefined();
      const run = await createRun(db, {
        id: randomUUID(),
        task: "Analyse",
        clientProfile: "workshop",
        model: null,
      });
      const result = await saveAnalysisResult(db, run.id, analysis);
      await db.destroy();
      db = createDatabase(url);
      expect(await getRun(db, run.id)).toEqual(run);
      const saved = await getAnalysisResult(db, run.id);
      expect(saved).toMatchObject({ id: result.id, result: analysis });
      expect(Number.isFinite(new Date(saved?.createdAt ?? "").getTime())).toBe(true);
      expect(await checkDatabase(db)).toMatchObject({
        reachable: true,
        schemaVersion: "s02-0001-workflows",
      });
      await expect(saveAnalysisResult(db, run.id, analysis)).rejects.toThrow(/unique/i);
      await expect(saveAnalysisResult(db, randomUUID(), analysis)).rejects.toThrow(/foreign key/i);
    } finally {
      await db.destroy();
      await rm(root, { recursive: true, force: true });
    }
  });
  it("keeps separate application and test files isolated", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-sqlite-isolation-"));
    const app = createDatabase(`sqlite:${join(root, "application.sqlite")}`);
    const test = createDatabase(`sqlite:${join(root, "application_test.sqlite")}`);
    try {
      expect((await migrateToLatest(app)).error).toBeUndefined();
      expect((await migrateToLatest(test)).error).toBeUndefined();
      const run = await createRun(app, {
        id: randomUUID(),
        task: "Keep",
        clientProfile: "workshop",
        model: null,
      });
      expect(await getRun(test, run.id)).toBeUndefined();
      expect(await getRun(app, run.id)).toEqual(run);
    } finally {
      await app.destroy();
      await test.destroy();
      await rm(root, { recursive: true, force: true });
    }
  });
});
