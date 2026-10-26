// JSON-LD is written into the page with set:html; no field may be able to close the <script>.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { serialiseJsonLd } from "../../src/lib/seo.ts";

test("serialised JSON-LD cannot break out of its script tag and still round-trips", () => {
  const hostile = { name: '</script><script>alert(1)</script>', note: "a & b > c" };
  const out = serialiseJsonLd(hostile);
  assert.doesNotMatch(out, /<\/script/i);
  assert.doesNotMatch(out, /[<>&]/);
  assert.deepEqual(JSON.parse(out), hostile);
});
