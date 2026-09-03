/**
 * Smoke test: load the client bundle the way the DSH web app does
 * (window.__ModuleLoader__), with mocked require/document/ctx.
 * Run: node tests/client.smoke.mjs
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "client.js");
const code = fs.readFileSync(clientPath, "utf8");

// --- mocked browser-ish globals ---
const styleEl = { setAttribute() {}, remove() {} };
const fakeQueryable = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
global.document = {
  createElement: () => styleEl,
  head: { append() {} },
  addEventListener() {},
  removeEventListener() {},
  querySelector: fakeQueryable.querySelector,
  querySelectorAll: fakeQueryable.querySelectorAll,
};
global.localStorage = {
  _m: {},
  getItem(k) { return this._m[k] ?? null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener() {},
  removeEventListener() {},
  open() {},
};

const noop = () => {};
const fakeReact = {
  useState: () => [undefined, noop],
  useEffect: noop,
  useRef: () => ({ current: null }),
  useCallback: (f) => f,
  createElement: () => ({}),
};

let loaded = null;
global.window.__ModuleLoader__ = {
  load(spec) { loaded = spec; },
};

const runner = new Function("window", "document", "localStorage", code);
runner(window, document, localStorage, code);

assert.ok(loaded, "bundle called __ModuleLoader__.load");
assert.equal(loaded.id, "heybox");

const moduleExports = loaded.factory((name) => {
  if (name === "react") return fakeReact;
  throw new Error("unexpected require: " + name);
});
assert.deepEqual(moduleExports.inject, ["slots"], "inject services");
assert.equal(typeof moduleExports.apply, "function", "apply exported");

// --- apply() registration flow ---
let injected = null;
let registered = null;
const fakeSlots = {
  inject(name, thunk) { injected = { name, thunk }; },
  register(desc, render) { registered = { desc, render }; return "ok"; },
};
const effects = [];
const ctx = {
  effect(fn) { effects.push(fn); },
  get(name) { return name === "slots" ? fakeSlots : undefined; },
};
moduleExports.apply(ctx);
assert.equal(effects.length, 1, "stylesheet effect registered");
effects[0](); // run it
assert.ok(styleEl.textContent && styleEl.textContent.includes(".hx2"), "CSS injected");
assert.ok(injected && injected.name === "shell.overlay", "slots.inject('shell.overlay')");
const registerResult = injected.thunk();
assert.ok(registered && registered.desc.id === "heybox", "slot id heybox");
assert.equal(typeof registered.render, "function", "seat render component provided");
assert.equal(registerResult, "ok", "slots.register returns a stop handle");

console.log("client bundle smoke test passed ✔");
