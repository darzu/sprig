/* TODO: add "versioning" of objects. 
Right now we have two types of state updates: full and dynamic. 
A full update is only guaranteed to happen once, on object creation; 
we track which nodes have seen each object and try to only sync each 
object fully once. We could instead track which nodes have seen which 
*version* of each object; we could then trigger a full sync again by 
bumping a version number. We could use this for properties that change 
infrequently.

For objects with so much state that doing a full sync even infrequently is
cost-prohibitive (player objects?), could also imagine a change log. Can use
versions for this, too--a log entry is associated with a version and we sync
nodes all log entries we think they might not have seen.

For both of these, should use typescript's getters and setters to make sure
everything gets updated in the right place.
 */

// claimAuthority(
//   authority: number,
//   authority_seq: number,
//   snap_seq: number
// ): boolean {
//   if (
//     snap_seq >= this.snap_seq &&
//     (this.authority_seq < authority_seq ||
//       (this.authority_seq == authority_seq && authority <= this.authority))
//   ) {
//     this.authority = authority;
//     this.authority_seq = authority_seq;
//     this.snap_seq = snap_seq;
//     return true;
//   }
//   return false;
// }

// // By default, simulate ballistic motion. Subclasses can override
// simulate(dt: number) {
//   //console.log(`simulating forward ${dt} ms`);
//   const working_vec3 = tempVec();
//   vec3.scale(working_vec3, this.motion.linearVelocity, dt);
//   vec3.add(this.motion.location, this.motion.location, working_vec3);

//   let axis = vec3.normalize(working_vec3, this.motion.angularVelocity);
//   let angle = vec3.length(this.motion.angularVelocity) * dt;
//   let deltaRotation = quat.setAxisAngle(tempQuat(), axis, angle);
//   quat.normalize(deltaRotation, deltaRotation);
//   quat.multiply(this.motion.rotation, deltaRotation, this.motion.rotation);
//   quat.normalize(this.motion.rotation, this.motion.rotation);
// }

// interface GameEvent {
//   type: number;
//   id: number;
//   objects: number[];
//   authority: number;
//   location: vec3 | null;
// }

// recordEvent(type: number, objects: number[], location?: vec3 | null) {
//   if (!location) location = null;
//   // return; // TODO(@darzu): TO DEBUG this fn is costing a ton of memory
//   let objs = objects.map((id) => this._objects.get(id)!);
//   // check to see whether we're the authority for this event
//   if (this.eventAuthority(type, objs) == this.me) {
//     // TODO(@darzu): DEBUGGING
//     // console.log(`Recording event type=${type}`);
//     let id = this.newId();
//     let event = { id, type, objects, authority: this.me, location };
//     if (!this.legalEvent(event)) {
//       throw "Ilegal event in recordEvent--game logic should prevent this";
//     }
//     this.requestedEvents.push(event);
//   }
// }

// enum ObjectType {
//   Plane,
//   Player,
//   Bullet,
//   Boat,
//   Hat,
//   Ship,
// }

// enum EventType {
//   BulletBulletCollision,
//   BulletPlayerCollision,
//   HatGet,
//   HatDrop,
// }