import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { T } from "./objects.js";

/*
No positionality when creating ?

OH NO! Are positional args allowed? how to tell vs named component?
Could have a precedent: first position match, then object match
   this doesn't work so well for term-level stuff (works at type-level probably, so w/ compiler help)

Do we need positional creation? Maybe object-style is always easier?

Wait, how do we query these things? .child isn't a component, and if it is they all look different
  Do we track "objects" seperately? Can we check if an entity is an object ShipObj.is(myEnt) ?
  This works fine if objects have a mandatory new props component
Or maybe just a mandatory tag or props
  You're not allowed to construct the tag w/o having children
  Can then still show .child relation

Or maybe we do a more complete Sander's style relation-y ECS
  Sander uses id pairs to uniquely identify has-instance-of-(component, entity) relationships
    so .child would have and id and .child.mast would be (child component ID) merged-w/ (mast entity ID)

What about cases like manning/unmanning a turret? There we're using entity ids
  it's an optional relation, changes at runtime

What about:
  objects are tracked w/ their definition
  you can only access their relationships using a query on that object

Will we ever create an object w/ children and not want to tag it?
  easiest way to impl for now; mandatory tag

Or create auto child_478 components for ea unique child type

Right now, everything about an entity is tracked by its components. Probably worth not
  breaking that

How doe we specify things like physicsParent ?
And things like net-entity helper stuff?

certain components -> certain relations
  object "tag"

need to answer all of:
  how things are defined
    set of attributes, one can depend on another
    at type level, order of presedent of object keys, 
      next allowed is custom props
  how things are created
    parse looking for known names like "child", "pool", etc
      then for needed components
  how things are stored
    obj defs are totally custom, whatever they need to be
    obj ents are entirely components?
      that's how things work now
      hardest one is .child ...
        1. could reserve a bunch of component-like names for "child", "childOf", etc
        for now, no way to query relationships except w/ obj queries
        EntityWR<ChildRel, "mast", [Pos, Rot]>
        2. or .child is special. It's pre-fab-y.
  how things are queried

attributes
  ComponentDef
  inline comp definition
  inline tag
  child(s) [req tag/prop attribute]
  multiplayer options
  entity pool options

*/

// TODO(@darzu): experimenting
function O_def(...a: any[]): any {}
function O_comp(...a: any[]): any {}
function O_mk(...a: any[]): any {}
function O_curry(...a: any[]): any {}

function testObjectTS2() {
  // defines an object w/ 2 components
  const CannonObj = O_def(
    "cannon", // defines a new tag component
    PositionDef
  );

  // defines a component "sailable"
  const SailableDef = O_comp({ sailable: T<{ sailSpeed: number }>() });

  // defines an object w/ 2 components
  const CargoObj = O_def(ColorDef, ScaleDef);

  const ShipObj = O_def(
    { ship2: T<{ myProp: number }>() }, // defines a component
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
    // positional argument
    {
      myProp: 7,
    },
    {
      // named component argument
      renderableConstruct: [CubeMesh],
      // special "child" parameter
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
