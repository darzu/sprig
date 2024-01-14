import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { T } from "./objects.js";

// TODO(@darzu): experimenting
function O_def(...a: any[]): any {}
function O_comp(...a: any[]): any {}
function O_mk(...a: any[]): any {}
function O_curry(...a: any[]): any {}

function testObjectTS2() {
  const CannonObj = O_def("cannon", PositionDef);

  const SailableDef = O_comp({ sailable: T<{ sailSpeed: number }>() });

  const CargoObj = O_def(ColorDef, ScaleDef);

  const ShipObj = O_def(
    { ship2: T<{ myProp: number }>() },
    { position: PositionDef },
    RenderableConstructDef,
    SailableDef,
    {
      child: {
        mast: [
          "mast2",
          ScaleDef,
          {
            child: {
              sail: [RotationDef],
            },
          },
        ],
        cannonL: CannonObj,
        cannonR: CannonObj,
        gem: O_def(ColorDef, PositionDef),
        cargo: CargoObj,
        rudder: [PositionDef, RotationDef],
      },
    }
  );

  const Ship2Obj = ShipObj.curry({
    position: [0, 1, 1],
    sailable: () => ({ sailSpeed: 4 }),
  });

  const rudder = O_mk(
    [PositionDef, RotationDef] as const,
    [1, 1, 1],
    undefined
  );

  console.log("testObjectTS2".toUpperCase());
  console.dir(ShipObj);
  console.dir(Ship2Obj);

  const cargo = CargoObj.new(ENDESGA16.midBrown, [2, 2, 2]);

  const ship = ShipObj.new(
    {
      // positional
      myProp: 7,
    },
    {
      renderableConstruct: [CubeMesh],
      child: {
        mast: {
          scale: V(1, 1, 1),
          child: {
            sail: [undefined],
          },
        },
        cannonL: {
          position: V(1, 0, 0),
        },
        cannonR: [V(1, 0, 0)],
        gem: [ENDESGA16.blue, V(1, 1, 1)],
        rudder: rudder,
        cargo,
      },
    }
  );
  console.dir(ship);

  ship.ship2.myProp = 8;
  ship.position;
  // const cl = ship.ship["cannonL"];
  const cl = ship.ship2.cannonL;
  const se = ship.ship2.mast.mast2.sail;
  const mp: quat = se.rotation;

  const cannonLPos: vec3 = ship.ship2.cannonL.position;
  const rudderPos: vec3 = ship.ship2.rudder.position;
  ship.ship2.rudder.rotation;
}
