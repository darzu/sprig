/*
ECS:
  https://ecsy.io/docs/#/
  https://ecsy.io/docs/#/manual/Architecture?id=queries
  https://github.com/ecsyjs/ecsy-three
  https://github.com/kaliber5/ecsy-babylon

Union -> Tuple:
  https://github.com/microsoft/TypeScript/issues/13298#issuecomment-468114901
  https://github.com/microsoft/TypeScript/issues/13298#issuecomment-468888651

Fixed length tuple:
  https://github.com/microsoft/TypeScript/issues/26223#issuecomment-410733998

Recursive conditional types:
  https://github.com/microsoft/TypeScript/pull/40002

Example from Mozilla ECSY:
  // MovableSystem
  class MovableSystem extends System {
    // This method will get called on every frame by default
    execute(delta, time) {
      // Iterate through all the entities on the query
      this.queries.moving.results.forEach(entity => {
        var velocity = entity.getComponent(Velocity);
        var position = entity.getMutableComponent(Position);
        position.x += velocity.x * delta;
        position.y += velocity.y * delta;

        if (position.x > canvasWidth + SHAPE_HALF_SIZE) position.x = - SHAPE_HALF_SIZE;
        if (position.x < - SHAPE_HALF_SIZE) position.x = canvasWidth + SHAPE_HALF_SIZE;
        if (position.y > canvasHeight + SHAPE_HALF_SIZE) position.y = - SHAPE_HALF_SIZE;
        if (position.y < - SHAPE_HALF_SIZE) position.y = canvasHeight + SHAPE_HALF_SIZE;
      });
    }
  }

  // Define a query of entities that have "Velocity" and "Position" components
  MovableSystem.queries = {
    moving: {
      components: [Velocity, Position]
    }
  }
*/

type Intersect<A> = A extends [infer X, ...infer Y] ? X & Intersect<Y> : {}
type Union<A> = A extends [infer X, ...infer Y] ? X | Union<Y> : never
type MapTuple<A extends any[], B> = { [P in keyof A]: B }

// TODO(@darzu): consider using a non recursive definition for performance
type TupleN<T, N extends number> = N extends N ? number extends N ? T[] : _TupleN<T, N, []> : never;
type _TupleN<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleN<T, N, [T, ...R]>;

interface Entity {
  id: number,
}
interface Relation<K extends string, L extends number, V> {
  key: K,
  arity: L,
  has: (...es: TupleN<Entity, L>) => boolean,
  get: (...es: TupleN<Entity, L>) => V | null,
  set: (v: V, ...es: TupleN<Entity, L>) => void,
  del: (...es: TupleN<Entity, L>) => void,
  members: () => [...TupleN<Entity, L>, V][],
}

type RelationResult<R> = R extends Relation<infer K, infer L, infer V> ? { [P in K]: V } : never;

function BuildUnaryRelation<V>(): <K extends string>(k: K) => Relation<K, 1, V> {
  return (key) => {
    const storage: [Entity, V][] = []

    const has = (e: Entity) => e.id in storage
    const get = (e: Entity) => storage[e.id][1]
    const set = (v: V, e: Entity) => storage[e.id] = [e, v]
    const members = () => storage
    const del = (e: Entity) => delete storage[e.id]

    return {
      key,
      arity: 1,
      has,
      get,
      set,
      del,
      members
    }
  }
}
function BuildBinaryRelation<V>(): <K extends string>(k: K) => Relation<K, 2, V> {
  return (key) => {
    const storage: [Entity, Entity, V][] = []
    const idToIndices: number[][] = []

    function* allMatches(a: number[], b: number[]): Generator<number> {
      const bMap: { [key: number]: true } = {}
      b.forEach(i => bMap[i] = true)
      for (let i of a)
        if (bMap[i])
          yield i
    }
    function firstMatch(a: number[], b: number[]): number | null {
      for (let i of allMatches(a, b))
        return i;
      return null;
    }

    const getIdx = (e1: Entity, e2: Entity) => {
      const e1Ids = idToIndices[e1.id]
      const e2Ids = idToIndices[e2.id]
      const id = firstMatch(e1Ids, e2Ids)
      return id
    }

    const has = (e1: Entity, e2: Entity) => {
      return getIdx(e1, e2) !== null;
    }

    const get = (e1: Entity, e2: Entity) => {
      const idx = getIdx(e1, e2);
      if (idx === null)
        return null;
      return storage[idx][2];
    }
    const set = (v: V, e1: Entity, e2: Entity) => {
      const idx = getIdx(e1, e2) ?? storage.length

      storage[idx] = [e1, e2, v];
    }
    const members = () => {
      return storage
    }
    const del = (e1: Entity, e2: Entity) => {
      const e1Ids = idToIndices[e1.id]
      const e2Ids = idToIndices[e2.id]
      let idsToRemove: number[] = [];
      for (let id of allMatches(e1Ids, e2Ids)) {
        idsToRemove.push(id)
      }
      for (let id of idsToRemove) {
        e1Ids.splice(e1Ids.indexOf(id))
        e2Ids.splice(e2Ids.indexOf(id))
        delete storage[id]
      }
    }

    return {
      key,
      arity: 2,
      has,
      get,
      set,
      del,
      members
    }
  }
}
interface Atom<K extends string = string, V = any, L extends number = number, TS extends TupleN<string, L> = TupleN<string, L>> {
  // TODO(@darzu): define
  terms: TS,
  relation: Relation<K, L, V>
}

type AtomFn = (...args: any[]) => Atom;

function MakeAtomFn<K extends string, V, L extends number>(relation: Relation<K, L, V>)
  : (<TS extends TupleN<string, L>>(...ts: TS) => Atom<K, V, L, TS>) {
  return (...terms) => ({
    terms,
    relation
  })
}
function DefineComponent<K extends string, V, L extends number>(relation: Relation<K, L, V>)
  : (<TS extends TupleN<string, L>>(...ts: TS) => Atom<K, V, L, TS>) & { relation: Relation<K, L, V> } {
  const res = MakeAtomFn(relation);
  return Object.assign(res, { relation })
}

function With<T extends string, QFS extends AtomFn[]>(a: T, ...q: QFS)
  : { [P in keyof QFS]: QFS[P] extends ((a: T) => Atom<infer K, infer V, 1, [T]>) ? Atom<K, V, 1, [T]> : never } {
  // TODO(@darzu): do this without cast?
  return q.map(fn => fn(a)) as any
}

type AtomTerms<A> = A extends Atom<any, any, infer TS> ? Union<TS> : never;
type AtomValue<A> = A extends Atom<any, infer V, any> ? V : never;
type AtomKey<A> = A extends Atom<infer K, any, any> ? K : never;
type AtomResult<A> = A extends Atom<infer K, infer V, infer L, infer TS>
  ? { [P in TS[number]]: { [P2 in K]: V } }
  : never

type System<QUERY extends Atom[]> = (a: Intersect<{ [P in keyof QUERY]: AtomResult<QUERY[P]> }>) => void

function When<Q extends Atom[]>(
  query: [...Q],
  cb: System<Q>
) {
  // TODO: impl
}

// TESTS

{

  const Colliding = DefineComponent(BuildBinaryRelation<number>()("colliding"))
  const Player = DefineComponent(BuildUnaryRelation<true>()("player"))
  const Pizza = DefineComponent(BuildUnaryRelation<true>()("pizza"))
  const Position = DefineComponent(BuildUnaryRelation<number>()("position"))
  const Velocity = DefineComponent(BuildUnaryRelation<number>()("velocity"))

  const Sprite = [Position, Velocity] as const

  When([
    Colliding("x", "y"),
    // ...With("y", Pizza, Position),
    ...With("x", Player, ...Sprite),
    Pizza("y"),
    // Player("x"),
    Position("y"),
    // Food("y"),
  ], ({ x, y }) => {
    console.log(x.colliding)
    console.log(y.colliding)
    console.log(y.pizza)
    console.log(y.position)
    console.log(x.velocity)
    // console.log(y.food)
  });

  const EgColliding = Colliding("z", "w");

  type EgColldingResult = AtomResult<typeof EgColliding>
  type EgColldingTerms = AtomTerms<typeof EgColliding>
  type EgColldingKey = AtomKey<typeof EgColliding>
  type EgColldingValue = AtomValue<typeof EgColliding>
  type EgPlayerResult = AtomResult<Atom<"player", 2 | 3, 1, ["y"]>>

  type EgMapTuple = MapTuple<[number, string], boolean>

}