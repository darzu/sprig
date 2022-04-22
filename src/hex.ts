/*
plane at q + r + s = 0
each hex is a cube in 3d
  cubes are connected by edges
  you move diagonly, always two coordinates change together
for axial, s = -q-r

IMPL NOTES:
  We're gonna use sparse storage since most coordinates will be empty

could do class w/ generic data stored at hex
or each tile could give an id which we can use elsewhere
like IdPair w/ negatives should work fine
or we just increment ids

hmm could we restrict outselves to positive q/r only?
  nah, too restrictive
*/

function addTile(q: number, r: number) {
  // TODO(@darzu):
}
