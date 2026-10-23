/** Ayuda docente: automatiza los comandos oficiales sin cambiar los ejercicios. */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { delimiter, dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";

const root = resolve(import.meta.dirname, "..");
const local = join(root, ".loom");
const envFile = join(root, ".env.local");
const settingsFile = join(local, "classroom.json");
const windows = process.platform === "win32";
const owner = createHash("sha256").update(root).digest("hex").slice(0, 10);
const bun = process.execPath;
type Settings = { container: string; port: number; owner: string; databaseUrl: string };
const help = `Sesión 2 — preparación y arranque
  bash scripts/setup.sh [--storage sqlite|postgres] [--login]
  powershell -File scripts/setup.ps1 --storage sqlite|postgres --login
  bash scripts/start.sh [--demo fail-once|hold|succeed|fail-always]
  powershell -File scripts/start.ps1 --demo fail-once
Opciones de setup: --api-port N --web-port N --postgres-port N (predeterminado 55432).
Sin --storage se conserva .env.local; en una carpeta nueva se usa SQLite.
Instala herramientas ausentes; conserva versiones existentes de Copilot y Podman.
El inicio de sesión de Copilot necesita tu intervención; --login lo abre explícitamente.
Las pruebas se limitan a la base de pruebas separada. No se borra la base de la app.`;

function command(name: string): string | undefined {
  for (const folder of (process.env.PATH ?? "").split(delimiter))
    for (const suffix of windows ? [".exe", ".cmd", ""] : [""])
      if (folder && existsSync(join(folder, name + suffix))) {
        if (windows && name === "copilot") {
          const native = join(
            folder,
            "node_modules/@github/copilot/node_modules",
            `@github/copilot-win32-${process.arch}`,
            "copilot.exe",
          );
          if (existsSync(native)) return native;
        }
        return join(folder, name + suffix);
      }
  return undefined;
}
function run(executable: string, args: string[], env = process.env, quiet = false): string {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${executable.split(/[\\/]/).pop()} no terminó correctamente (${result.status ?? result.error?.message}). Revisa el mensaje anterior.`,
    );
  return result.stdout?.trim() ?? "";
}
function refreshWindowsPath(): void {
  if (!windows) return;
  const shell = command("pwsh") ?? command("powershell");
  if (shell) {
    const paths = run(
      shell,
      [
        "-NoProfile",
        "-Command",
        "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
      ],
      process.env,
      true,
    );
    process.env.PATH = `${dirname(bun)};${paths};${process.env.PATH ?? ""}`;
  }
}
function ensureTool(name: "podman" | "copilot"): string {
  refreshWindowsPath();
  let found = command(name);
  if (found) return found;
  console.log(`Instalando ${name} ausente mediante su canal documentado…`);
  if (windows) {
    const winget = command("winget");
    if (!winget) throw new Error("Falta WinGet. Sigue INSTALLATION.es.md y vuelve a ejecutar setup.");
    run(winget, [
      "install",
      "--id",
      name === "podman" ? "RedHat.Podman" : "GitHub.Copilot",
      "--exact",
      "--source",
      "winget",
    ]);
    refreshWindowsPath();
  } else {
    let brew = command("brew");
    if (!brew && process.platform === "darwin") {
      run("/bin/bash", [join(root, "scripts/ensure-homebrew.sh")]);
      process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`;
      brew = command("brew");
    }
    if (!brew)
      throw new Error(
        "Instala Homebrew desde https://brew.sh o usa el instalador corporativo de Podman/Copilot; después repite setup. Consulta INSTALLATION.es.md.",
      );
    run(brew, name === "podman" ? ["install", "podman"] : ["install", "--cask", "copilot-cli"]);
  }
  found = command(name);
  if (!found)
    throw new Error(
      `${name} todavía no está en PATH. Abre una terminal nueva y repite setup. En Windows puede ser necesario preparar WSL 2/reiniciar.`,
    );
  return found;
}
async function available(port: number): Promise<boolean> {
  return new Promise((accept) => {
    const server = createServer();
    server.once("error", () => accept(false));
    server.listen(port, "127.0.0.1", () => server.close(() => accept(true)));
  });
}
async function choosePort(value: number, explicit: boolean): Promise<number> {
  for (let offset = 0; offset < (explicit ? 1 : 100) && value + offset <= 65535; offset++)
    if (await available(value + offset)) return value + offset;
  throw new Error(
    `Puerto ${value} ocupado. Detén tu app o selecciona otro puerto; no se termina ningún proceso ajeno.`,
  );
}
async function loadSettings(): Promise<Settings | undefined> {
  return existsSync(settingsFile) ? JSON.parse(await readFile(settingsFile, "utf8")) : undefined;
}
async function ensurePodman(settings: Settings, databaseUrl: string, install: boolean): Promise<void> {
  if (windows && install) {
    const shell = command("powershell") ?? command("pwsh");
    if (!shell) throw new Error("Falta PowerShell para preparar WSL. Consulta INSTALLATION.es.md.");
    run(shell, ["-NoProfile", "-File", join(root, "scripts/ensure-wsl.ps1")]);
  }
  const podman = install ? ensureTool("podman") : command("podman");
  if (!podman) throw new Error("Falta Podman. Ejecuta setup con --storage postgres.");
  if (spawnSync(podman, ["info"], { stdio: "ignore" }).status !== 0) {
    if (process.platform === "linux")
      throw new Error("Podman no responde. Comprueba su instalación rootless.");
    const machines = JSON.parse(run(podman, ["machine", "list", "--format", "json"], process.env, true)) as {
      Name: string;
    }[];
    const name = machines.some((m) => m.Name === "podman-machine-default")
      ? "podman-machine-default"
      : (machines[0]?.Name ?? "loom-campus");
    if (!machines.length) run(podman, ["machine", "init", name]);
    run(podman, ["machine", "start", name]);
  }
  const exists =
    spawnSync(podman, ["container", "exists", settings.container], { stdio: "ignore" }).status === 0;
  if (exists) {
    const inspect = JSON.parse(run(podman, ["inspect", settings.container], process.env, true))[0];
    if (inspect.Config?.Labels?.["io.loom.classroom"] !== settings.owner)
      throw new Error("El nombre del contenedor pertenece a otro proyecto. No se modifica.");
    if (!inspect.State?.Running) run(podman, ["start", settings.container]);
  } else {
    if (!install) throw new Error("No se encuentra el contenedor de este proyecto. Repite setup.");
    if (!(await available(settings.port)))
      throw new Error(`Puerto PostgreSQL ${settings.port} ocupado. Usa --postgres-port con uno libre.`);
    const url = new URL(databaseUrl);
    // La contraseña se transmite por el entorno, no se imprime ni se incluye en el ZIP.
    run(
      podman,
      [
        "run",
        "--detach",
        "--name",
        settings.container,
        "--label",
        `io.loom.classroom=${settings.owner}`,
        "--publish",
        `127.0.0.1:${settings.port}:5432`,
        "--env",
        "POSTGRES_USER",
        "--env",
        "POSTGRES_PASSWORD",
        "--env",
        "POSTGRES_DB",
        "--volume",
        `${settings.container}-data:/var/lib/postgresql/data`,
        "docker.io/library/postgres:17",
      ],
      {
        ...process.env,
        POSTGRES_USER: decodeURIComponent(url.username),
        POSTGRES_PASSWORD: decodeURIComponent(url.password),
        POSTGRES_DB: url.pathname.slice(1),
      },
    );
  }
  for (let attempt = 0; attempt < 90; attempt++) {
    if (
      // The image first starts a temporary server on a Unix socket during initdb.
      // Wait for TCP so setup cannot mistake that temporary server for the final one.
      spawnSync(
        podman,
        ["exec", settings.container, "pg_isready", "-h", "127.0.0.1", "-U", "loom", "-d", "loom_session02"],
        {
          stdio: "ignore",
        },
      ).status === 0
    )
      return;
    await new Promise((accept) => setTimeout(accept, 1000));
  }
  throw new Error("PostgreSQL no está listo. Consulta podman logs para el contenedor de este proyecto.");
}
function setValues(text: string, values: Record<string, string>): string {
  let result = text;
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${name}=.*$`, "gm");
    result = pattern.test(result) ? result.replace(pattern, () => line) : `${result.trimEnd()}\n${line}\n`;
  }
  return result;
}
async function setup(options: Map<string, string>): Promise<void> {
  const old = existsSync(envFile) ? await readFile(envFile, "utf8") : "";
  const values = parseEnv(old);
  const storage =
    options.get("storage") ?? (values.DATABASE_URL?.startsWith("postgres") ? "postgres" : "sqlite");
  if (!["sqlite", "postgres"].includes(storage))
    throw new Error("Usa --storage sqlite o --storage postgres.");
  // Instalación congelada antes de importar dependencias de la aplicación.
  run(bun, ["install", "--frozen-lockfile"]);
  // El ZIP ya contiene examples; la aplicación docente lee los mismos datos de ../data.
  if (existsSync(join(root, "../data/sources.json"))) {
    const examples = join(root, "examples/session-02");
    await mkdir(examples, { recursive: true });
    for (const name of ["sources.json", "solution-brief.md", "failure-scenario.json"])
      if (!existsSync(join(examples, name)))
        await copyFile(join(root, "../data", name), join(examples, name));
  }
  const copilot = ensureTool("copilot");
  run(copilot, ["--version"]);
  if (options.has("login")) run(copilot, ["login"]);
  const api = await choosePort(
    Number(options.get("api-port") ?? values.LOOM_API_PORT ?? 3000),
    options.has("api-port"),
  );
  let web = await choosePort(
    Number(options.get("web-port") ?? values.LOOM_WEB_PORT ?? 5173),
    options.has("web-port"),
  );
  if (web === api) {
    if (options.has("web-port")) throw new Error("API y web necesitan puertos diferentes.");
    web = await choosePort(web + 1, false);
  }
  const saved = await loadSettings();
  let databaseUrl = values.DATABASE_URL;
  if (storage === "sqlite") {
    if (!databaseUrl?.startsWith("sqlite:")) databaseUrl = "sqlite:./.loom/session-02.sqlite";
  } else if (!databaseUrl?.startsWith("postgres")) {
    if (saved && options.has("postgres-port") && Number(options.get("postgres-port")) !== saved.port)
      throw new Error("El contenedor existente conserva su puerto. Usa otra extracción para otro entorno.");
    const port = saved?.port ?? Number(options.get("postgres-port") ?? 55432);
    databaseUrl =
      saved?.databaseUrl ??
      `postgresql://loom:${randomBytes(20).toString("hex")}@127.0.0.1:${port}/loom_session02`;
    const settings = { container: `loom-session02-${owner}`, port, owner, databaseUrl };
    await writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  } else if (options.has("postgres-port") && saved && Number(options.get("postgres-port")) !== saved.port) {
    throw new Error(
      "Este proyecto ya tiene un contenedor y puerto asignados. Conserva su configuración; usa otra extracción para otro entorno.",
    );
  }
  const { deriveTestDatabaseUrl, loadConfig } = await import("../packages/config/src/index.ts");
  const sameStorage = values.DATABASE_URL === databaseUrl;
  const next = setValues(old || (await readFile(join(root, ".env.example"), "utf8")), {
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST:
      sameStorage && values.DATABASE_URL_TEST ? values.DATABASE_URL_TEST : deriveTestDatabaseUrl(databaseUrl),
    LOOM_SOURCES_DIR: "examples/session-02",
    LOOM_API_PORT: String(api),
    LOOM_WEB_PORT: String(web),
    // dotenv preserves backslashes in quoted values; JSON escaping would multiply
    // Windows path separators on every setup. Forward slashes work on Windows too.
    LOOM_COPILOT_CLI_PATH: windows
      ? (values.LOOM_COPILOT_CLI_PATH || copilot).replace(/\\+/g, "/")
      : values.LOOM_COPILOT_CLI_PATH || copilot,
  });
  const config = loadConfig(parseEnv(next)); // Valida aislamiento antes de escribir o ejecutar pruebas.
  if (storage === "postgres") {
    const app = new URL(config.databaseUrl);
    const test = new URL(config.testDatabaseUrl);
    if (
      !/^postgres(?:ql)?:$/.test(test.protocol) ||
      !test.pathname.endsWith("_test") ||
      (app.hostname === test.hostname && app.port === test.port && app.pathname === test.pathname)
    )
      throw new Error(
        "DATABASE_URL_TEST debe ser otra base PostgreSQL terminada en _test. No se ejecutan pruebas sobre la base de la app.",
      );
  }
  if (old && next !== old) {
    const backups = join(local, "setup-backups");
    await mkdir(backups, { recursive: true, mode: 0o700 });
    await writeFile(join(backups, `env-${Date.now()}.txt`), old, { mode: 0o600, flag: "wx" });
  }
  await writeFile(envFile, next, { mode: 0o600 });
  if (!windows) await chmod(envFile, 0o600);
  if (storage === "postgres") {
    const settings = await loadSettings();
    if (settings) await ensurePodman(settings, config.databaseUrl, true);
    else console.log("Se conserva tu URL PostgreSQL existente; no se crea ni modifica otro contenedor.");
  }
  const env = { ...process.env, ...parseEnv(next) };
  // Crear la base si falta; nunca truncar la base normal de la aplicación.
  const { ensureDatabaseExists } = await import("../packages/persistence/src/index.ts");
  await ensureDatabaseExists(config.databaseUrl);
  for (const script of ["db:migrate", "db:seed", "typecheck", "lint", "build"])
    run(bun, ["run", script], env);
  const report = join(local, "setup-tests.json");
  const { unlink: unlinkReport } = await import("node:fs/promises");
  if (existsSync(report)) await unlinkReport(report);
  const tests = spawnSync(
    bun,
    [
      "--bun",
      "run",
      "vitest",
      "run",
      "--project",
      "unit",
      "--project",
      "integration",
      "--reporter=json",
      `--outputFile=${report}`,
    ],
    { cwd: root, env, stdio: "inherit" },
  );
  if (tests.error || !existsSync(report)) throw new Error("No se pudo completar la comprobación de pruebas.");
  const result = JSON.parse(await readFile(report, "utf8"));
  const official = join(root, "docs/course/session-02/workshop-tests.json");
  const sourceOfficial = join(root, "../participant/workshop-tests.json");
  const allowed = new Set<string>(
    JSON.parse(await readFile(existsSync(official) ? official : sourceOfficial, "utf8")),
  );
  const failed = result.testResults.flatMap(
    (file: { assertionResults: { status: string; fullName: string }[] }) =>
      file.assertionResults.filter((test) => test.status === "failed").map((test) => test.fullName),
  ) as string[];
  if (
    result.numRuntimeErrorTestSuites ||
    failed.some((name) => !allowed.has(name)) ||
    result.numPendingTests ||
    ![0, 1].includes(tests.status ?? -1) ||
    result.numFailedTests !== failed.length ||
    !result.numPassedTests
  )
    throw new Error("Hay fallos distintos de los ejercicios previstos. Revisa .loom/setup-tests.json.");
  console.log(
    `Pruebas: ${result.numPassedTests} correctas; ${failed.length} fallos de ejercicios previstos. No son errores de instalación.`,
  );
  run(bun, ["run", "preflight"], env);
  console.log(
    `\nPreparación comprobada (${storage}). Web: http://127.0.0.1:${web}.\nArranca con bash scripts/start.sh o powershell -File scripts/start.ps1.`,
  );
}
async function start(options: Map<string, string>): Promise<void> {
  if (!existsSync(envFile) || !existsSync(join(root, "node_modules")))
    throw new Error("Ejecuta primero scripts/setup.sh o scripts/setup.ps1.");
  const values = parseEnv(await readFile(envFile, "utf8"));
  const { loadConfig } = await import("../packages/config/src/index.ts");
  const config = loadConfig(values);
  if (config.databaseUrl.startsWith("postgres")) {
    const saved = await loadSettings();
    if (saved) await ensurePodman(saved, config.databaseUrl, false);
  }
  const mode = options.get("demo");
  if (mode && !["fail-once", "hold", "succeed", "fail-always"].includes(mode))
    throw new Error("Modo de demo desconocido.");
  const env = { ...process.env, ...values };
  if (mode) {
    if (config.databaseUrl.startsWith("sqlite:"))
      env.DATABASE_URL = config.databaseUrl.replace(/\.(sqlite|db)$/, "_demo.$1");
    else {
      const url = new URL(config.databaseUrl);
      url.pathname += "_demo";
      env.DATABASE_URL = url.toString();
    }
    console.log(`Demo ${mode}: proveedor simulado; sin llamadas a Copilot. La base normal queda separada.`);
  }
  const lock = join(local, "start.lock");
  if (existsSync(lock)) {
    const prior = Number(await readFile(lock, "utf8"));
    let alive = false;
    if (Number.isInteger(prior) && prior > 0) {
      try {
        process.kill(prior, 0);
        alive = true;
      } catch {
        /* Arranque anterior terminado. */
      }
    }
    if (alive) {
      // A stale lock may point to a reused PID. Verify ownership before stopping it.
      let owned = false;
      if (windows) {
        const shell = command("powershell") ?? command("pwsh");
        if (shell) {
          const info = run(
            shell,
            [
              "-NoProfile",
              "-Command",
              `Get-CimInstance Win32_Process -Filter 'ProcessId = ${prior}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`,
            ],
            process.env,
            true,
          );
          if (info) {
            const record = JSON.parse(info);
            owned =
              typeof record.ExecutablePath === "string" &&
              resolve(record.ExecutablePath).toLowerCase() === resolve(bun).toLowerCase() &&
              (resolve(dirname(bun)).toLowerCase() === resolve(local, "toolchain/bin").toLowerCase() ||
                (record.CommandLine ?? "")
                  .toLowerCase()
                  .includes(join(root, "tools/classroom.ts").toLowerCase())) &&
              /(?:^|[\s"/\\])tools[/\\]classroom\.ts"?\s+start(?:\s|$)/.test(record.CommandLine ?? "");
          }
        }
      } else {
        const args = run("ps", ["-p", String(prior), "-o", "args="], process.env, true);
        const cwd = run("lsof", ["-a", "-p", String(prior), "-d", "cwd", "-Fn"], process.env, true);
        owned =
          /(?:^|[\s/])tools\/classroom\.ts\s+start(?:\s|$)/.test(args) &&
          cwd.split("\n").includes(`n${root}`);
      }
      if (!owned)
        throw new Error(
          "El PID de start.lock pertenece a otro proceso o no se pudo verificar. No se detiene.",
        );
      console.log(`Deteniendo el arranque anterior de esta carpeta (PID ${prior})...`);
      if (windows) run("taskkill", ["/PID", String(prior), "/T", "/F"], process.env, true);
      else process.kill(prior, "SIGTERM");
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        let running = false;
        try {
          process.kill(prior, 0);
          running = true;
        } catch {
          /* Already stopped. */
        }
        if (!running && (await available(config.api.port)) && (await available(config.web.port))) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      let stillRunning = false;
      try {
        process.kill(prior, 0);
        stillRunning = true;
      } catch {
        /* Already stopped. */
      }
      if (stillRunning) throw new Error("El arranque anterior no ha terminado. No se inicia otra instancia.");
    }
  }
  for (const port of [config.api.port, config.web.port])
    if (!(await available(port)))
      throw new Error(
        `Puerto ${port} ocupado por otro proceso. Cambia los puertos con setup o detén ese proceso.`,
      );
  await writeFile(lock, String(process.pid));
  const children: ReturnType<typeof spawn>[] = [];
  let stopping = false;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children)
      if (child.pid) {
        try {
          if (windows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
          else process.kill(-child.pid, "SIGTERM");
        } catch {
          /* El hijo ya terminó. */
        }
      }
    if (!windows)
      forceTimer = setTimeout(() => {
        for (const child of children)
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              /* Ya terminó. */
            }
          }
      }, 5000);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const api = mode
      ? ["--env-file=.env.local", "tools/workflow-demo.ts", mode]
      : ["--env-file=.env.local", "apps/api/src/main.ts"];
    for (const args of [api, ["run", "--filter", "@loom/web", "dev", "--host", "127.0.0.1"]]) {
      const child = spawn(bun, args, { cwd: root, env, stdio: "inherit", detached: !windows });
      children.push(child);
      child.once("error", (error) => {
        console.error(error.message);
        process.exitCode = 1;
        stop();
      });
      child.once("exit", (code) => {
        if (!stopping) {
          process.exitCode = code || 1;
          stop();
        }
      });
    }
    console.log(
      `\nLoom: http://127.0.0.1:${config.web.port}\nAPI: http://127.0.0.1:${config.api.port}\nCtrl+C detiene API y web. Los datos y el contenedor se conservan.\n`,
    );
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((done) => {
            child.once("exit", () => done());
            child.once("error", () => done());
          }),
      ),
    );
  } finally {
    stop();
    if (forceTimer) clearTimeout(forceTimer);
    const { unlink } = await import("node:fs/promises");
    if (existsSync(lock) && (await readFile(lock, "utf8")) === String(process.pid)) await unlink(lock);
  }
}
async function main(): Promise<void> {
  const [action, ...args] = process.argv.slice(2);
  if (args.includes("--help") || !action) {
    console.log(help);
    return;
  }
  if (!["setup", "start"].includes(action)) throw new Error("Acción desconocida; usa setup o start.");
  const options = new Map<string, string>();
  const allowed =
    action === "setup" ? ["storage", "login", "api-port", "web-port", "postgres-port"] : ["demo"];
  for (let i = 0; i < args.length; i++) {
    const name = args[i]?.replace(/^--/, "");
    if (!name || !args[i]?.startsWith("--") || !allowed.includes(name) || options.has(name))
      throw new Error(`Opción inválida o repetida: ${args[i]}`);
    const value = name === "login" ? "true" : args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Falta valor para --${name}.`);
    if (name.endsWith("port") && (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535))
      throw new Error(`Puerto inválido: ${value}.`);
    options.set(name, value);
  }
  if (run(bun, ["--version"], process.env, true) !== "1.4.0")
    throw new Error("Este curso utiliza Bun 1.4.0. Ejecuta el wrapper setup de tu sistema.");
  await mkdir(local, { recursive: true, mode: 0o700 });
  if (action === "setup") await setup(options);
  else await start(options);
}
main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
