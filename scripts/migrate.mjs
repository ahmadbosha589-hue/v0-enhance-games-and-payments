#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Client } = pg
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const scriptsDir = join(repoRoot, "scripts")
const migrationsDir = join(scriptsDir, "migrations")
const apply = process.argv.includes("--apply")
const dryRun = process.argv.includes("--dry-run") || !apply

function loadLocalEnv() {
  const path = join(repoRoot, ".env.local")
  try {
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = raw.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[match[1]]) process.env[match[1]] = value
    }
  } catch {
    // A missing local env file is handled by the required-variable check below.
  }

  process.env.DATABASE_URL ||= process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || ""
}

loadLocalEnv()

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

const files = [
  join(migrationsDir, "000_migration_state.sql"),
  ...readdirSync(scriptsDir)
    .filter((name) => /^0(?:7[1-9]|8[0-9])_.*\.sql$/i.test(name))
    .sort()
    .map((name) => join(scriptsDir, name)),
]

const entries = files.map((path) => ({ filename: basename(path), path, checksum: checksum(path) }))
console.log(`Migration files: ${entries.length}`)
for (const entry of entries) console.log(`${entry.filename} ${entry.checksum}`)

if (dryRun) {
  console.log("Dry run only. Use --apply with a migration-compatible Postgres connection to execute.")
  process.exit(0)
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!connectionString) {
  throw new Error("DATABASE_URL, POSTGRES_URL_NON_POOLING, or POSTGRES_URL is required for --apply (value intentionally not printed)")
}

const client = new Client({
  connectionString: connectionString.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, ""),
  ssl: /sslmode=require/i.test(connectionString) ? { rejectUnauthorized: false } : undefined,
})

async function main() {
  await client.connect()
  try {
    await client.query(readFileSync(entries[0].path, "utf8"))
    const result = await client.query("SELECT filename, checksum FROM public.schema_migrations")
    const applied = new Map(result.rows.map((row) => [row.filename, row.checksum]))

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
      await client.query("BEGIN")
      try {
        await client.query(readFileSync(entry.path, "utf8"))
        await client.query(
          "INSERT INTO public.schema_migrations(filename, checksum) VALUES ($1, $2)",
          [entry.filename, entry.checksum],
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    }

    console.log("Migration run complete")
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
