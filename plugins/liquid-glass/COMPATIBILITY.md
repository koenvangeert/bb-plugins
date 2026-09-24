# Compatibility and verification

## Scope and accepted limitation

The live checks below were recorded in the original [koenvg/bb-plugins](https://github.com/koenvg/bb-plugins) checkout. They were not repeated after copying the plugin to this repository. They used BB 0.43.4, SDK 0.5.9, and signed-in Arc running Chromium 153 on macOS. Other BB minor releases and browser engines are not verified.

In the source checkout, the user accepted this host reload limitation: after `bb theme set catppuccin`, the CLI reported Catppuccin but the open tab retained the previous glass stylesheet. Reloading removed it. Reload after selection, switching, disabling, or removal if the appearance is stale.

The original selection was Catppuccin with System mode. Both were restored after those checks. The plugin remained installed but unselected in the source environment.

Source checkout's completion review used base commit `0635f68ff9424b4bc112ef71db8c890e979cf3ca` and covered this package and `openspec/changes/add-liquid-glass-theme/`. That change spec is not in this repository.

## Observed selector map

| Component | Hook |
| --- | --- |
| Sidebar, desktop and compact | `[data-sidebar="panel"]` |
| Sidebar inner backgrounds | `[data-sidebar="sidebar"]`, `[data-sidebar="content"]` |
| App content backing | `[data-sidebar="inset"]` |
| Composer | `[data-promptbox]` |
| Page toolbar | `header:has(> [data-testid="app-page-header-content-row"])` |
| Portalled menu | `[data-radix-popper-content-wrapper] > [role="menu"]` |
| Portalled model picker | `[data-radix-popper-content-wrapper] > [role="dialog"]` |
| Compact menu bottom sheet | `[data-persistent-drawer-content]` |
| Message backing | `[data-message-column]` |

These are host implementation details, not a stable SDK contract. BB loads component rules, `@supports`, and media rules into `style#bb-app-theme`. Native source rendering uses `diffs-container` with a shadow root; this theme does not filter or reach inside it.

## Automated checks

`npm test`, `npm run check`, and `npm run build` pass. Four tests check contribution paths, CSS parsing, no remote assets or animation, the host selector list, opaque baseline colours, and body/muted/subtle text contrast against content backing in both modes.

The initial three tests were red before implementation. The compact-drawer selector check was also red before its CSS was added. Static tests do not prove visual quality or every host rendering state.

## Live evidence

- Installation leaves selection unchanged and contributes `plugin:liquid-glass:pearl` to `bb theme list`.
- Selection survives page reload. Switching, disabling, and removal followed by reload remove glass variables and return the composer's blur to `none`. Removal selected Default; reinstall succeeded. Catppuccin was restored afterward.
- Wide menus and the model picker use 18px rounded glass with `blur(18px) saturate(1.35)`. Compact menu drawers use 18px top corners with the same material.
- Compact checks used a 390x844 viewport. Navigation remained reachable and document scroll width stayed 390px. No added horizontal overflow was observed.
- Chat body text measured rgb(36,42,64) on opaque rgb(250,249,253), a 13.53:1 contrast ratio independent of wallpaper position.
- The actual CSS source viewer measured rgb(10,10,10) on opaque white, with no foreground filter. Diff and terminal rendering have not had complete live acceptance checks.
- Draft typing and keyboard text selection worked. Tabbing from the composer reached Prompt actions with a visible 1px focus ring. Test drafts were cleared without submitting a message.
- Clipboard round-trip automation did not paste the copied draft, both with Liquid Glass and BB's Default theme. This does not establish a theme regression, but copy/paste acceptance remains unverified and needs a manual check.
- Reduced-transparency emulation produced an opaque composer and no backdrop filter. Forced colours produced Canvas/CanvasText and no blur. Removing the supports block from the live CSSOM exercised the unsupported-blur baseline: opaque rgb(245,244,251), no blur. The page was reloaded afterward to discard this temporary change.
- Dark mode was selected through Appearance, checked after rendering settled, and returned to System. No automatic mode change occurs on installation or selection.
- A 120-frame requestAnimationFrame scroll check on the populated thread, with the Arc tab foregrounded, measured glass p95 7.2ms, max 7.6ms, zero frames over 50ms; Default p95 7.2ms, max 19.5ms, zero over 50ms. This is a short smoke check, not a GPU benchmark or proof for all hardware. Background-tab measurements were discarded because throttling invalidated them.
- Repeated the same 120-frame scroll smoke check at 390x844 with the compact menu open. Default p95 7.4ms/max 7.5ms; glass p95 7.2ms/max 7.5ms. Both had zero frames over 50ms. Screenshots: `evidence/default-compact-menu.png` and `evidence/glass-compact-menu-perf.png`. Compact draft typing had no observed lag; no quantitative input-latency claim is made.

## Refraction decision

A temporary composer backdrop filter referenced an inline SVG containing turbulence and displacement. Chromium accepted the syntax but the screenshot showed no convincing edge refraction. The experiment was removed. The delivered treatment is blur, highlights, and shadows, not physical refraction or native Apple Liquid Glass. There is no injected DOM, animation loop, or remote asset.

## Screenshots

- `evidence/light-menu.png`: wide theme and open thread menu.
- `evidence/light-popover.png`: wide model-picker popover.
- `evidence/compact-menu.png`: glass bottom sheet at 390px.
- `evidence/compact-navigation.png`: compact sidebar.
- `evidence/dark.png`: settled dark appearance.
- `evidence/reduced-transparency.png`, `evidence/forced-colors.png`, `evidence/unsupported-blur.png`: fallback previews.
- `evidence/source.png`: native CSS source viewer.
- `evidence/refraction-experiment.png`: rejected displacement experiment.
- `evidence/light-initial.png`: early preview before opaque message backing, not final acceptance evidence.
- `evidence/compact.png`, `evidence/compact-popover.png`: compact working view. The latter filename does not show an open popover and is not popover acceptance evidence.

## Repeatable acceptance checklist

1. Record the current palette and mode; install and explicitly select the theme, then reload.
2. Open a populated thread, model picker, thread menu, source viewer, diff, and terminal at wide and 390px widths. Check placement, text contrast, keyboard focus, selection, copy/paste, typing, and scrolling.
3. Exercise dark mode, reduced transparency, forced colours, and a disabled supports block. Discard temporary browser changes with reload.
4. Compare populated-thread scrolling with Default while the tab is foregrounded; investigate long frames before accepting effects.
5. Switch away, disable, remove, and reinstall. Reload stale clients and confirm glass CSS is gone. Restore the original palette and mode.

## Remaining gates

The source checkout's independent review found no source or design blockers but held visual acceptance. The source's task 2.3 still called for manual clipboard verification and full diff/terminal acceptance; that task is not tracked in this repository. The copied plugin passed `npm test`, `npm run check`, and `bb plugin build` here, but this repository has not repeated the live checks. Do not claim visual or accessibility acceptance based on the copied evidence.
