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

/** Validates a UUID before it is interpolated into test SQL. */
export function sqlUuidLiteral(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID into SQL: ${value}`);
  }
  return `'${value}'::uuid`;
}

/**
 * Resolves the Postgres container of the running local stack whose API is
 * published on the same loopback port as `apiUrl`. Fails closed: any non-
 * loopback URL, missing port, or ambiguous/absent match throws before SQL runs.
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

  const published = await execFileAsync("docker", [
    "ps",
    "--filter",
    `publish=${url.port}`,
    "--format",
    "{{.Names}}",
  ]);
  const kongNames = published.stdout
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.startsWith(KONG_PREFIX));
  if (kongNames.length !== 1) {
    throw new Error(
      `Expected exactly one running Supabase API container on port ${url.port}, found ${kongNames.length}.`,
    );
  }

  const project = kongNames[0].slice(KONG_PREFIX.length);
  const dbName = `${DB_PREFIX}${project}`;
  const running = await execFileAsync("docker", [
    "ps",
    "--format",
    "{{.Names}}",
  ]);
  if (!running.stdout.split("\n").map((name) => name.trim()).includes(dbName)) {
    throw new Error(
      `Supabase database container ${dbName} is not running for API port ${url.port}.`,
    );
  }
  return dbName;
}

/** Runs one SQL string (may hold several statements) and returns raw stdout. */
export async function runLocalSql(apiUrl: string, sql: string): Promise<string> {
  const container = await resolveLocalDbContainer(apiUrl);
  const { stdout } = await execFileAsync("docker", [
    "exec",
    container,
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
    "-c",
    sql,
  ]);
  return stdout.trim();
}

export interface LocalSqlSession {
  /** Sends SQL on this live connection and resolves with its stdout. */
  query(sql: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Opens one persistent psql connection so a test can hold a transaction open
 * while another session runs. Every query is followed by a unique marker so
 * output is delimited without sleeping. Session-level timeouts bound each
 * lock wait, statement, and idle transaction, so a broken test cannot hang.
 */
export async function openLocalSqlSession(
  apiUrl: string,
): Promise<LocalSqlSession> {
  const container = await resolveLocalDbContainer(apiUrl);
  const child: ChildProcessWithoutNullStreams = spawn("docker", [
    "exec",
    "-i",
    container,
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
  ]);

  let buffer = "";
  let stderr = "";
  let exited = false;
  let pending: {
    marker: string;
    resolve: (output: string) => void;
    reject: (error: Error) => void;
  } | null = null;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    if (pending) {
      const index = buffer.indexOf(pending.marker);
      if (index >= 0) {
        const { resolve } = pending;
        const output = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + pending.marker.length);
        pending = null;
        resolve(output);
      }
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.on("exit", () => {
    exited = true;
    if (pending) {
      pending.reject(new Error(`local psql session exited: ${stderr.trim()}`));
      pending = null;
    }
  });

  const session: LocalSqlSession = {
    query(sql) {
      if (exited) {
        return Promise.reject(new Error("local psql session is closed"));
      }
      return new Promise<string>((resolve, reject) => {
        const marker = `__DONE_${randomUUID()}__`;
        pending = { marker, resolve, reject };
        child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      });
    },
    async close() {
      if (!exited) {
        child.stdin.end();
        await new Promise<void>((resolve) => {
          const killTimer = setTimeout(() => child.kill(), 5_000);
          child.once("exit", () => {
            clearTimeout(killTimer);
            resolve();
          });
        });
      }
    },
  };

  await session.query(
    "SET lock_timeout = '15s'; SET statement_timeout = '30s'; SET idle_in_transaction_session_timeout = '60s';",
  );
  return session;
}
