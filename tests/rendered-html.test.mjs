import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the exploration map", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>/);
  assert.match(html, /class="topbar map-topbar"/);
  assert.doesNotMatch(html, />\uD558\uC218\uAD6C<|>\uC774\uB984 \uBBF8\uC815 \uC9C0\uC5ED</);
  assert.doesNotMatch(html, /THE DESCENT/);
  assert.match(html, /class="map-viewport"/);
  assert.match(html, /class="map-room /);
  assert.match(html, /aria-label=/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});
