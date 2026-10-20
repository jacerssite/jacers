# Jacer Game Development Update

This update records the second implementation pass after the previous development update.

## Implemented

- Roulette is isolated in its own **Roulette & spinning** control-center tab.
- The owner panel keeps shared settings server-side; tester changes remain local to the tester device.
- Secret portal distribution supports both normal and prestige routes, including the correct target key, and has a configurable normal/prestige spawn chance.
- Prestige planet access starts at prestige 1. Individual prestige routes can require a higher prestige level. Prestige itself requires completion of every normal route; asteroid currency is not a prestige gate.
- Completing a prestige resets run currencies, route clears, and per-level asteroid claim state so the next prestige can collect those asteroids again.
- Colors and skins are presented together in one Appearance section. A skin's canonical color follows the selected ship, and locked cosmetics remain locked until their level, prestige, or roulette requirement is met.
- Owner and tester role indicators open an in-level quick panel. The panel pauses the run and supports resource grants, route-key grants, enemy clearing, and a shortcut to the full control center.
- Profile visibility supports **Appear offline**. Leaderboard names open live player profiles with online status, role badges, titles, and ship previews. The leaderboard now filters by a specific level and no longer has an “All levels” entry.
- Owners can create, edit, remove, and equip shared profile titles from the control center. Players can select titles they have earned in Account settings.
- Credits now has an update-history dropdown. Owners can remove draft entries, paste multi-paragraph text, preserve whitespace, and publish the complete log for everyone.
- A 1,000-normal-asteroid **Cooldown Reset** item appears under the roulette wheel and clears secret-level cooldowns.
- Roulette accepts any positive special-asteroid spend (no fixed cap), increases cosmetic-category weighting as spend rises, and lets the player choose a green, blue, or yellow color preference.
- Power-up settings include one-active-at-a-time behavior plus independent Rainbow Star invincibility and enemy-defeat toggles.
- The trail lead particle remains anchored to the ship center while the remaining particles follow as a tail.
- Defeated enemies remain hidden after route redraws and after returning from a flipped route.
- Asteroids no longer damage bosses when collected. Bosses and mini-bosses are tougher on normal routes, secret routes, and prestige routes; prestige enemies fire more frequently.
- Double-down only exits a flipped route while the ship is inside a gravity/black-hole field.
- Procedural sound effects cover UI actions, firing, enemy fire, explosions, abilities, roulette spins, rewards, and game-over events. Existing background music remains generated in-browser and follows the current planet/room.
- The progress meter is clickable: each row expands an explanation of what remains.
- Keyboard shortcuts include `R` to restart the current route, `Enter` to launch the first available level from mission select, and `Backspace` to return from a page to the main menu when focus is not in a form field.

## Verification

- `npm test` — all 48 tests pass.
- `npm run build` — TypeScript compilation and the Vite production build pass.

## Deployment note

The server now validates the portal chance and profile-title settings before saving them. Deploy the updated client and server together so the new `/api/settings/profile-titles` endpoint and extended game configuration are available to the client.
