# Liquid Glass

A light pearly BB theme with a local pastel wallpaper, rounded glass controls, bright rims, and soft shadows. Dark mode has a conservative compatibility palette. This is a CSS approximation, not Apple's native renderer.

## Local development

Requires BB 0.43.4 and SDK 0.5.9. Later minor BB versions are deliberately excluded until their host selectors are checked.

```sh
cd plugins/liquid-glass
npm ci
npm test
npm run check
bb plugin build
bb plugin install path:. --yes
bb theme show
bb theme set plugin:liquid-glass:pearl
```

Installation does not select the theme. Select it explicitly in Appearance or with the command above. Use light mode for the pastel art direction; installing and selecting the theme do not change the mode preference.

BB 0.43.4 can leave an open tab showing the old stylesheet after a CLI theme change. Reload the page after selecting, switching away, disabling, or removing this theme if the appearance is stale. This is an accepted host limitation; the plugin does not patch BB's synchronization behavior.

After CSS edits, run `bb plugin reload liquid-glass`, then reload the page. The theme contribution requires no frontend bundle, timers, remote assets, settings, or database.

## Rollback

Before selecting the theme, note the result of `bb theme show`. Restore it with `bb theme set <previous-id>`. For the development session the previous ID was `catppuccin`. Disabling or removing the plugin should return BB to its fallback theme; lifecycle verification is tracked in COMPATIBILITY.md.

## Verification

See [COMPATIBILITY.md](COMPATIBILITY.md) for the host selectors and actual verification status. Static tests check packaging and CSS guardrails, not appearance. Live browser checks are required before claiming visual or accessibility acceptance.
