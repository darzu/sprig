# sprig dev

## build

Ensure you have `tsc` (Typescript CLI) in your path.

```
tsc -w
```

## serve

```
cd public
python -m http.server 4321 # or any other static server
```

## Local assets (optional)

Original blender files etc. are stored with git LFS here https://github.com/darzu/sprig-assets.

Published assets are stored here https://github.com/darzu/assets. This repo has no git LFS and we need to keep it smaller than ~1gb forever or github might get mad at us.

For a good local dev workflow, symblink from darzu/assets repo root to sprig/public/assets/ or copy assets into public/assets/
E.g. (if u clone darzu/assets as assets-public):

```
ln -s ~/assets-public/ ~/sprig/public/assets
```

# Multiplayer

If you start a server in one browser window, the ID will be copied to your
clipboard (and also logged to the console). You can use that ID to connect in
another browser window.
