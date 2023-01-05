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
    throw "TODO!";
  }
  function getWalk() {
    if (lastWalkVersion < version) lastWalk = doTopologicalSort();
    lastWalkVersion = version;
    return lastWalk;
  }
}
