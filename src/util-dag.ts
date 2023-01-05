// directed-acyclic graph solver
interface Dag {
  addRoot(r: number): void;
  addEdge(dependant: number, dependee: number): void;
  getWalk(): number[];
}

// DAG solver
function createDag(): Dag {
  const solver: Dag = {
    addRoot,
    addEdge,
    getWalk,
  };

  const roots = new Set<number>(); // top-level
  const edges = new Map<number, Set<number>>(); // key depends on values

  let version = 1;
  let lastWalkVersion = -1;
  let lastWalk: number[] = [];

  return solver;

  function addRoot(r: number) {
    roots.add(r);
    version++;
  }
  function addEdge(a: number, b: number) {
    // a = dependant, b = dependee
    if (edges.has(a)) edges.get(a)!.add(b);
    else edges.set(a, new Set<number>().add(b));
    version++;
  }
  function doTopologicalSort(): number[] {
    const walk: number[] = [];
    const want = new Set<number>();
    const done = new Set<number>();

    for (let r of roots) visit(r);

    return walk;

    // when visit returns, n will be done
    function visit(n: number) {
      if (want.has(n)) throw "DAG cycle";
      want.add(n);
      for (let d of edges.get(n) ?? []) if (!done.has(d)) visit(d);
      done.add(n);
      walk.push(n);
      want.delete(n);
    }
  }
  function getWalk() {
    if (lastWalkVersion < version) lastWalk = doTopologicalSort();
    lastWalkVersion = version;
    return lastWalk;
  }
}
