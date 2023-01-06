// TODO(@darzu): UNUSED; was intended for existance-dependencies for systems/resources
export interface DisjointSet {
  // adds a new "id" in its own set
  add(id: number): void;
  // gets the set "id" is a member of
  get(id: number): Set<number>;
  // joins two sets based on any members "a" and "b"
  union(a: number, b: number): void;
}

export function createDisjointSet(): DisjointSet {
  const res = {
    add,
    get,
    union,
  };

  const idToSet = new Map<number, number>();
  const setToIds = new Map<number, Set<number>>();

  return res;

  function add(id: number) {
    idToSet.set(id, id);
    setToIds.set(id, new Set<number>().add(id));
  }
  function get(id: number): Set<number> {
    throw "todo";
  }
  function union(a: number, b: number) {
    // TODO(@darzu): also handle if a and b r new
    throw "todo";
  }
}
