# Re-apply plan: commits removed for Windows launch recovery

On **2026-09-15**, `main` was hard-reset to **`4d59a3c` (Add Windows build workflow)** so Sofia could launch on Windows again.

These **5 commits** were removed from `main` but are preserved. Re-apply them **one at a time**, rebuilding and verifying Windows launch after each step.

## Recovery references (do not delete)

| Reference | Points to | Purpose |
|-----------|-----------|---------|
| Branch `backup/before-revert-to-windows-workflow-20260915-115018` | `86bc39b` | Full tip before reset |
| Tag `reapply/STACK-TIP` | same as backup branch | Alias for the tip |
| Tag `reapply/01-…` … `reapply/05-…` | each commit below | Progressive cherry-pick targets |
| Stash `stash@{0}` *(as of reset)* | WIP on top of `86bc39b` | Uncommitted import UI + startup diagnostics — **optional**, apply only after the 5 commits are back |

## Progressive order (oldest → newest)

Cherry-pick **in this order only**. After each commit: `npm run build:win` (or CI), install, confirm cold launch twice.

### 1. Cloud sync + desktop packaging
- **Tag:** `reapply/01-cloud-sync-and-packaging`
- **SHA:** `3f6822cd820bf1fbf2e0f338f2ba273bf8dff1a0`
- **Subject:** Ship cloud push/pull sync and desktop packaging for Mac and Windows.
- **Adds:** Supabase sync services, migrations, tests; electron-builder + npm scripts for Mac/Windows installers.
- **Re-apply:**
  ```bash
  git cherry-pick 3f6822c
  # or: git cherry-pick reapply/01-cloud-sync-and-packaging
  ```

### 2. supabase-js client + hosted schema repairs
- **Tag:** `reapply/02-supabase-js-and-schema`
- **SHA:** `60b342738cbcd7419a9319f98fc3bf42323650ab`
- **Subject:** feat(sync): use supabase-js and repair hosted sync schema
- **Adds:** `@supabase/supabase-js` RPC transport, Phase-1 push/queue hardening, hosted migrations / SQL Editor scripts.
- **Re-apply:**
  ```bash
  git cherry-pick 60b3427
  ```

### 3. Windows auto-updater + safe recovery
- **Tag:** `reapply/03-windows-updater-recovery`
- **SHA:** `bb10ff7b048a6055cd2ee5b8bce3020f7826cd60`
- **Subject:** feat(updater): add Windows auto-update with safe recovery
- **Adds:** Stable `userData` pin, pre-update SQLite backups, `electron-updater`, recovery UI.
- **Re-apply:**
  ```bash
  git cherry-pick bb10ff7
  ```
- **Note:** This commit changed startup paths (`userData` / updater). Re-test Windows launch carefully here.

### 4. Packaged cloud config + sync UI + support
- **Tag:** `reapply/04-cloud-config-sync-ui-support`
- **SHA:** `23bfb6d3eedf27dee74dce7d921e5f243b185675`
- **Subject:** feat(desktop): add packaged cloud config, sync UI, and support page
- **Adds:** `resources/cloud-config.json` packaging, dashboard connectivity / Sync now, Contact Support, versioning docs for 1.0.0.
- **Re-apply:**
  ```bash
  git cherry-pick 23bfb6d
  ```

### 5. Windows CI packaging harden
- **Tag:** `reapply/05-windows-ci-packaging-harden`
- **SHA:** `86bc39bbad0ecf253236903d1a0bdee1a9424fed`
- **Subject:** fix(ci): harden Windows packaging and modernize Actions
- **Adds:** Actions v7, `USE_HARD_LINKS=false`, `icudtl.dat` / packaging validation script.
- **Re-apply:**
  ```bash
  git cherry-pick 86bc39b
  ```

## Optional: restore pre-reset WIP stash

Only after steps 1–5 are on `main` and Windows still launches:

```bash
git stash list   # confirm message: WIP before revert to 4d59a3c
git stash pop    # or: git stash apply stash@{0}
```

That stash held unfinished work (student CSV/Excel import, startup diagnostics, sync soft-fail hardening) — not part of the 5 commits.

## One-shot restore (not progressive)

If you want everything back at once instead of step-by-step:

```bash
git reset --hard backup/before-revert-to-windows-workflow-20260915-115018
# or: git reset --hard reapply/STACK-TIP
```

## Push tags to remote (recommended)

So the list survives on another machine:

```bash
git push origin backup/before-revert-to-windows-workflow-20260915-115018
git push origin 'reapply/*'
```

## Checklist

- [ ] Baseline at `4d59a3c` launches on Windows
- [x] After commit 1 — launches  *(cleared on `bisect/windows-launch`)*
- [x] After commit 2 — launches  *(cleared on `bisect/windows-launch`)*
- [ ] After commit 3 — launches *(updater / userData)*  *(FAILED stock + startup-order fix; testing restore of appId `com.sofia.app` / productName `SOFIA`)*
- [ ] After commit 4 — launches *(cloud-config)*
- [ ] After commit 5 — launches + CI packaging OK
- [ ] (Optional) stash WIP re-applied
