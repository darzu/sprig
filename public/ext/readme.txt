To add a babylonjs module:
1. From babylon repo, from dist/ folder,
2. find the *.min.js and *.module.d.ts files you want
3. Copy to this ext/ folder and the src/ext/ folder
4. Rename so they're the same module .d.ts/.js (trim module and/or min)
5. add "<script src="./ext/babylonjs.loaders.js"></script>" to html
6. add "/// <reference path="./ext/babylonjs.loaders.d.ts"/>" to .ts


WebGPU types:
1. npm install @webgpu/types
2. copy node_modules/@webgpu/types/dist/index.d.ts to src/ext/global/webgpu-types.d.ts
3. ensure "src/ext/global" is in tsconfig typeRoots

gl-matrix:
1. npm install gl-matrix
2. copy out the .js and .d.ts, to public/ext/gl-matrix.js and src/ext/gl-matrix.d.ts
3. delete the wrapper and "exports.* = *" section at the end of the .js
4. include it as a <script ... type="module">
5. add "export " prefix where needed (e.g. "var mat4" => "export var4")
6. modify gl-matrix.d.ts to always assume Float32 arrays (see "// DZ Mod")
