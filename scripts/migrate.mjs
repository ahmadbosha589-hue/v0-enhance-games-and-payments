#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const scriptsDir = join(repoRoot, "scripts")
const migrationsDir = join(scriptsDir, "migrations")
const apply = process.argv.includes("--apply")
const dryRun = process.argv.includes("--dry-run") || !apply

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function sqlQuote(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function runPsql(args, input) {
  const result = spawnSync("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", ...args], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  })
  if (result.error) throw new Error(`psql is required for --apply: ${result.error.message}`)
  if (result.status !== 0) throw new Error(result.stderr.trim() || `psql exited with ${result.status}`)
  return result.stdout.trim()
}

const files = [
  join(migrationsDir, "000_migration_state.sql"),
  ...readdirSync(scriptsDir)
    .filter((name) => /^07[1-9]_.*\.sql$/i.test(name))
    .sort()
    .map((name) => join(scriptsDir, name)),
]

const entries = files.map((path) => ({ filename: basename(path), path, checksum: checksum(path) }))
console.log(`Migration files: ${entries.length}`)
for (const entry of entries) console.log(`${entry.filename} ${entry.checksum}`)

if (dryRun) {
  console.log("Dry run only. Use --apply with DATABASE_URL and psql to execute.")
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for --apply (value intentionally not printed)")
}

runPsql(["--dbname", process.env.DATABASE_URL], readFileSync(entries[0].path, "utf8"))
const rows = runPsql([
  "--dbname", process.env.DATABASE_URL,
  "--tuples-only",
  "--no-align",
  "--command",
  "SELECT filename || E'\\t' || checksum FROM public.schema_migrations",
])
const applied = new Map()
for (const line of rows.split(/\r?\n/).filter(Boolean)) {
  const [filename, digest] = line.split("\t")
  if (filename && digest) applied.set(filename, digest)
}

for (const entry of entries.slice(1)) {
  const existing = applied.get(entry.filename)
  if (existing === entry.checksum) {
    console.log(`skip ${entry.filename}`)
    continue
  }
  if (existing && existing !== entry.checksum) {
    throw new Error(`Refusing changed applied migration: ${entry.filename}`)
  }

  console.log(`apply ${entry.filename}`)
  runPsql(["--dbname", process.env.DATABASE_URL, "--file", entry.path])
  runPsql([
    "--dbname", process.env.DATABASE_URL,
    "--command",
    `INSERT INTO public.schema_migrations(filename, checksum) VALUES (${sqlQuote(entry.filename)}, ${sqlQuote(entry.checksum)})`,
  ])
}

console.log("Migration run complete")
