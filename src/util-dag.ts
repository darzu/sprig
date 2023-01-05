// directed-acyclic graph solver
export interface Dag {
  addRoot(r: number): void;
  addEdge(dependant: number, dependee: number): void;
  getWalk(): number[];
  version: number;
}

// DAG solver
export function createDag(): Dag {
  const solver: Dag = {
    addRoot,
    addEdge,
    getWalk,
    version: 1,
  };

  const roots = new Set<number>(); // top-level
  const edges = new Map<number, Set<number>>(); // key depends on values

  let lastWalkVersion = -1;
  let lastWalk: number[] = [];

  return solver;

  function addRoot(r: number) {
    if (roots.has(r)) return;
    roots.add(r);
    solver.version++;
  }
  function addEdge(a: number, b: number) {
    // a = dependant, b = dependee
    if (edges.has(a)) {
      let dependees = edges.get(a)!;
      if (dependees.has(b)) return;
      dependees.add(b);
    } else {
      edges.set(a, new Set<number>().add(b));
    }
    solver.version++;
  }
  function doTopologicalSort(): number[] {
    // TODO(@darzu): we might want a more stable sort, i recommend:
    //    determine longest depth from roots for each node
    //    sort within each depth-layer
    //    walk from farthest cohorts backward toward roots
    const walk: number[] = [];
    const want = new Set<number>();
    const done = new Set<number>();

    for (let r of roots) visit(r);

    return walk;

    // when visit returns, n will be done
    function visit(n: number) {
      if (done.has(n)) return;
      if (want.has(n)) throw "DAG cycle";
      want.add(n);
      for (let d of edges.get(n) ?? []) visit(d);
      done.add(n);
      walk.push(n);
      want.delete(n);
    }
  }
  function getWalk() {
    if (lastWalkVersion < solver.version) {
      lastWalk = doTopologicalSort();
      lastWalkVersion = solver.version;
    }
    return lastWalk;
  }
}
