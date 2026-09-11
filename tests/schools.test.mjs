import { test } from "node:test";
import assert from "node:assert/strict";

const hooks = {};
let saved, menu, warnings = [];
globalThis.Hooks = { once: (name, fn) => { hooks[name] = fn; } };
globalThis.foundry = {
  applications: { api: {
    ApplicationV2: class {
      element = { querySelector: () => null };
      async _prepareContext() { return {}; }
      async render() {}
    },
    HandlebarsApplicationMixin: Base => Base
  } },
  utils: { deepClone: structuredClone, randomID: () => "testNewSchool" }
};
globalThis.CONFIG = { DND5E: { spellSchools: {
  abj: { label: "DND5E.SchoolAbj", icon: "original.svg", fullKey: "abjuration" }
} } };
globalThis.game = {
  system: { id: "dnd5e" }, user: { isGM: true }, ready: false,
  settings: {
    register: (id, key, data) => { saved = structuredClone(data.default); },
    registerMenu: (id, key, data) => { menu = data; },
    get: () => structuredClone(saved),
    set: async (id, key, data) => { saved = structuredClone(data); }
  }
};
globalThis.ui = { notifications: { warn: msg => warnings.push(msg) } };
const { DEFAULT_SCHOOLS, validateSchools, buildSchoolConfig, SpellSchoolsSettings, sheetIcon } = await import("../scripts/main.mjs");
const target = (action, id, name = "", icon = "") => ({
  dataset: { action },
  closest: () => ({ dataset: { schoolId: id }, querySelector: selector => ({ value: selector.includes('"icon"') ? icon : name }) })
});
async function act(app, action, id, name, icon) {
  await SpellSchoolsSettings.onAction.call(app, {}, target(action, id, name, icon));
}

test("upgrade defaults restore all eight original schools and register GM settings", () => {
  hooks.init(); hooks.setup();
  assert.equal(saved.length, 8);
  assert.deepEqual(Object.values(CONFIG.DND5E.spellSchools).map(s => s.label), DEFAULT_SCHOOLS.map(s => s.name));
  assert.equal(menu.restricted, true);
  assert.equal(CONFIG.DND5E.spellSchools.abj.icon, "original.svg");
});
test("add, save, edit, cancel, and remove persist the expected school table", async () => {
  saved = structuredClone(DEFAULT_SCHOOLS);
  const app = new SpellSchoolsSettings();
  await act(app, "add");
  assert.equal(saved.length, 8);
  const id = app.editing.id;
  await act(app, "save", id, "Charms");
  assert.equal(saved.at(-1).name, "Charms");
  await act(app, "edit", "enc");
  await act(app, "save", "enc", "Enchantment Revised");
  assert.equal(saved.find(s => s.id === "enc").name, "Enchantment Revised");
  await act(app, "edit", "enc");
  await act(app, "cancel");
  assert.equal(saved.find(s => s.id === "enc").name, "Enchantment Revised");
  await act(app, "remove", id);
  assert.equal(saved.length, 8);
});
test("last school is protected in both the table and action handler", async () => {
  saved = [{ id: "one", name: "Only School" }];
  warnings = [];
  const app = new SpellSchoolsSettings();
  assert.equal((await app._prepareContext({})).rows[0].removeDisabled, true);
  await act(app, "remove", "one");
  assert.equal(saved.length, 1);
  assert.match(warnings[0], /At least one/);
  assert.throws(() => validateSchools([]), /At least one/);
});
test("removal changes choices without retaining removed entries or mutating baseline", () => {
  const baseline = { abj: { label: "Abjuration", icon: "original.svg" }, evo: { label: "Evocation" } };
  const config = buildSchoolConfig([{ id: "abj", name: "Jinx" }, { id: "new", name: "Custom" }], baseline);
  assert.equal(config.abj.label, "Jinx");
  assert.equal(config.abj.icon, "original.svg");
  assert.equal(config.evo, undefined);
  assert.equal(baseline.abj.label, "Abjuration");
  assert.equal(config.new.icon, "icons/svg/book.svg");
});
test("no school count cap or duplicate-name restriction", () => {
  assert.equal(validateSchools(Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, name: "Magic" }))).length, 500);
});
test("players cannot mutate the table", async () => {
  const before = structuredClone(saved);
  game.user.isGM = false;
  await act(new SpellSchoolsSettings(), "remove", saved[0].id);
  assert.deepEqual(saved, before);
  game.user.isGM = true;
});

test("old saved tables preserve native icons and book fallback without migration", () => {
  const config = buildSchoolConfig([{ id: "abj", name: "Jinx" }, { id: "custom", name: "Charms" }], {
    abj: { icon: "native.svg", fullKey: "abjuration" }
  });
  assert.equal(config.abj.icon, "native.svg");
  assert.equal(config.custom.icon, "icons/svg/book.svg");
});

test("new and existing school icons persist and clearing restores the default", async () => {
  saved = structuredClone(DEFAULT_SCHOOLS);
  const app = new SpellSchoolsSettings();
  await act(app, "edit", "abj");
  await act(app, "save", "abj", "Jinx", "worlds/example/jinx.svg");
  assert.equal(saved.find(s => s.id === "abj").icon, "worlds/example/jinx.svg");
  assert.equal(buildSchoolConfig(saved, {}).abj.icon, "worlds/example/jinx.svg");
  await act(app, "add");
  const id = app.editing.id;
  await act(app, "save", id, "Charms", "icons/custom/charms.webp");
  assert.equal(saved.find(s => s.id === id).icon, "icons/custom/charms.webp");
  await act(app, "edit", "abj");
  await act(app, "save", "abj", "Jinx", "");
  assert.equal(buildSchoolConfig(saved, { abj: { icon: "native.svg" } }).abj.icon, "native.svg");
});

test("image picker preserves draft name and icon without saving until Save", async () => {
  let pickerOptions;
  foundry.applications.apps = { FilePicker: { implementation: class {
    constructor(options) { pickerOptions = options; }
    browse() {}
  } } };
  saved = structuredClone(DEFAULT_SCHOOLS);
  const app = new SpellSchoolsSettings();
  app.rendered = true;
  await act(app, "edit", "abj");
  await act(app, "browse", "abj", "Draft Name", "before.svg");
  assert.equal(pickerOptions.type, "image");
  assert.equal(pickerOptions.current, "before.svg");
  pickerOptions.callback("chosen.svg");
  assert.equal(app.editing.name, "Draft Name");
  assert.equal(app.editing.icon, "chosen.svg");
  assert.equal(saved[0].name, "Abjuration");
  await act(app, "cancel");
  pickerOptions.callback("late.svg");
  assert.equal(app.editing, null);
  assert.equal(saved[0].icon, undefined);
});

test("raster icons are supplied as SVG markup to the native SVG-only renderer", () => {
  assert.equal(sheetIcon("icons/symbol.svg"), "icons/symbol.svg");
  const path = 'icons/custom/charm.webp?x=1&y="2"';
  const result = sheetIcon(path);
  assert.ok(result.startsWith("data:image/svg+xml,"));
  const markup = decodeURIComponent(result.split(",")[1]);
  assert.match(markup, /<svg[^>]+><image /);
  assert.ok(markup.includes('href="icons/custom/charm.webp?x=1&amp;y=&quot;2&quot;"'));
  const schools = [{ id: "custom", name: "Charms", icon: path }];
  assert.equal(buildSchoolConfig(schools, {}).custom.icon, result);
  assert.equal(schools[0].icon, path);
});
