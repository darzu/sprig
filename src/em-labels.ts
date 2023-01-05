import { ComponentDef } from "./entity-manager.js";
import { createDag } from "./util-dag.js";
import { never } from "./util.js";

export type Label = string;

/*
label constraints:
a resource can require a label
a label can specify being called before or after other labels
*/

// TODO(@darzu): There's some deep similarity between all this "requires", "provides" and
//    JS module "imports", "exports"; can we/should we leverage that?

// Resource and Systems dependencies and lifecycles:
//    can systems force resources into existance? Yes, in the query
//    can resources force resources into existance? Yes, in the init requirements
//    can resources force systems into existance? Yes, resource can require systems
//    can a game force a resource into existance? Yes, just await that resource
//    can a game force a system into existance? Yes, root-level system

export type RequireLabel = ["requires", Label];
export type ResourceRequiresLabel = [ComponentDef, "requires", Label];
export type LabelBeforeLabel = [Label, "before", Label];
export type LabelAfterLabel = [Label, "after", Label];
export type LabelConstraint =
  | RequireLabel
  | ResourceRequiresLabel
  | LabelBeforeLabel
  | LabelAfterLabel;

function isRequireLabel(c: LabelConstraint): c is RequireLabel {
  return c.length === 2 && c[0] === "requires";
}
function isResourceRequiresLabel(
  c: LabelConstraint
): c is ResourceRequiresLabel {
  return c.length === 3 && c[1] === "requires";
}
function isLabelBeforeLabel(c: LabelConstraint): c is LabelBeforeLabel {
  return c.length === 2 && c[1] === "before";
}
function isLabelAfterLabel(c: LabelConstraint): c is LabelAfterLabel {
  return c.length === 2 && c[1] === "after";
}

export interface LabelSolver {
  addResource(r: ComponentDef): void;
  addConstraint(c: LabelConstraint): void;
  getPlan(): Label[];
}

// DAG solver
// TODO(@darzu): generalize this for any DAG solving
export function createLabelSolver(): LabelSolver {
  const solver: LabelSolver = {
    addResource,
    addConstraint,
    getPlan,
  };

  // DAG for our dependencies
  const dag = createDag();

  // label<->idx bookkeeping for the dag
  let nextLblIdx = 1;
  const lblToIdx = new Map<Label, number>();
  const idxToLbl = new Map<number, Label>();

  let lastVersion = -1;
  let version = 1;
  let lastPlan: Label[] = [];

  // TODO(@darzu): rm
  // const req = new Set<Label>(); // top-level
  // const dep = new Map<Label, Set<Label>>(); // key depends on values

  // NOTE: since resources can come later than labels that depend on them
  //   we need some tracking for those
  const resources = new Set<string>(); // present resources
  const labelsWaitingOnResource = new Map<string, Label[]>();

  return solver;

  function getIdx(l: Label): number {
    let idx = lblToIdx.get(l);
    if (!idx) {
      idx = nextLblIdx;
      nextLblIdx += 1;
      lblToIdx.set(l, idx);
      idxToLbl.set(idx, l);
    }
    return idx;
  }
  function addResource(r: ComponentDef) {
    resources.add(r.name);
    const lbls = labelsWaitingOnResource.get(r.name);
    if (lbls) {
      labelsWaitingOnResource.delete(r.name);
      for (let l of lbls) dag.addRoot(getIdx(l));
    }
    version++;
  }
  function addConstraint(con: LabelConstraint) {
    if (isRequireLabel(con)) {
      const [_, label] = con;
      dag.addRoot(getIdx(label));
    } else if (isResourceRequiresLabel(con)) {
      const [resource, _, label] = con;
      if (resources.has(resource.name)) {
        dag.addRoot(getIdx(label));
      } else {
        // await the resource
        if (labelsWaitingOnResource.has(resource.name))
          labelsWaitingOnResource.get(resource.name)!.push(label);
        else labelsWaitingOnResource.set(resource.name, [label]);
      }
    } else if (isLabelAfterLabel(con)) {
      const [dependant, _, dependee] = con;
      dag.addEdge(getIdx(dependant), getIdx(dependee));
    } else if (isLabelBeforeLabel(con)) {
      const [dependee, _, dependant] = con;
      dag.addEdge(getIdx(dependant), getIdx(dependee));
    } else {
      never(con);
    }
    version++;
  }
  function getPlan(): Label[] {
    if (lastVersion < version) {
      lastPlan = dag.getWalk().map((idx) => idxToLbl.get(idx)!);
      lastVersion = version;
    }
    return lastPlan;
  }
}
