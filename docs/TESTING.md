# Kernel Surface Ledger dashboard — end-to-end test guide

Everything below is runnable by a reader with no kernel knowledge. Each test says
what to do, what a pass looks like, and what a failure means.

---

## 0. Prerequisites

| Need                        | Why                                  | How to check                         |
| --------------------------- | ------------------------------------ | ------------------------------------ |
| Node/Bun + `bun install`    | app deps                             | `bun --version`                      |
| A browser                   | the whole product is a web dashboard | —                                    |
| `OPENROUTER_API_KEY` secret | live AI narration + Q&A              | AI panels answer instead of erroring |

Run the app:

```bash
bun install
bun run dev        # http://localhost:8080
```

Nothing below needs a real Linux host: a bundled demo scan ships with the app.

---

## 1. Dashboard loads with zero setup (public)

1. Open `/`.
2. **Pass:** header band shows `reachable weight 106 → 43.5`, reachable CVEs,
   and an orphan ratio; the Surface Debt Ledger, Orphaned Surface grid, Gates
   table and Hardening Plan all render.
3. **Pass:** no network call is required for the numbers — the demo scan is bundled.

Failure to render means the report failed schema validation; see test 3.

---

## 2. Load your own scan (public)

Produce a report with the CLI from the `ksl` repo:

```bash
ksl scan --json > report.json     # on the Linux host you want to audit
```

Then either drag `report.json` onto the dashboard, or use the file picker.

**Pass:** every figure switches to your host; the kernel version and collection
timestamp in the provenance panel match your machine.

---

## 3. Bad input is explained, not crashed (public)

Try all four, one at a time:

| Input                                         | Expected message                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| a `.txt` file                                 | "not a JSON file" + how to export properly                                           |
| an empty file                                 | "file is empty"                                                                      |
| a file with a syntax error (`{"a":`)          | "invalid JSON" + the `jq . report.json` fix                                          |
| valid JSON of the wrong shape (`{"hello":1}`) | "wrong schema" + the exact failing field, e.g. `score.orphan_ratio must be a number` |

**Pass:** each shows a classified panel with fix steps, a "Choose another file"
retry, and the previously loaded report still on screen (nothing is lost).

Quick fixtures:

```bash
printf 'not json'      > /tmp/bad.txt
printf ''              > /tmp/empty.json
printf '{"a":'         > /tmp/broken.json
printf '{"hello":1}'   > /tmp/wrongshape.json
```

---

## 4. Live AI: ask the report (direct)

On `/`, in "Ask this report", click the suggested question:

> Which single change removes the most reachable CVE mass, and what could it break?

**Pass:** the answer streams in labelled sections — `answer`, `why`,
`what it could break`, `check it` — with figures quoted from the loaded report
and ids written the report's way (`mod.bluetooth`, `sc.io_uring_setup`,
`w.dockerd`). Ties are called out explicitly (two plan steps both kill 5 CVEs,
broken by weight removed: 36.5 vs 26).

**Fail:** any of the following, all of which are bugs to report —

- visible deliberation ("let me check", "could be", "however…"),
- a number or CVE id not present in the report,
- a claim of certainty where the report has no data.

Grounding checks worth running:

| Ask                                                 | Pass condition                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| "What can this report NOT tell me about this host?" | names observation window / trace backend / non-root collection limits |
| "How many CVEs does step 4 kill?"                   | answers `1`, matching the plan table                                  |
| "What is CVE-2029-99999?"                           | refuses — not in the report                                           |

---

## 5. Live AI: per-row narration and breakage prediction (direct)

1. In the Surface Debt Ledger, expand a workload (e.g. `dockerd`) → **Re-narrate
   this row live**.
2. **Pass:** a fresh explanation appears, stamped `generated live · <model>` with
   the note that the model narrates and never computes a figure.
3. In the Hardening Plan, click **Predict breakage** on a step.
4. **Pass:** concrete services/tools named, plus one detection command.

Both are generated from the currently loaded report. Reloading clears the
temporary narration, and no report is stored remotely.

---

## 6. Resilience of the free model pool

The free pools sometimes answer "service temporarily overloaded" — including
inside a 200 response and inside the token stream.

**Pass:** the app silently falls back to the secondary model before a single
token is shown; you see an answer, or a clear one-line error, never a half
answer or a crashed panel.

To exercise the error path, unset the key and restart:

```bash
# remove OPENROUTER_API_KEY, restart, then ask a question
```

**Pass:** the panel says the model key is not configured; the deterministic
dashboard (tests 1-3) keeps working untouched.

---

## 7. Static pages to explore

| Route           | Pass condition                                                                  |
| --------------- | ------------------------------------------------------------------------------- |
| `/how-it-works` | explains the three tiers: present → reachable-unprivileged → used               |
| `/pipeline`     | shows collect → score → attribute → plan → narrate, and where the model sits    |
| `/prior-art`    | positions ksl against lynis / kconfig-hardened-check / kernel-hardening-checker |
| `/submission`   | maps each hackathon requirement to the feature that satisfies it                |

Each page has its own title and description (view source or check the tab).

---

## 8. Automated checks

```bash
bun run lint          # eslint
bunx tsgo --noEmit    # typecheck
bun run build         # production build must succeed
```

**Pass:** all three exit 0.

---

## What "correct" means in this project

The deterministic engine owns every number: weights, reachability, CVE counts,
orphan detection and the plan ordering. The model only puts those numbers into
sentences, predicts breakage and drafts artifacts. If the model's prose ever
disagrees with a table on screen, **the table is right and it is a bug** —
that is the invariant to test against.
