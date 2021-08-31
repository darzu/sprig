To add a babylonjs module:
1. From babylon repo, from dist/ folder,
2. find the *.min.js and *.module.d.ts files you want
3. Copy to this ext/ folder and the src/ext/ folder
4. Rename so they're the same module .d.ts/.js (trim module and/or min)
5. add "<script src="./ext/babylonjs.loaders.js"></script>" to html
6. add "/// <reference path="./ext/babylonjs.loaders.d.ts"/>" to .ts