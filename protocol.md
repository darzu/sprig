# Thoughts on reconnect

- Each player has a name ( : string)
  - Game prompts player for name on open, saved in localStorage
- On join, send name
- Host tracks map from name -> player ID
- When host receives a join from a new player: same as existing flow
  - Add new name -> player ID mapping
- When host receives join from existing player:
  - Claim / clear objects with that player's authority
  - Respond to join: here's your player ID, here's a list of entities you should claim
- On join response:
  - Connect to servers and start receiving syncs
  - If we have entities to claim, don't create anything (wait for entities to come in)
  - Otherwise, create player object

- Detect disconnect w/ hearbeat message
- Host never initiates reconnect, only players do
  - Host can still detect disconnect and claim objects early; needs to be an event
- Need a separate mechanism for changing hosts

# The Sprigland network protocol (OUT OF DATE)

The basic goal of the sprigland network protocol is to make sure that all
players approximately agree on the behavior of all objects at all times, while
avoiding excessive bandwidth consumption and hitting our framerate target. At a
very high level, the protocol works like this:

- The game state consists of a set of game objects. Each object has an globally
  unique, consistent identifier.
- Each player has *authority* over a set of game objects; at minimum, this set
  contains the object representing that player. Authority can be claimed over
  any object by any player, and conflicting claims are resolved arbitrarily but
  consistently.
- Each player sends out an update message to each other player at a constant
  rate (currently 20 per second, which is one every 3 frames). Each update
  message includes updates for a subset of the objects that player has authority
  over; these messages have a fixed maximum size (currently 1KB), into which we
  try to fit as many object updates as we can. These object updates have
  multiple types, depending on the state of the object and the receiving player.
- Incoming update messages are buffered and then applied at the same fixed
  constant rate. Each receiver tries to stay between `X` and `2X` (currently, 4
  and 8) update messages behind each sender, and will buffer or drop update
  messages in order to hit that target. Old update messages are always
  dropped. Receivers ack all update messages; these acks are used to determine
  which kinds of object updates can be sent to that receiver.
  
## Authority

Each object tracks two authority fields:

- `authority` is a player number. These numbers start with 0 for the host and go
  up, and are assigned to each player by the host on join.
- `authority_seq` is a sequence number.

In order to claim authority over an object, player `n` sets the object's
`authority` to `n` and increments its authority seq. It then starts sending
updates for that object; these updates always include the `authority` and
`authority_seq` numbers.

On the other side, a player accepts an update `u` for an object `o` if:

- `u.authority_seq` > `o.authority_seq` OR
- `u.authority_seq = o.authority_seq` AND `u.authority <= o.authority`

In other words, ties (which will arise when two players try to claim authority
over the same object without communicating in between) are broken towards
players who joined earlier, with the host always winning these conflicts.

If `u` is accepted, the receiver sets `o.authority = u.authority` and
`o.authority_seq = u.authority_seq`.

A player claimes authority by incrementing an object's `authority_seq` and
setting `authority` to its player ID. When to do so is part of game logic; as
often as possible, in order to minimize visual pops and other artefacts, players
should have authority over objects they are interacting with.

## Object update types

There are currently three object update types: full, dynamic, and creation. A
player will only send one of these types for a given object in a given update
message; which type it sends depends on the sender, the object, and the
receiver:

- A full object update includes *all* information about an object's
  state--enough to add the object to the scene if the receiver has never heard
  of it before. This type is sent when the sender isn't sure the receiver knows
  about the object.
- A dynamic object update includes only state that can change after object
  creation (for instance, current location). It's sent when the sender knows the
  receiver has heard of the object before (i.e., when an update message with
  that object has been acked).
- A "creation" object update is sent by an object's *creator* (as opposed to its
  current authority; this is the only object update sent by a player that
  doesn't claim authority over the object). These updates are identical to full
  updates, except that they are ignored if the receiver already has the
  object. Creation messages are necessary because the host can create objects
  that another player will have authority over (notably, player
  objects). Creation updates are *only* sent when the creator isn't the current
  authority; players with authority over an object always send full updates
  instead.
  
Each object knows how to serialize and deserialize itself fully (for full and
creation updates) and dynamically (for dynamic updates). Authority information
is included in all updates. Full and creation updates include an object type
identifier, which the receiver uses to initialize an object it hasn't heard of.

## Object update prioritization

In general, a player can't fit the state of every object it has authority over
into every update message. We want to try to include:
- Objects that the receiver might not know about at all
- Objects that the receiver hasn't heard about in a while
- Frequently-changing, important objects (e.g., the player object)

For each receiver, each sender maintains a `priority map` used to prioritize
objects for inclusion in update messages. This priority map is maintained across
update messages so that objects can "accumulate" priority over time. Before
sending an update message, the sender updates the priority of every object:
- Objects the receiver hasn't heard of get a large amount of priority (currently, 5000)
- Every object gets an amount of priority that depends on that object's type;
  for instance, the player object gets 10000 so that it is always included in
  updates
  
The list of objects the sender might send updates for (i.e., objects it claims
authority over plus objects it created that the receiver might not have heard
of) is then sorted in descending order by priority. The sender then fills an
update message with the largest prefix of this list that will fit; the exact
number of objects will then depend on both the types of objects in the list and
the types of object updates (full, dynamic, etc.) needed by the receiver.

Each object included in an update message gets its priority reset to 0. In this
way, priority accumulates on objects that haven't been sent in a long time,
guaranteeing that every object will eventually be included in an update message.

## Receiving object updates

Every 50ms, each player will process at most one update message from each other
player. We try to process these messages in lockstep, skipping old messages and
waiting until we see the sequence number we're looking for.

If we don't have an update message from a given sender, we'll go into "waiting
mode" for that sender. We won't process new updates from that sender until we've
reached our buffer target (currently 4). When we're processing updates, if we're
in waiting mode for a given sender and we've hit our buffer target, we'll exit
waiting mode and process the first (i.e., lowest sequence number) update we have
from that sender.

If we have buffered too many (currently 8) messages from a given sender, we're
behind and will catch up by dropping messages from the buffer (earliest first)
until we've hit our buffer target.

## Joining

When a player joins the game, it connects to the host and sends a join
message. In response, the host generates a player ID for the new player and
creates a player object with authority set to that ID. The host responds to the
new player with that ID (the player object will be synced separately in a
creation-type object update) and a list of the network addresses of the other
players in the game. The new player connects to each of these other players.

## Some low-level details

The protocol operates over WebRTC channels. Each player maintains two channels
with each other player: a reliable, unordered channel (created by setting the
`ordered` `RTCDataChannel` option to `false`) and an unreliable, unordered
channel (created by setting the `ordered` `RTCDataChannel` option to false and
the `maxRetransmits` option to 0). The reliable channel is currently only used
for join messages and join responses; the unreliable channel is used for update
messages and acks.

We serialize messages manually into `ArrayBuffer`s. Each message starts with a
one-byte type descriptor; its other contents depend on the message type. For
state updates, each object knows how to serialize and deserialize itself in
either full or dynamic mode.

## Current limitations

This is probably not an exhaustive list.

### Fine-grained state changes

There are only two object update types: full and dynamic. This means
that any object state that can change after creation must be included in every
dynamic update; otherwise, other players might not see these changes.

### Message size limitations

Every update message has to fit in 1KB (this size was chosen for maximum
throughput, as it is just under the MTU for most networks). If an object update
doesn't fit in this size, that object will *never* be synced to other
nodes. And, since the player object is included in most updates, the practical
size limit for objects that need to be synced promptly is actually less than
this.

### The death spiral

Every 50ms of simulation time, each player processes updates from other nodes
and then sends its own updates out. If a frame takes longer than 50 ms to
render, therefore, we will try to send multiple updates in a given frame. This
will slow that frame's render time, which may mean multiple updates need to be
sent next frame, which will slow that frame's render time, etc.

This may not be a problem in practice, since our target is for frames to take
only ~16ms to render.
