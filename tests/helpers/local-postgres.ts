import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

// Test-only local PostgreSQL access through the running Supabase Docker stack.
// Shared by the Playwright fault fixture and the Vitest DB sessions. It has no
// driver dependency and no Vitest/Playwright import, so either runner can use it.

const execFileAsync = promisify(execFile);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const KONG_PREFIX = "supabase_kong_";
const DB_PREFIX = "supabase_db_";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCKER_TIMEOUT_MS = 15_000;
const ONE_SHOT_TIMEOUT_MS = 60_000;
const QUERY_DEADLINE_MS = 45_000;
const CLOSE_KILL_MS = 5_000;
const CLOSE_GIVE_UP_MS = 10_000;
const SESSION_SETTINGS =
  "SET lock_timeout = '15s'; SET statement_timeout = '30s'; SET idle_in_transaction_session_timeout = '60s';";
const PSQL_ARGS = [
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];

/** Validates a UUID before it is interpolated into test SQL. */
export function sqlUuidLiteral(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID into SQL: ${value}`);
  }
  return `'${value}'::uuid`;
}

/**
 * Refuses a remote Docker engine before destructive SQL. DOCKER_HOST wins over
 * the active context, as in the Docker CLI. Only unix/npipe sockets and
 * loopback TCP endpoints are local.
 */
async function assertLocalDockerEndpoint(): Promise<void> {
  let endpoint = process.env.DOCKER_HOST ?? "";
  if (!endpoint) {
    const context =
      process.env.DOCKER_CONTEXT ||
      (
        await execFileAsync("docker", ["context", "show"], {
          timeout: DOCKER_TIMEOUT_MS,
        })
      ).stdout.trim();
    endpoint = (
      await execFileAsync(
        "docker",
        [
          "context",
          "inspect",
          context,
          "--format",
          "{{.Endpoints.docker.Host}}",
        ],
        { timeout: DOCKER_TIMEOUT_MS },
      )
    ).stdout.trim();
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(endpoint);
  } catch {
    parsed = null;
  }
  const local =
    parsed !== null &&
    (parsed.protocol === "unix:" ||
      parsed.protocol === "npipe:" ||
      (parsed.protocol === "tcp:" && LOCAL_HOSTNAMES.has(parsed.hostname)));
  if (!local) {
    throw new Error(
      `Refusing local SQL: Docker endpoint "${endpoint || "(unknown)"}" is not a local socket or loopback TCP endpoint.`,
    );
  }
}

/**
 * Resolves the Postgres container of the running local stack whose Kong API
 * container publishes the same host port as `apiUrl`. Loopback and port checks
 * run before any Docker call. Ambiguous, absent, or stopped matches throw.
 */
export async function resolveLocalDbContainer(apiUrl: string): Promise<string> {
  const url = new URL(apiUrl);
  if (!LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      `Refusing local SQL: "${apiUrl}" is not a loopback Supabase URL.`,
    );
  }
  if (!url.port) {
    throw new Error(`Refusing local SQL: "${apiUrl}" has no explicit API port.`);
  }

  await assertLocalDockerEndpoint();

  const running = (
    await execFileAsync("docker", ["ps", "--format", "{{.Names}}"], {
      timeout: DOCKER_TIMEOUT_MS,
    })
  ).stdout
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);

  // Docker's `publish` filter matches container ports, so the host binding is
  // read from each candidate's inspected NetworkSettings instead.
  const matches: string[] = [];
  for (const name of running.filter((item) => item.startsWith(KONG_PREFIX))) {
    const { stdout } = await execFileAsync(
      "docker",
      ["inspect", "--format", "{{json .NetworkSettings.Ports}}", name],
      { timeout: DOCKER_TIMEOUT_MS },
    );
    const ports = JSON.parse(stdout) as Record<
      string,
      Array<{ HostPort?: string }> | null
    > | null;
    const bound = Object.values(ports ?? {}).some((bindings) =>
      (bindings ?? []).some((binding) => binding.HostPort === url.port),
    );
    if (bound) {
      matches.push(name);
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one running Supabase API container with host port ${url.port}, found ${matches.length}.`,
    );
  }

  const dbName = `${DB_PREFIX}${matches[0].slice(KONG_PREFIX.length)}`;
  if (!running.includes(dbName)) {
    throw new Error(
      `Supabase database container ${dbName} is not running for API port ${url.port}.`,
    );
  }
  return dbName;
}

/** Runs one SQL string (may hold several statements) and returns raw stdout. */
export async function runLocalSql(apiUrl: string, sql: string): Promise<string> {
  const container = await resolveLocalDbContainer(apiUrl);
  const { stdout } = await execFileAsync(
    "docker",
    ["exec", container, ...PSQL_ARGS, "-c", sql],
    { timeout: ONE_SHOT_TIMEOUT_MS },
  );
  return stdout.trim();
}

export interface LocalSqlSession {
  /** Sends SQL on this live connection and resolves with its stdout. */
  query(sql: string): Promise<string>;
  close(): Promise<void>;
}

interface PendingQuery {
  marker: string;
  settle: (error: Error | null, output?: string) => void;
}

function startSession(child: ChildProcessWithoutNullStreams): LocalSqlSession {
  let buffer = "";
  let stderr = "";
  let pending: PendingQuery | null = null;
  let broken: Error | null = null;
  let closed = false;
  let closing: Promise<void> | null = null;

  // Records a terminal error and rejects any in-flight query, so later calls
  // fail with the same clear cause instead of hanging or overwriting state.
  const fail = (error: Error) => {
    broken ??= error;
    if (pending) {
      const { settle } = pending;
      pending = null;
      settle(error);
    }
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    if (!pending) {
      return;
    }
    const { marker, settle } = pending;
    const index = buffer.indexOf(marker);
    if (index < 0) {
      return;
    }
    const output = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + marker.length);
    pending = null;
    settle(null, output);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.on("error", (error) => {
    fail(new Error(`local psql process error: ${error.message}`));
  });
  child.stdin.on("error", (error) => {
    fail(new Error(`local psql stdin error: ${error.message}`));
  });
  child.on("close", (code) => {
    closed = true;
    fail(
      new Error(`local psql session ended (code ${code}): ${stderr.trim()}`),
    );
  });

  return {
    query(sql) {
      if (broken) {
        return Promise.reject(broken);
      }
      if (pending) {
        return Promise.reject(
          new Error("local psql session is busy with another query"),
        );
      }
      return new Promise<string>((resolve, reject) => {
        const marker = `__DONE_${randomUUID()}__`;
        const deadline = setTimeout(() => {
          fail(
            new Error(`local psql query exceeded ${QUERY_DEADLINE_MS} ms`),
          );
          child.kill();
        }, QUERY_DEADLINE_MS);
        pending = {
          marker,
          settle: (error, output) => {
            clearTimeout(deadline);
            if (error) {
              reject(error);
            } else {
              resolve(output ?? "");
            }
          },
        };
        child.stdin.write(`${sql}\n\\echo ${marker}\n`, (error) => {
          if (error) {
            fail(new Error(`local psql write failed: ${error.message}`));
          }
        });
      });
    },
    close() {
      closing ??= new Promise<void>((resolve) => {
        const killTimer = setTimeout(() => child.kill(), CLOSE_KILL_MS);
        const giveUpTimer = setTimeout(
          finish,
          CLOSE_KILL_MS + CLOSE_GIVE_UP_MS,
        );
        function finish() {
          clearTimeout(killTimer);
          clearTimeout(giveUpTimer);
          fail(new Error("local psql session closed"));
          resolve();
        }
        if (closed) {
          finish();
          return;
        }
        child.once("close", finish);
        child.stdin.end();
      });
      return closing;
    },
  };
}

/**
 * Opens one persistent psql connection so a test can hold a transaction open
 * while another session runs. Each query is delimited by a unique marker, so
 * output is read without sleeping. Every query has a finite deadline, and
 * session timeouts bound lock waits, statements, and idle transactions.
 */
export async function openLocalSqlSession(
  apiUrl: string,
): Promise<LocalSqlSession> {
  const container = await resolveLocalDbContainer(apiUrl);
  const child = spawn("docker", ["exec", "-i", container, ...PSQL_ARGS]);
  const session = startSession(child);
  try {
    await session.query(SESSION_SETTINGS);
  } catch (error) {
    await session.close();
    throw error;
  }
  return session;
}
