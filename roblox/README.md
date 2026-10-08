# Roblox map (Rojo)

Scripts live here as files; Rojo syncs them into Roblox Studio.

## One-time setup (on your PC)

1. Install [Rojo](https://rojo.space/docs/v7/getting-started/installation/) (the CLI plus the Studio plugin).
2. `git clone` this repo and check out the branch Claude pushed to.

## Each session

1. `cd roblox`
2. `rojo serve`
3. In Roblox Studio open a new Baseplate place, open the Rojo plugin and press **Connect**.
4. Press **Play**. `BuildMap.server.luau` builds the map.

When Claude pushes new changes: `git pull`, and Studio updates by itself while `rojo serve` is running.

## Layout

- `src/shared/MapConfig.luau`: size, colours and other numbers.
- `src/server/BuildMap.server.luau`: builds the map at startup.
