# sprig

Clone sprig-assets as well, or copy contents from sprig.land/sprig-assets/.
symlink to sprig-assets/docs/ to public/sprig-assets/ or copy assets into public/sprig-assets/
E.g.:
```
ln -s ~/sprig-assets/docs ~/sprig/public/sprig-assets
```

```
cd public
python -m SimpleHTTPServer 4321 # or any other static server
```

Ensure you have `tsc` (Typescript CLI) in your path.
```
tsc -w
```

# Multiplayer
If you start a server in one browser window, the ID will be copied to your
clipboard (and also logged to the console). You can use that ID to connect in
another browser window.

