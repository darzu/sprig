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
