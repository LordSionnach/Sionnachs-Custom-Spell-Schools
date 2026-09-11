# IMPORTANT NOTE
This module is created using ChatGPT completely. I played no part in its creation, as I suck at coding, having never learned. This was created for my own custom game, but I figured others get use out of it. That is all.

# Sionnach's Custom Spell Schools

For Foundry VTT 14.364 and D&D 5e 5.3.3.

Enable the module, then open **Configure Settings → Sionnach's Custom Spell Schools → Manage Spell Schools** as a GM.

The table starts with Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, and Transmutation.

- **Add New** opens a new row. Enter a name, choose an icon, and click **Save**.
- **Edit** lets you change a school's name and icon. Use **Choose Image** to open Foundry's image picker, or paste an image path or URL. Click **Save**, or **Cancel** to discard the edit.
- **Remove** immediately removes a school. The last remaining school cannot be removed.

There is no maximum number of schools. Names must contain text; duplicate display names are allowed. Changes are saved per world and applied to connected clients.

Renaming keeps the saved school identifier, so existing spells retain their assignments. Removing a school removes it from the choices but does not rewrite spell documents. Reassign affected spells in **Details → Spell School**. Original schools start with their native icons; new schools start with a generic book. Both can be customized. Clearing an icon path restores that school's default. Existing saved school tables keep their names and assignments when upgrading.

The table previews the selected image. SVG symbols use the system's native icon rendering; PNG, JPEG, WebP, GIF, AVIF, BMP, and ICO files are embedded in an SVG container for compatibility and retain their image colors. Transparent images work best. Rules references remain unchanged.

Disabling the module restores the original system schools. Custom assignments remain saved in spell documents, but require the module to appear in the choices. Third-party interfaces that hard-code school choices may need separate support.

## Installation

Extract the ZIP into your Foundry user-data modules folder. Keep the included sionnachs-spell-schools folder: the original package ID is retained so an enabled installation updates in place. Restart Foundry after upgrading to clear the former fixed school names.

No dependencies are required. Compatible with Sionnach's Upscaled Cantrips.

## Multiple schools on a spell

Open a spell in edit mode and select **Details**. Above **Spell School**, **Use "or" instead of "and"** controls how multiple schools are combined. Below the primary school, enable **Second Spell School** and choose another school. Each enabled, selected school reveals the next optional row. There is no fixed row limit; each school can be selected once.

Controls save automatically. Disabling an optional row excludes that row and those below it, while keeping their saved choices for later. All choices come from this world's custom school table.

- With **and**, the spell and its chat card show all active schools, for example **Transmutation and Conjuration**.
- With **or**, the saved spell shows **Transmutation or Conjuration**. The normal casting dialog includes a **Spell School** dropdown. It opens even for a cantrip when two or more active schools use "or". Slot, scaling, concentration, template, and resource controls follow the normal system rules, so unused sections stay hidden and applicable controls remain available. This also works in the same dialog as Sionnach's Upscaled Cantrips. Canceling stops the cast before resource consumption. The selected school applies only to the temporary cast. Chat shows the chosen school as its school label (for example **Conjuration**), with no additional "Cast as" section. Saved school assignments remain unchanged.

The original primary-school icon is retained on the saved spell sheet. The casting choice affects the native casting document's school, not the permanent spell. Third-party casting workflows that replace the system activity implementation may require separate integration.

