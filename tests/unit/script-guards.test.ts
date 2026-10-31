// The generator scripts run as CLIs only when executed directly; importing them (tests, `node -e`,
// a REPL) must not run or crash. Regression guard: the pathToFileURL guard threw when
// process.argv[1] is undefined, as it is under `node -e` (found 2026-10-31).
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

for (const script of ["scripts/make-er-sample.mjs", "scripts/make-kalshi-schema.mjs"]) {
  test(`${script} can be imported from node -e without running or crashing`, () => {
    const r = spawnSync(process.execPath, ["-e", `import("./${script}").then((m) => console.log("exports:", Object.keys(m).length))`], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^exports: \d+/);
    assert.doesNotMatch(r.stdout, /written|er-sample\.json:/);
  });
}
