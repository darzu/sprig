import { Component, EM } from "../entity-manager.js";
import { onInit } from "../init.js";
import { assert } from "../test.js";
import { getText } from "../webget.js";

const DEFAULT_SHADER_PATH = "/shaders/";

export const ShaderPaths = [
  "std-mesh",
  "std-outline",
  "std-blur",
  "std-post",
  "xp-boid-render",
  "xp-boid-update",
  "xp-jump-flood",
  "xp-cloth-update",
] as const;

export type ShaderName = typeof ShaderPaths[number];

export interface Shader {
  code: string;
}

export type ShaderSet = { [P in ShaderName]: Shader };

const ShaderLoaderDef = EM.defineComponent("shaderLoader", () => {
  return {
    promise: null as Promise<ShaderSet> | null,
  };
});

export const ShadersDef = EM.defineComponent(
  "shaders",
  (shaders: ShaderSet) => shaders
);
export type Shaders = Component<typeof ShadersDef>;

async function loadShaders(): Promise<ShaderSet> {
  const codePromises = ShaderPaths.map((name) =>
    getText(`${DEFAULT_SHADER_PATH}${name}.wgsl`)
  );
  const codes = await Promise.all(codePromises);

  const set: Partial<ShaderSet> = {};

  for (let i = 0; i < ShaderPaths.length; i++) {
    set[ShaderPaths[i]] = {
      code: codes[i],
    };
  }

  return set as ShaderSet;
}

onInit((em) => {
  em.addSingletonComponent(ShaderLoaderDef);

  // start loading of shaders
  em.registerOneShotSystem([], [ShaderLoaderDef], (_, { shaderLoader }) => {
    assert(!shaderLoader.promise, "somehow we're double loading shaders");

    const shadersPromise = loadShaders();
    shaderLoader.promise = shadersPromise;
    shadersPromise.then(
      (result) => {
        em.addSingletonComponent(ShadersDef, result);
      },
      (failureReason) => {
        // TODO(@darzu): fail more gracefully
        throw `Failed to load shaders: ${failureReason}`;
      }
    );
  });
});
