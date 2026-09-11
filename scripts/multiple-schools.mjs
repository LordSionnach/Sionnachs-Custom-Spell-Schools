const ID = "sionnachs-spell-schools";
const MARKER = "_castSchool";
const escapeHTML = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function schoolIds(item) {
  if (item?.type !== "spell") return [];
  const available = CONFIG.DND5E.spellSchools;
  const selected = item.getFlag(ID, MARKER);
  if (selected && available[selected]) return [selected];
  const ids = available[item.system.school] ? [item.system.school] : [];
  for (const entry of item.getFlag(ID, "multipleSchools")?.additional ?? []) {
    if (!entry.enabled || !entry.school || !available[entry.school] || ids.includes(entry.school)) break;
    ids.push(entry.school);
  }
  return ids;
}

export function schoolLabel(item) {
  const labels = schoolIds(item).map(id => CONFIG.DND5E.spellSchools[id].label);
  const conjunction = item.getFlag(ID, "multipleSchools")?.useOr ? "or" : "and";
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(` ${conjunction} `);
  return `${labels.slice(0, -1).join(", ")}, ${conjunction} ${labels.at(-1)}`;
}

export function needsSchoolChoice(item) {
  return item?.type === "spell" && !item.getFlag(ID, MARKER)
    && !!item.getFlag(ID, "multipleSchools")?.useOr && schoolIds(item).length > 1;
}

const dialogClasses = new WeakMap();
export function getSchoolDialog(BaseDialog) {
  if (dialogClasses.has(BaseDialog)) return dialogClasses.get(BaseDialog);
  class SchoolUsageDialog extends BaseDialog {
    static PARTS = {
      school: { template: `modules/${ID}/templates/casting-school.hbs` },
      ...BaseDialog.PARTS
    };
    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (partId === "school") {
        context.schoolOptions = schoolIds(this.item).map(id => ({
          id, label: CONFIG.DND5E.spellSchools[id].label,
          selected: id === this.config.schoolChoice
        }));
      }
      return context;
    }
    static async create(activity, config, options) {
      // The native dialog handles cancellation and performs no resource spending here.
      const result = await super.create(activity, config, options);
      const selected = config.schoolChoice;
      if (!schoolIds(activity.item).includes(selected)) throw new Error("Choose a valid spell school.");
      // Activity.use supplies a temporary item clone. Never update the saved spell.
      activity.item.updateSource({ "system.school": selected, [`flags.${ID}.${MARKER}`]: selected });
      return result;
    }
  }
  dialogClasses.set(BaseDialog, SchoolUsageDialog);
  return SchoolUsageDialog;
}

export function prepareSchoolUse(activity, usage, dialog) {
  if (!needsSchoolChoice(activity.item)) return;
  const ids = schoolIds(activity.item);
  if (!ids.includes(usage.schoolChoice)) usage.schoolChoice = ids[0];
  // Extend whichever dialog other modules selected, including Upscaled Cantrips.
  dialog.applicationClass = getSchoolDialog(dialog.applicationClass);
  dialog.configure = true;
}

function field(labelText) {
  const group = document.createElement("div");
  group.className = "form-group";
  group.dataset.multiSchool = "true";
  const label = document.createElement("label");
  label.textContent = labelText;
  const fields = document.createElement("div");
  fields.className = "form-fields";
  group.append(label, fields);
  return { group, label, fields };
}

export function renderSchoolFields(sheet, html) {
  const root = html?.querySelector ? html : html?.[0];
  const item = sheet.document ?? sheet.item;
  if (!root || item?.type !== "spell") return;
  root.querySelectorAll("[data-multi-school]").forEach(node => node.remove());
  const selector = 'section.tab[data-tab="details"]';
  const details = root.matches?.(selector) ? root : root.querySelector(selector);
  const primary = details?.querySelector('[name="system.school"]')?.closest(".form-group");
  const text = schoolLabel(item);
  if (schoolIds(item).length > 1) {
    const summary = document.createElement("p");
    summary.dataset.multiSchool = "true";
    summary.className = "sionnach-school-summary";
    summary.textContent = text;
    root.querySelector(".sheet-header .identity-info")?.append(summary);
  }
  if (!primary) return;
  const editable = item.isOwner && sheet.isEditable !== false && sheet.isEditMode !== false;
  const config = foundry.utils.deepClone(item.getFlag(ID, "multipleSchools") ?? {});
  config.additional = Array.isArray(config.additional) ? config.additional : [];
  const save = async event => {
    // These controls save one atomic flag instead of participating in the native item form.
    event.stopPropagation();
    if (!editable) return;
    try { await item.setFlag(ID, "multipleSchools", config); }
    catch (error) { ui.notifications.error(error.message); sheet.render(false); }
  };
  const orRow = field('Use "or" instead of "and"');
  const useOr = document.createElement("input");
  useOr.type = "checkbox";
  useOr.checked = !!config.useOr;
  useOr.disabled = !editable;
  useOr.id = `${sheet.id}-school-use-or`;
  orRow.label.htmlFor = useOr.id;
  useOr.addEventListener("change", event => { config.useOr = useOr.checked; save(event); });
  orRow.fields.append(useOr);
  primary.before(orRow.group);
  let anchor = primary;
  const used = new Set([item.system.school]);
  // Show the selected chain and exactly one next optional row, without a fixed school-count limit.
  for (let index = 0; ; index++) {
    const entry = config.additional[index] ?? { enabled: false, school: "" };
    const ordinal = ["Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"][index];
    const title = ordinal ? `${ordinal} Spell School` : `Spell School ${index + 2}`;
    const row = field(title);
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = !!entry.enabled;
    toggle.disabled = !editable;
    toggle.setAttribute("aria-label", `Enable ${title}`);
    const select = document.createElement("select");
    select.id = `${sheet.id}-extra-school-${index}`;
    row.label.htmlFor = select.id;
    select.disabled = !editable || !entry.enabled;
    select.add(new Option("Choose a school", ""));
    for (const [id, school] of Object.entries(CONFIG.DND5E.spellSchools)) {
      if (!used.has(id)) select.add(new Option(school.label, id));
    }
    select.value = entry.school;
    const persist = event => {
      config.additional[index] = { enabled: toggle.checked, school: select.value };
      save(event);
    };
    toggle.addEventListener("change", persist);
    select.addEventListener("change", persist);
    row.fields.append(toggle, select);
    anchor.after(row.group);
    anchor = row.group;
    if (!entry.enabled || !entry.school || !CONFIG.DND5E.spellSchools[entry.school] || used.has(entry.school)) break;
    used.add(entry.school);
  }
}

export function installMultipleSchools() {
  const Spell = CONFIG.Item?.dataModels?.spell;
  if (!Spell) return;
  const derived = Spell.prototype.prepareDerivedData;
  Spell.prototype.prepareDerivedData = function(...args) {
    const result = derived.apply(this, args);
    if (schoolIds(this.parent).length) this.parent.labels.school = schoolLabel(this.parent);
    return result;
  };
  const cardData = Spell.prototype.getCardData;
  Spell.prototype.getCardData = async function(...args) {
    const context = await cardData.apply(this, args);
    if (schoolIds(this.parent).length > 1) {
      context.subtitle = [escapeHTML(this.parent.labels.level), escapeHTML(schoolLabel(this.parent))].filter(Boolean).join(" &bull; ");
    }
    return context;
  };
  const owners = new Set();
  for (const type of Object.values(CONFIG.DND5E.activityTypes)) {
    let proto = type.documentClass?.prototype;
    while (proto && !Object.hasOwn(proto, "_usageChatContext")) proto = Object.getPrototypeOf(proto);
    // Find the shared native activity implementation, even if a subtype customizes its chat context.
    while (proto && !Object.hasOwn(proto, "_prepareUsageConfig")) proto = Object.getPrototypeOf(proto);
    if (proto) owners.add(proto);
  }
  for (const proto of owners) {
    const requiresDialog = proto._requiresConfigurationDialog;
    proto._requiresConfigurationDialog = function(config) {
      return needsSchoolChoice(this.item) || requiresDialog.call(this, config);
    };
    const chatContext = proto._usageChatContext;
    proto._usageChatContext = async function(message) {
      const context = await chatContext.call(this, message);
      const chosen = this.item.getFlag(ID, MARKER);
      if (schoolIds(this.item).length > 1 || chosen) {
        const level = message?.data?.system?.spellLevel ?? this.item.system.level;
        context.subtitle = [escapeHTML(CONFIG.DND5E.spellLevels[level]), escapeHTML(schoolLabel(this.item))]
          .filter(Boolean).join(" &bull; ");
      }
      return context;
    };
  }
  Hooks.on("dnd5e.preUseActivity", prepareSchoolUse);
  Hooks.on("renderItemSheet5e", renderSchoolFields);
}

