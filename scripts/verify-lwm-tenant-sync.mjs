/**
 * Live verification of LWM tenant + Phase 1/2 sync RPCs.
 * Does not delete local queue rows. Uses anon key only.
 *
 * Usage: node scripts/verify-lwm-tenant-sync.mjs
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");

const SCHOOL_ID = "0dd470f4-4505-4aa5-a8ea-0b4c340daa5d";
const raw = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_ANON_KEY || "";
const base = raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

if (!base || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY");
  process.exit(1);
}

async function rpc(name, body) {
  const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function openLocalDb() {
  const dbPath = path.join(
    os.homedir(),
    "Library/Application Support/sofia (development)/sofia.db",
  );
  return new Database(dbPath, { readonly: false });
}

async function main() {
  const deviceId = randomUUID();
  console.log("=== 1. register_device ===");
  const reg = await rpc("register_device", {
    p_id: deviceId,
    p_school_id: SCHOOL_ID,
    p_device_name: "Sofia verify-lwm",
    p_device_fingerprint: "verify-lwm-" + Date.now(),
  });
  console.log(JSON.stringify(reg, null, 2));
  if (!reg.json?.success) {
    console.error(
      "FAIL: register_device — apply supabase/manual/APPLY_SYNC_FIX_AND_LWM_TENANT.sql first",
    );
    process.exit(2);
  }

  console.log("=== 2. pull_sync_changes (empty/ok) ===");
  const pull = await rpc("pull_sync_changes", {
    p_school_id: SCHOOL_ID,
    p_device_id: deviceId,
    p_cursor: 0,
    p_limit: 5,
  });
  console.log(JSON.stringify(pull, null, 2));
  if (pull.json?.success === false) {
    console.error("FAIL: pull_sync_changes");
    process.exit(3);
  }

  const db = openLocalDb();
  const pending = db
    .prepare(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
         AND table_name IN ('students', 'student_id_settings')
         AND json_extract(payload, '$.school_id') = ?
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get(SCHOOL_ID);

  if (!pending) {
    console.log(
      "No pending Phase 1 item for LWM — enqueue check via existing student snapshot skipped",
    );
    db.close();
    process.exit(0);
  }

  console.log(
    "=== 3. process_sync_operation on pending",
    pending.id,
    pending.table_name,
    "===",
  );
  const payload = JSON.parse(pending.payload);
  const proc = await rpc("process_sync_operation", {
    p_id: pending.id,
    p_school_id: SCHOOL_ID,
    p_device_id: deviceId,
    p_table_name: pending.table_name,
    p_record_id: pending.record_id,
    p_operation: pending.operation,
    p_payload: payload,
  });
  console.log(JSON.stringify(proc, null, 2));
  if (!proc.json?.success) {
    console.error("FAIL: process_sync_operation");
    db.close();
    process.exit(4);
  }

  // Mark local synced (same as push worker) — does not delete row
  db.prepare(
    `UPDATE sync_queue SET status = 'synced', last_attempt_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), pending.id);
  console.log("Local queue item marked synced:", pending.id);

  const cursor = Number(proc.json.change_id || 0);
  console.log("=== 4. update_sync_cursor ===", cursor);
  const cur = await rpc("update_sync_cursor", {
    p_school_id: SCHOOL_ID,
    p_device_id: deviceId,
    p_cursor: cursor || 0,
  });
  console.log(JSON.stringify(cur, null, 2));

  console.log("=== DONE OK ===");
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
