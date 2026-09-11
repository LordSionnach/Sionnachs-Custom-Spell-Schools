import { installMultipleSchools, schoolLabel } from "./multiple-schools.mjs";
// Keep the package ID so existing enabled installations update in place.
export const MODULE_ID = "sionnachs-spell-schools";
export const DEFAULT_SCHOOLS = [
  { id: "abj", name: "Abjuration" }, { id: "con", name: "Conjuration" },
  { id: "div", name: "Divination" }, { id: "enc", name: "Enchantment" },
  { id: "evo", name: "Evocation" }, { id: "ill", name: "Illusion" },
  { id: "nec", name: "Necromancy" }, { id: "trs", name: "Transmutation" }
];
let originals = {};
const managers = new Set();
export function validateSchools(schools) {
  if (!Array.isArray(schools) || !schools.length) throw new Error("At least one spell school must remain.");
  const ids = new Set();
  return schools.map(s => {
    if (!s || typeof s.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(s.id) || ids.has(s.id)) {
      throw new Error("Spell school identifiers must be valid and unique.");
    }
    if (typeof s.name !== "string" || !s.name.trim()) throw new Error("Enter a name for the spell school.");
    ids.add(s.id);
    return { id: s.id, name: s.name.trim(), ...(typeof s.icon === "string" && s.icon.trim() ? { icon: s.icon.trim() } : {}) };
  });
}
export function buildSchoolConfig(schools, baseline) {
  return Object.fromEntries(validateSchools(schools).map(s => [s.id, {
    ...(baseline[s.id] ?? { fullKey: s.id }), label: s.name,
    icon: sheetIcon(s.icon || baseline[s.id]?.icon || "icons/svg/book.svg")
  }]));
}
export function sheetIcon(path) {
  // D&D 5e's <dnd5e-icon> fetches SVG markup, not ordinary image files.
  // Embed raster images in SVG while retaining the original path in world settings.
  if (!/\.(?:png|jpe?g|webp|gif|avif|bmp|ico)(?:[?#].*)?$/i.test(path)) return path;
  const href = path.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="${href}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function getSchools() { return validateSchools(game.settings.get(MODULE_ID, "schools")); }
function applySchools(schools) {
  CONFIG.DND5E.spellSchools = buildSchoolConfig(schools, originals);
  if (!game.ready) return;
  const actors = new Set([...game.actors, ...(canvas?.tokens?.placeables ?? []).map(t => t.actor).filter(Boolean)]);
  const items = new Set([...game.items, ...Array.from(actors).flatMap(a => [...a.items])]);
  for (const item of items) {
    if (item.type !== "spell") continue;
    item.labels.school = schoolLabel(item);
    for (const app of Object.values(item.apps)) if (app.rendered) app.render(false);
  }
  for (const actor of actors) {
    for (const app of Object.values(actor.apps)) if (app.rendered) app.render(false);
  }
  for (const app of managers) if (app.rendered) app.render(false);
}
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class SpellSchoolsSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sionnach-custom-spell-schools", classes: ["sionnach-custom-spell-schools"],
    window: { title: "Sionnach's Custom Spell Schools", resizable: true },
    position: { width: 720, height: "auto" },
    actions: Object.fromEntries(["add", "edit", "save", "cancel", "remove", "browse"].map(key => [key, this.onAction]))
  };
  static PARTS = {
    schools: { template: `modules/${MODULE_ID}/templates/schools.hbs`, scrollable: [".school-list"] }
  };
  editing = null;
  busy = false;
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const schools = getSchools();
    const rows = schools.map(s => ({ ...s, name: this.editing?.id === s.id ? this.editing.name : s.name,
      icon: (this.editing?.id === s.id ? this.editing.icon : s.icon) || originals[s.id]?.icon || "icons/svg/book.svg",
      editing: this.editing?.id === s.id,
      removeDisabled: schools.length <= 1 || this.busy, editDisabled: !!this.editing || this.busy }));
    if (this.editing?.isNew) rows.push({ ...this.editing, editing: true });
    managers.add(this);
    return { ...context, rows, addDisabled: !!this.editing || this.busy, busy: this.busy };
  }
  async close(options) { managers.delete(this); return super.close(options); }
  static async onAction(event, target) {
    if (!game.user.isGM || this.busy) return;
    const action = target.dataset.action;
    const row = target.closest("[data-school-id]");
    const id = row?.dataset.schoolId;
    try {
      if (action === "add") {
        if (this.editing) return;
        this.editing = { id: `custom-${foundry.utils.randomID()}`, name: "", icon: "icons/svg/book.svg", isNew: true };
      } else if (action === "edit") {
        if (this.editing) return;
        const school = getSchools().find(s => s.id === id);
        if (!school) return;
        this.editing = { ...school, icon: school.icon || originals[id]?.icon || "icons/svg/book.svg", isNew: false };
      } else if (action === "cancel") this.editing = null;
      else if (action === "browse") {
        if (!this.editing || this.editing.id !== id) return;
        const draft = this.editing;
        draft.name = row.querySelector('[data-field="name"]').value;
        draft.icon = row.querySelector('[data-field="icon"]').value;
        const picker = new foundry.applications.apps.FilePicker.implementation({
          type: "image", current: draft.icon,
          callback: path => {
            // A picker may finish after the row has been saved or canceled.
            if (this.editing !== draft || !this.rendered) return;
            draft.icon = path;
            const currentRow = this.element.querySelector(`[data-school-id="${id}"]`);
            if (currentRow) {
              draft.name = currentRow.querySelector('[data-field="name"]').value;
              currentRow.querySelector('[data-field="icon"]').value = path;
              currentRow.querySelector("img").src = path;
            }
          }
        });
        picker.browse();
        return;
      }
      else if (action === "save") {
        if (!this.editing || this.editing.id !== id) return;
        const name = row.querySelector('[data-field="name"]').value.trim();
        const icon = row.querySelector('[data-field="icon"]').value.trim();
        this.editing.name = name;
        this.editing.icon = icon;
        if (!name) throw new Error("Enter a name for the spell school.");
        const schools = getSchools();
        if (this.editing.isNew) schools.push({ id, name, icon });
        else {
          const school = schools.find(s => s.id === id);
          if (!school) throw new Error("This school was removed by another GM. Cancel to refresh the table.");
          school.name = name;
          school.icon = icon;
        }
        this.busy = true;
        await game.settings.set(MODULE_ID, "schools", validateSchools(schools));
        this.editing = null;
      } else if (action === "remove") {
        const schools = validateSchools(getSchools().filter(s => s.id !== id));
        this.busy = true;
        await game.settings.set(MODULE_ID, "schools", schools);
        if (this.editing?.id === id) this.editing = null;
      }
    } catch (error) { ui.notifications.warn(error.message); }
    finally { this.busy = false; }
    await this.render({ force: true });
    if (this.editing) this.element.querySelector("input")?.focus();
  }
}
Hooks.once("init", () => {
  if (game.system.id !== "dnd5e") return;
  originals = foundry.utils.deepClone(CONFIG.DND5E.spellSchools);
  game.settings.register(MODULE_ID, "schools", {
    name: "Custom Spell Schools", scope: "world", config: false, type: Array,
    default: DEFAULT_SCHOOLS.map(s => ({ ...s })), onChange: applySchools
  });
  game.settings.registerMenu(MODULE_ID, "manageSchools", {
    name: "Spell Schools", label: "Manage Spell Schools",
    hint: "Add, rename, or remove spell schools for this world. At least one school must remain.",
    icon: "fa-solid fa-book-open", type: SpellSchoolsSettings, restricted: true
  });
});
Hooks.once("setup", () => {
  if (game.system.id === "dnd5e") {
    applySchools(getSchools());
    installMultipleSchools();
  }
});
