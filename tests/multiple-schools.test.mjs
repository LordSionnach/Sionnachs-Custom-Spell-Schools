import { test } from "node:test";
import assert from "node:assert/strict";
import { schoolIds, schoolLabel, needsSchoolChoice, getSchoolDialog, prepareSchoolUse, installMultipleSchools } from "../scripts/multiple-schools.mjs";
const ID = "sionnachs-spell-schools";
globalThis.CONFIG = { DND5E: { spellSchools: {
  trs: { label: "Transmutation" }, con: { label: "Conjuration" }, abj: { label: "Abjuration" }
}, spellLevels: { 0: "Cantrip", 3: "3rd Level" } } };
function fixture(useOr = false, additional = [{ enabled: true, school: "con" }]) {
  const item = { type: "spell", name: "Test spell", system: { school: "trs", level: 0 },
    flags: { [ID]: { multipleSchools: { useOr, additional } } },
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    updateSource(changes) {
      this.system.school = changes["system.school"];
      this.flags[ID]._castSchool = changes[`flags.${ID}._castSchool`];
    }
  };
  return { item, activity: { id: "activity", item } };
}
class NativeDialog {
  static PARTS = { scaling: {}, consumption: {}, footer: {} };
  async _preparePartContext(part, context) { return context; }
  static async create(activity, config) { config.schoolChoice = "con"; return config; }
}
test("single schools, disabled rows, and and-spells do not force a dialog", () => {
  for (const item of [fixture(false).item, fixture(true, []).item,
    fixture(true, [{ enabled: false, school: "con" }]).item]) assert.equal(needsSchoolChoice(item), false);
  assert.equal(needsSchoolChoice(fixture(true).item), true);
});
test("saved spell labels retain conjunctions and readable lists", () => {
  assert.equal(schoolLabel(fixture().item), "Transmutation and Conjuration");
  assert.equal(schoolLabel(fixture(true).item), "Transmutation or Conjuration");
  assert.equal(schoolLabel(fixture(true, [{ enabled: true, school: "con" }, { enabled: true, school: "abj" }]).item),
    "Transmutation, Conjuration, or Abjuration");
});
test("disabled, missing, and duplicate rows end the active chain", () => {
  for (const entry of [{ enabled: false, school: "con" }, { enabled: true, school: "missing" }, { enabled: true, school: "trs" }]) {
    assert.deepEqual(schoolIds(fixture(true, [entry]).item), ["trs"]);
  }
});
test("pre-use augments the selected native dialog and leaves consumption and scaling alone", () => {
  const { activity } = fixture(true);
  const usage = { scaling: false, consume: { spellSlot: false } };
  const dialog = { applicationClass: NativeDialog, configure: false };
  prepareSchoolUse(activity, usage, dialog);
  assert.equal(dialog.configure, true);
  assert.equal(usage.schoolChoice, "trs");
  assert.equal(usage.scaling, false);
  assert.equal(usage.consume.spellSlot, false);
  assert.ok(dialog.applicationClass.prototype instanceof NativeDialog);
  assert.deepEqual(Object.keys(dialog.applicationClass.PARTS), ["school", "scaling", "consumption", "footer"]);
});
test("native school dropdown preserves current choice across rerenders", async () => {
  const Dialog = getSchoolDialog(NativeDialog);
  const dialog = Object.assign(new Dialog(), { item: fixture(true).item, config: { schoolChoice: "con" } });
  const context = await dialog._preparePartContext("school", {}, {});
  assert.equal(context.schoolOptions.length, 2);
  assert.equal(context.schoolOptions.find(o => o.selected).id, "con");
});
test("native Cast commits choice to temporary cast document only", async () => {
  const saved = fixture(true).item;
  const { activity } = fixture(true);
  await getSchoolDialog(NativeDialog).create(activity, { schoolChoice: "trs" });
  assert.equal(activity.item.system.school, "con");
  assert.equal(schoolLabel(activity.item), "Conjuration");
  assert.equal(saved.system.school, "trs");
  assert.equal(saved.getFlag(ID, "_castSchool"), undefined);
});
test("native cancellation prevents any cast-school mutation", async () => {
  class CancelDialog extends NativeDialog { static async create() { throw new Error("Canceled"); } }
  const { activity } = fixture(true);
  await assert.rejects(getSchoolDialog(CancelDialog).create(activity, {}), /Canceled/);
  assert.equal(activity.item.system.school, "trs");
  assert.equal(activity.item.getFlag(ID, "_castSchool"), undefined);
});
test("retains upscaled-cantrip dialog behavior in the same window", () => {
  class Upscaled extends NativeDialog { static marker = "slot choices"; }
  const dialog = { applicationClass: Upscaled };
  prepareSchoolUse(fixture(true).activity, { scaling: 0, spell: { slot: "spell0" } }, dialog);
  assert.ok(dialog.applicationClass.prototype instanceof Upscaled);
  assert.equal(dialog.applicationClass.marker, "slot choices");
});
test("integration forces only applicable dialogs and chat displays selected school without Cast as", async () => {
  class Spell {
    prepareDerivedData() { this.parent.labels = { level: "Cantrip", school: "Transmutation" }; }
    async getCardData() { return {}; }
  }
  class Activity {
    _prepareUsageConfig() {}
    _requiresConfigurationDialog(config) { return !!config.nativeNeedsDialog; }
    async _usageChatContext() { return { subtitle: "original", supplements: [] }; }
  }
  CONFIG.Item = { dataModels: { spell: Spell } };
  CONFIG.DND5E.activityTypes = { attack: { documentClass: Activity } };
  globalThis.Hooks = { on() {} };
  installMultipleSchools();
  const activity = Object.assign(new Activity(), { item: fixture(true).item, description: {} });
  assert.equal(activity._requiresConfigurationDialog({}), true);
  activity.item = fixture(false).item;
  assert.equal(activity._requiresConfigurationDialog({}), false);
  assert.equal(activity._requiresConfigurationDialog({ nativeNeedsDialog: true }), true);
  assert.match((await activity._usageChatContext({})).subtitle, /Transmutation and Conjuration/);
  activity.item = fixture(true).item;
  activity.item.updateSource({ "system.school": "con", [`flags.${ID}._castSchool`]: "con" });
  const context = await activity._usageChatContext({ data: { system: { spellLevel: 3 } } });
  assert.equal(context.subtitle, "3rd Level &bull; Conjuration");
  assert.deepEqual(context.supplements, []);
});
