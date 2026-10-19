# Source layout

- `main.ts` starts the app; `myCode.ts` coordinates game state, remaining menus, and the gameplay loop.
- `levels.ts`, `cosmetics.ts`, and `game-config.ts` hold the level, appearance, and default game data.
- `customization.ts`, `appearance.ts`, `ship-art.ts`, and `trail.ts` handle ship choices, previews, artwork, and trails.
- `leaderboard.ts`, `account-recovery.ts`, `admin-tools.ts`, and `managed-users.ts` handle online-facing screens.
- `level-maker.ts` contains the workshop editor. `api.ts`, `ui.ts`, and `types.ts` provide shared helpers and types.

Existing save keys and API paths are unchanged. The main gameplay file is still substantial because it owns shared runtime state; additional screen or gameplay modules can be moved out as that state is separated.
