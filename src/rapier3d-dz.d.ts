/**
 * The CCD solver responsible for resolving Continuous Collision Detection.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `ccdSolver.free()`
 * once you are done using it.
 */
export class CCDSolver {
  raw: RawCCDSolver;
  /**
   * Release the WASM memory occupied by this narrow-phase.
   */
  free(): void;
  constructor(raw?: RawCCDSolver);
}

/**
 * A rule applied to combine coefficients.
 *
 * Use this when configuring the `ColliderDesc` to specify
 * how friction and restitution coefficient should be combined
 * in a contact.
 */
export enum CoefficientCombineRule {
  Average = 0,
  Min = 1,
  Multiply = 2,
  Max = 3
}

export class IntegrationParameters {
  raw: RawIntegrationParameters;
  constructor(raw?: RawIntegrationParameters);
  /**
   * Free the WASM memory used by these integration parameters.
   */
  free(): void;
  /**
   * The timestep length (default: `1.0 / 60.0`)
   */
  get dt(): number;
  /**
   * The Error Reduction Parameter in `[0, 1]` is the proportion of
   * the positional error to be corrected at each time step (default: `0.2`).
   */
  get erp(): number;
  /**
   * The Error Reduction Parameter for joints in `[0, 1]` is the proportion of
   * the positional error to be corrected at each time step (default: `0.2`).
   */
  get jointErp(): number;
  /**
   * Each cached impulse are multiplied by this coefficient in `[0, 1]`
   * when they are re-used to initialize the solver (default `1.0`).
   */
  get warmstartCoeff(): number;
  /**
   * Amount of penetration the engine wont attempt to correct (default: `0.001m`).
   */
  get allowedLinearError(): number;
  /**
   * The maximal distance separating two objects that will generate predictive contacts (default: `0.002`).
   */
  get predictionDistance(): number;
  /**
   * Amount of angular drift of joint limits the engine wont
   * attempt to correct (default: `0.001rad`).
   */
  get allowedAngularError(): number;
  /**
   * Maximum linear correction during one step of the non-linear position solver (default: `0.2`).
   */
  get maxLinearCorrection(): number;
  /**
   * Maximum angular correction during one step of the non-linear position solver (default: `0.2`).
   */
  get maxAngularCorrection(): number;
  /**
   * Maximum number of iterations performed by the velocity constraints solver (default: `4`).
   */
  get maxVelocityIterations(): number;
  /**
   * Maximum number of iterations performed by the position-based constraints solver (default: `1`).
   */
  get maxPositionIterations(): number;
  /**
   * Minimum number of dynamic bodies in each active island (default: `128`).
   */
  get minIslandSize(): number;
  /**
   * Maximum number of substeps performed by the  solver (default: `1`).
   */
  get maxCcdSubsteps(): number;
  set dt(value: number);
  set erp(value: number);
  set jointErp(value: number);
  set warmstartCoeff(value: number);
  set allowedLinearError(value: number);
  set predictionDistance(value: number);
  set allowedAngularError(value: number);
  set maxLinearCorrection(value: number);
  set maxAngularCorrection(value: number);
  set maxVelocityIterations(value: number);
  set maxPositionIterations(value: number);
  set minIslandSize(value: number);
  set maxCcdSubsteps(value: number);
}

/**
 * The CCD solver responsible for resolving Continuous Collision Detection.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `ccdSolver.free()`
 * once you are done using it.
 */
export class IslandManager {
  raw: RawIslandManager;
  /**
   * Release the WASM memory occupied by this narrow-phase.
   */
  free(): void;
  constructor(raw?: RawIslandManager);
  /**
   * Applies the given closure to the handle of each active rigid-bodies contained by this set.
   *
   * A rigid-body is active if it is not sleeping, i.e., if it moved recently.
   *
   * @param f - The closure to apply.
   */
  forEachActiveRigidBodyHandle(f: (handle: RigidBodyHandle) => void): void;
}

/**
 * The integer identifier of a collider added to a `ColliderSet`.
 */
export type JointHandle = number;
/**
 * An enum grouping all possible types of joints:
 * - `Ball`: A Ball joint that removes all relative linear degrees of freedom between the affected bodies.
 * - `Fixed`: A fixed joint that removes all relative degrees of freedom between the affected bodies.
 * - `Prismatic`: A prismatic joint that removes all degrees of freedom between the affected
 *                bodies except for the translation along one axis.
 * - `Revolute`: (3D only) A revolute joint that removes all degrees of freedom between the affected
 *               bodies except for the rotation along one axis.
 */
export enum JointType {
  Ball = 0,
  Fixed = 1,
  Prismatic = 2,
  Revolute = 3
}
export enum SpringModel {
  Disabled = 0,
  VelocityBased = 1,
  AccelerationBased = 2,
  ForceBased = 3
}
export class Joint {
  protected rawSet: RawJointSet;
  handle: JointHandle;
  constructor(rawSet: RawJointSet, handle: JointHandle);
  /**
   * Checks if this joint is still valid (i.e. that it has
   * not been deleted from the joint set yet).
   */
  isValid(): boolean;
  /**
   * The unique integer identifier of the first rigid-body this joint it attached to.
   */
  bodyHandle1(): RigidBodyHandle;
  /**
   * The unique integer identifier of the second rigid-body this joint is attached to.
   */
  bodyHandle2(): RigidBodyHandle;
  /**
   * The type of this joint given as a string.
   */
  type(): JointType;
  /**
   * The rotation quaternion that aligns this joint's first local axis to the `x` axis.
   */
  frameX1(): Rotation;
  /**
   * The rotation matrix that aligns this joint's second local axis to the `x` axis.
   */
  frameX2(): Rotation;
  /**
   * The position of the first anchor of this joint.
   *
   * The first anchor gives the position of the points application point on the
   * local frame of the first rigid-body it is attached to.
   */
  anchor1(): Vector;
  /**
   * The position of the second anchor of this joint.
   *
   * The second anchor gives the position of the points application point on the
   * local frame of the second rigid-body it is attached to.
   */
  anchor2(): Vector;
  /**
   * The first axis of this joint, if any.
   *
   * For joints where an application axis makes sense (e.g. the revolute and prismatic joins),
   * this returns the application axis on the first rigid-body this joint is attached to, expressed
   * in the local-space of this first rigid-body.
   */
  axis1(): Vector;
  /**
   * The second axis of this joint, if any.
   *
   * For joints where an application axis makes sense (e.g. the revolute and prismatic joins),
   * this returns the application axis on the second rigid-body this joint is attached to, expressed
   * in the local-space of this second rigid-body.
   */
  axis2(): Vector;
}
export class UnitJoint extends Joint {
  /**
   * Are the limits enabled for this joint?
   */
  limitsEnabled(): boolean;
  /**
   * The min limit of this joint.
   */
  limitsMin(): number;
  /**
   * The max limit of this joint.
   */
  limitsMax(): number;
  configureMotorModel(model: SpringModel): void;
  configureMotorVelocity(targetVel: number, factor: number): void;
  configureMotorPosition(targetPos: number, stiffness: number, damping: number): void;
  configureMotor(targetPos: number, targetVel: number, stiffness: number, damping: number): void;
}
export class FixedJoint extends Joint {
}
export class PrismaticJoint extends UnitJoint {
}
export class BallJoint extends Joint {
  configureMotorModel(model: SpringModel): void;
  configureMotorVelocity(targetVel: Vector, factor: number): void;
  configureMotorPosition(targetPos: Quaternion, stiffness: number, damping: number): void;
  configureMotor(targetPos: Quaternion, targetVel: Vector, stiffness: number, damping: number): void;
}
export class RevoluteJoint extends UnitJoint {
}
export class JointParams {
  anchor1: Vector;
  anchor2: Vector;
  axis1: Vector;
  axis2: Vector;
  tangent1: Vector;
  tangent2: Vector;
  frame1: Rotation;
  frame2: Rotation;
  jointType: JointType;
  limitsEnabled: boolean;
  limits: Array<number>;
  private constructor();
  /**
   * Create a new joint descriptor that builds Ball joints.
   *
   * A ball joints allows three relative rotational degrees of freedom
   * by preventing any relative translation between the anchors of the
   * two attached rigid-bodies.
   *
   * @param anchor1 - Point where the joint is attached on the first rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param anchor2 - Point where the joint is attached on the second rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   */
  static ball(anchor1: Vector, anchor2: Vector): JointParams;
  /**
   * Creates a new joint descriptor that builds a Fixed joint.
   *
   * A fixed joint removes all the degrees of freedom between the affected bodies, ensuring their
   * anchor and local frames coincide in world-space.
   *
   * @param anchor1 - Point where the joint is attached on the first rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param frame1 - The reference orientation of the joint wrt. the first rigid-body.
   * @param anchor2 - Point where the joint is attached on the second rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param frame2 - The reference orientation of the joint wrt. the second rigid-body.
   */
  static fixed(anchor1: Vector, frame1: Rotation, anchor2: Vector, frame2: Rotation): JointParams;
  /**
   * Creates a new joint descriptor that builds a Prismatic joint.
   *
   * A prismatic joint removes all the degrees of freedom between the
   * affected bodies, except for the translation along one axis.
   *
   * @param anchor1 - Point where the joint is attached on the first rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param axis1 - Axis of the joint, expressed in the local-space of the first rigid-body it is attached to.
   * @param tangent1 - A vector orthogonal to `axis1`. It is used to compute a basis orthonormal
   *                   to the joint's axis. If this tangent is set to the zero vector, the orthonormal
   *                   basis will be automatically computed arbitrarily.
   * @param anchor2 - Point where the joint is attached on the second rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param axis2 - Axis of the joint, expressed in the local-space of the second rigid-body it is attached to.
   * @param tangent2 - A vector orthogonal to `axis2`. It is used to compute a basis orthonormal
   *                   to the joint's axis. If this tangent is set to the zero vector, the orthonormal
   *                   basis will be automatically computed arbitrarily.
   */
  static prismatic(anchor1: Vector, axis1: Vector, tangent1: Vector, anchor2: Vector, axis2: Vector, tangent2: Vector): JointParams;
  /**
   * Create a new joint descriptor that builds Revolute joints.
   *
   * A revolute joint removes all degrees of freedom between the affected
   * bodies except for the rotation along one axis.
   *
   * @param anchor1 - Point where the joint is attached on the first rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param axis1 - Axis of the joint, expressed in the local-space of the first rigid-body it is attached to.
   * @param anchor2 - Point where the joint is attached on the second rigid-body affected by this joint. Expressed in the
   *                  local-space of the rigid-body.
   * @param axis2 - Axis of the joint, expressed in the local-space of the second rigid-body it is attached to.
   */
  static revolute(anchor1: Vector, axis1: Vector, anchor2: Vector, axis2: Vector): JointParams;
  intoRaw(): RawJointParams;
}

/**
 * A set of joints.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `jointSet.free()`
 * once you are done using it (and all the joints it created).
 */
export class JointSet {
  raw: RawJointSet;
  /**
   * Release the WASM memory occupied by this joint set.
   */
  free(): void;
  constructor(raw?: RawJointSet);
  /**
   * Creates a new joint and return its integer handle.
   *
   * @param bodies - The set of rigid-bodies containing the bodies the joint is attached to.
   * @param desc - The joint's parameters.
   * @param parent1 - The handle of the first rigid-body this joint is attached to.
   * @param parent2 - The handle of the second rigid-body this joint is attached to.
   */
  createJoint(bodies: RigidBodySet, desc: JointParams, parent1: number, parent2: number): number;
  /**
   * Remove a joint from this set.
   *
   * @param handle - The integer handle of the joint.
   * @param bodies - The set of rigid-bodies containing the rigid-bodies attached by the removed joint.
   * @param wake_up - If `true`, the rigid-bodies attached by the removed joint will be woken-up automatically.
   */
  remove(handle: JointHandle, islands: IslandManager, bodies: RigidBodySet, wake_up: boolean): void;
  /**
   * The number of joints on this set.
   */
  len(): number;
  /**
   * Does this set contain a joint with the given handle?
   *
   * @param handle - The joint handle to check.
   */
  contains(handle: JointHandle): boolean;
  /**
   * Gets the joint with the given handle.
   *
   * Returns `null` if no joint with the specified handle exists.
   * Note that two distinct calls with the same `handle` will return two
   * different JavaScript objects that both represent the same joint.
   *
   * @param handle - The integer handle of the joint to retrieve.
   */
  get(handle: JointHandle): Joint;
  /**
   * Applies the given closure to each joints contained by this set.
   *
   * @param f - The closure to apply.
   */
  forEachJoint(f: (handle: Joint) => void): void;
  /**
   * Applies the given closure to the handle of each joints contained by this set.
   *
   * @param f - The closure to apply.
   */
  forEachJointHandle(f: (handle: JointHandle) => void): void;
}

/**
 * The integer identifier of a collider added to a `ColliderSet`.
 */
export type RigidBodyHandle = number;
/**
 * The simulation status of a rigid-body.
 */
export enum RigidBodyType {
  /**
   * A `RigidBodyType::Dynamic` body can be affected by all external forces.
   */
  Dynamic = 0,
  /**
   * A `RigidBodyType::Static` body cannot be affected by external forces.
   */
  Static = 1,
  /**
   * A `RigidBodyType::KinematicPositionBased` body cannot be affected by any external forces but can be controlled
   * by the user at the position level while keeping realistic one-way interaction with dynamic bodies.
   *
   * One-way interaction means that a kinematic body can push a dynamic body, but a kinematic body
   * cannot be pushed by anything. In other words, the trajectory of a kinematic body can only be
   * modified by the user and is independent from any contact or joint it is involved in.
   */
  KinematicPositionBased = 2,
  /**
   * A `RigidBodyType::KinematicVelocityBased` body cannot be affected by any external forces but can be controlled
   * by the user at the velocity level while keeping realistic one-way interaction with dynamic bodies.
   *
   * One-way interaction means that a kinematic body can push a dynamic body, but a kinematic body
   * cannot be pushed by anything. In other words, the trajectory of a kinematic body can only be
   * modified by the user and is independent from any contact or joint it is involved in.
   */
  KinematicVelocityBased = 3
}
/**
 * A rigid-body.
 */
export class RigidBody {
  private rawSet;
  readonly handle: RigidBodyHandle;
  constructor(rawSet: RawRigidBodySet, handle: RigidBodyHandle);
  /**
   * Checks if this rigid-body is still valid (i.e. that it has
   * not been deleted from the rigid-body set yet.
   */
  isValid(): boolean;
  /**
   * Locks or unlocks the ability of this rigid-body to translate.
   *
   * @param locked - If `true`, this rigid-body will no longer translate due to forces and impulses.
   * @param wakeUp - If `true`, this rigid-body will be automatically awaken if it is currently asleep.
   */
  lockTranslations(locked: boolean, wakeUp: boolean): void;
  /**
   * Locks or unlocks the ability of this rigid-body to rotate.
   *
   * @param locked - If `true`, this rigid-body will no longer rotate due to torques and impulses.
   * @param wakeUp - If `true`, this rigid-body will be automatically awaken if it is currently asleep.
   */
  lockRotations(locked: boolean, wakeUp: boolean): void;
  /**
   * Locks or unlocks the ability of this rigid-body to rotate along individual coordinate axes.
   *
   * @param enableX - If `false`, this rigid-body will no longer rotate due to torques and impulses, along the X coordinate axis.
   * @param enableY - If `false`, this rigid-body will no longer rotate due to torques and impulses, along the Y coordinate axis.
   * @param enableZ - If `false`, this rigid-body will no longer rotate due to torques and impulses, along the Z coordinate axis.
   * @param wakeUp - If `true`, this rigid-body will be automatically awaken if it is currently asleep.
   */
  restrictRotations(enableX: boolean, enableY: boolean, enableZ: boolean, wakeUp: boolean): void;
  /**
   * The dominance group, in [-127, +127] this rigid-body is part of.
   */
  dominanceGroup(): number;
  /**
   * Sets the dominance group of this rigid-body.
   *
   * @param group - The dominance group of this rigid-body. Must be a signed integer in the range [-127, +127].
   */
  setDominanceGroup(group: number): void;
  /**
   * Enable or disable CCD (Continuous Collision Detection) for this rigid-body.
   *
   * @param enabled - If `true`, CCD will be enabled for this rigid-body.
   */
  enableCcd(enabled: boolean): void;
  /**
   * The world-space translation of this rigid-body.
   */
  translation(): Vector;
  /**
   * The world-space orientation of this rigid-body.
   */
  rotation(): Rotation;
  /**
   * The world-space next translation of this rigid-body.
   *
   * If this rigid-body is kinematic this value is set by the `setNextKinematicTranslation`
   * method and is used for estimating the kinematic body velocity at the next timestep.
   * For non-kinematic bodies, this value is currently unspecified.
   */
  nextTranslation(): Vector;
  /**
   * The world-space next orientation of this rigid-body.
   *
   * If this rigid-body is kinematic this value is set by the `setNextKinematicRotation`
   * method and is used for estimating the kinematic body velocity at the next timestep.
   * For non-kinematic bodies, this value is currently unspecified.
   */
  nextRotation(): Rotation;
  /**
   * Sets the translation of this rigid-body.
   *
   * @param tra - The world-space position of the rigid-body.
   * @param wakeUp - Forces the rigid-body to wake-up so it is properly affected by forces if it
   *                 wasn't moving before modifying its position.
   */
  setTranslation(tra: Vector, wakeUp: boolean): void;
  /**
   * Sets the linear velocity fo this rigid-body.
   *
   * @param vel - The linear velocity to set.
   * @param wakeUp - Forces the rigid-body to wake-up if it was asleep.
   */
  setLinvel(vel: Vector, wakeUp: boolean): void;
  /**
   * The scale factor applied to the gravity affecting
   * this rigid-body.
   */
  gravityScale(): number;
  /**
   * Sets the scale factor applied to the gravity affecting
   * this rigid-body.
   *
   * @param factor - The scale factor to set. A value of 0.0 means
   *   that this rigid-body will on longer be affected by gravity.
   * @param wakeUp - Forces the rigid-body to wake-up if it was asleep.
   */
  setGravityScale(factor: number, wakeUp: boolean): void;
  /**
   * Sets the rotation quaternion of this rigid-body.
   *
   * This does nothing if a zero quaternion is provided.
   *
   * @param rotation - The rotation to set.
   * @param wakeUp - Forces the rigid-body to wake-up so it is properly affected by forces if it
   * wasn't moving before modifying its position.
   */
  setRotation(rot: Rotation, wakeUp: boolean): void;
  /**
   * Sets the angular velocity fo this rigid-body.
   *
   * @param vel - The angular velocity to set.
   * @param wakeUp - Forces the rigid-body to wake-up if it was asleep.
   */
  setAngvel(vel: Vector, wakeUp: boolean): void;
  /**
   * If this rigid body is kinematic, sets its future translation after the next timestep integration.
   *
   * This should be used instead of `rigidBody.setTranslation` to make the dynamic object
   * interacting with this kinematic body behave as expected. Internally, Rapier will compute
   * an artificial velocity for this rigid-body from its current position and its next kinematic
   * position. This velocity will be used to compute forces on dynamic bodies interacting with
   * this body.
   *
   * @param t - The kinematic translation to set.
   */
  setNextKinematicTranslation(t: Vector): void;
  /**
   * If this rigid body is kinematic, sets its future rotation after the next timestep integration.
   *
   * This should be used instead of `rigidBody.setRotation` to make the dynamic object
   * interacting with this kinematic body behave as expected. Internally, Rapier will compute
   * an artificial velocity for this rigid-body from its current position and its next kinematic
   * position. This velocity will be used to compute forces on dynamic bodies interacting with
   * this body.
   *
   * @param rot - The kinematic rotation to set.
   */
  setNextKinematicRotation(rot: Rotation): void;
  /**
   * The linear velocity of this rigid-body.
   */
  linvel(): Vector;
  /**
   * The angular velocity of this rigid-body.
   */
  angvel(): Vector;
  /**
   * The mass of this rigid-body.
   */
  mass(): number;
  /**
   * Put this rigid body to sleep.
   *
   * A sleeping body no longer moves and is no longer simulated by the physics engine unless
   * it is waken up. It can be woken manually with `this.wakeUp()` or automatically due to
   * external forces like contacts.
   */
  sleep(): void;
  /**
   * Wakes this rigid-body up.
   *
   * A dynamic rigid-body that does not move during several consecutive frames will
   * be put to sleep by the physics engine, i.e., it will stop being simulated in order
   * to avoid useless computations.
   * This methods forces a sleeping rigid-body to wake-up. This is useful, e.g., before modifying
   * the position of a dynamic body so that it is properly simulated afterwards.
   */
  wakeUp(): void;
  /**
   * Is CCD enabled for this rigid-body?
   */
  isCcdEnabled(): void;
  /**
   * The number of colliders attached to this rigid-body.
   */
  numColliders(): number;
  /**
   * Retrieves the handle of the `i-th` collider attached to this rigid-body.
   *
   * @param i - The index of the collider to retrieve. Must be a number in `[0, this.numColliders()[`.
   *         This index is **not** the same as the unique identifier of the collider.
   */
  collider(i: number): ColliderHandle;
  /**
   * The status of this rigid-body: static, dynamic, or kinematic.
   */
  bodyType(): RigidBodyType;
  /**
   * Is this rigid-body sleeping?
   */
  isSleeping(): boolean;
  /**
   * Is the velocity of this rigid-body not zero?
   */
  isMoving(): boolean;
  /**
   * Is this rigid-body static?
   */
  isStatic(): boolean;
  /**
   * Is this rigid-body kinematic?
   */
  isKinematic(): boolean;
  /**
   * Is this rigid-body dynamic?
   */
  isDynamic(): boolean;
  /**
   * The linear damping coefficient of this rigid-body.
   */
  linearDamping(): number;
  /**
   * The angular damping coefficient of this rigid-body.
   */
  angularDamping(): number;
  /**
   * Sets the linear damping factor applied to this rigid-body.
   *
   * @param factor - The damping factor to set.
   */
  setLinearDamping(factor: number): void;
  /**
   * Sets the linear damping factor applied to this rigid-body.
   *
   * @param factor - The damping factor to set.
   */
  setAngularDamping(factor: number): void;
  /**
   * Applies a force at the center-of-mass of this rigid-body.
   *
   * @param force - the world-space force to apply on the rigid-body.
   * @param wakeUp - should the rigid-body be automatically woken-up?
   */
  applyForce(force: Vector, wakeUp: boolean): void;
  /**
   * Applies an impulse at the center-of-mass of this rigid-body.
   *
   * @param impulse - the world-space impulse to apply on the rigid-body.
   * @param wakeUp - should the rigid-body be automatically woken-up?
   */
  applyImpulse(impulse: Vector, wakeUp: boolean): void;
  /**
   * Applies a torque at the center-of-mass of this rigid-body.
   *
   * @param torque - the world-space torque to apply on the rigid-body.
   * @param wakeUp - should the rigid-body be automatically woken-up?
   */
  applyTorque(torque: Vector, wakeUp: boolean): void;
  /**
   * Applies an impulsive torque at the center-of-mass of this rigid-body.
   *
   * @param torqueImpulse - the world-space torque impulse to apply on the rigid-body.
   * @param wakeUp - should the rigid-body be automatically woken-up?
   */
  applyTorqueImpulse(torqueImpulse: Vector, wakeUp: boolean): void;
  /**
   * Applies a force at the given world-space point of this rigid-body.
   *
   * @param force - the world-space force to apply on the rigid-body.
   * @param point - the world-space point where the impulse is to be applied on the rigid-body.
   * @param wakeUp - should the rigid-body be automatically woken-up?
   */
  applyForceAtPoint(force: Vector, point: Vector, wakeUp: boolean): void;
  /**
   * Applies an impulse at the given world-space point of this rigid-body.
   *
   * @param impulse - the world-space impulse to apply on the rigid-body.
   * @param point - the world-space point where the impulse is to be applied on the rigid-body.
   * @param wakeUp - should the rigid-body be automatically woken-up?
   */
  applyImpulseAtPoint(impulse: Vector, point: Vector, wakeUp: boolean): void;
}
export class RigidBodyDesc {
  translation: Vector;
  rotation: Rotation;
  gravityScale: number;
  mass: number;
  translationsEnabled: boolean;
  centerOfMass: Vector;
  linvel: Vector;
  angvel: Vector;
  principalAngularInertia: Vector;
  angularInertiaLocalFrame: Rotation;
  rotationsEnabledX: boolean;
  rotationsEnabledY: boolean;
  rotationsEnabledZ: boolean;
  linearDamping: number;
  angularDamping: number;
  status: RigidBodyType;
  canSleep: boolean;
  ccdEnabled: boolean;
  dominanceGroup: number;
  constructor(status: RigidBodyType);
  /**
   * A rigid-body descriptor used to build a dynamic rigid-body.
   */
  static newDynamic(): RigidBodyDesc;
  /**
   * A rigid-body descriptor used to build a position-based kinematic rigid-body.
   */
  static newKinematicPositionBased(): RigidBodyDesc;
  /**
   * A rigid-body descriptor used to build a velocity-based kinematic rigid-body.
   */
  static newKinematicVelocityBased(): RigidBodyDesc;
  /**
   * A rigid-body descriptor used to build a static rigid-body.
   */
  static newStatic(): RigidBodyDesc;
  setDominanceGroup(group: number): RigidBodyDesc;
  /**
   * Sets the initial translation of the rigid-body to create.
   *
   * @param tra - The translation to set.
   */
  setTranslation(x: number, y: number, z: number): RigidBodyDesc;
  /**
   * Sets the initial rotation of the rigid-body to create.
   *
   * @param rot - The rotation to set.
   */
  setRotation(rot: Rotation): RigidBodyDesc;
  /**
   * Sets the scale factor applied to the gravity affecting
   * the rigid-body being built.
   *
   * @param scale - The scale factor. Set this to `0.0` if the rigid-body
   *   needs to ignore gravity.
   */
  setGravityScale(scale: number): RigidBodyDesc;
  /**
   * Sets the initial mass of the rigid-body being built, before adding colliders' contributions.
   *
   * @param mass − The initial mass of the rigid-body to create.
   */
  setAdditionalMass(mass: number): RigidBodyDesc;
  /**
   * Locks all translations that would have resulted from forces on
   * the created rigid-body.
   */
  lockTranslations(): RigidBodyDesc;
  /**
   * Sets the initial linear velocity of the rigid-body to create.
   *
   * @param x - The linear velocity to set along the `x` axis.
   * @param y - The linear velocity to set along the `y` axis.
   * @param z - The linear velocity to set along the `z` axis.
   */
  setLinvel(x: number, y: number, z: number): RigidBodyDesc;
  /**
   * Sets the initial angular velocity of the rigid-body to create.
   *
   * @param vel - The angular velocity to set.
   */
  setAngvel(vel: Vector): RigidBodyDesc;
  /**
   * Sets the mass properties of the rigid-body being built.
   *
   * Note that the final mass properties of the rigid-bodies depends
   * on the initial mass-properties of the rigid-body (set by this method)
   * to which is added the contributions of all the colliders with non-zero density
   * attached to this rigid-body.
   *
   * Therefore, if you want your provided mass properties to be the final
   * mass properties of your rigid-body, don't attach colliders to it, or
   * only attach colliders with densities equal to zero.
   *
   * @param mass − The initial mass of the rigid-body to create.
   * @param centerOfMass − The initial center-of-mass of the rigid-body to create.
   * @param principalAngularInertia − The initial principal angular inertia of the rigid-body to create.
   *                                  These are the eigenvalues of the angular inertia matrix.
   * @param angularInertiaLocalFrame − The initial local angular inertia frame of the rigid-body to create.
   *                                   These are the eigenvectors of the angular inertia matrix.
   */
  setAdditionalMassProperties(mass: number, centerOfMass: Vector, principalAngularInertia: Vector, angularInertiaLocalFrame: Rotation): RigidBodyDesc;
  /**
   * Sets the mass properties of the rigid-body being built.
   *
   * @param principalAngularInertia − The initial principal angular inertia of the rigid-body to create.
   */
  setAdditionalPrincipalAngularInertia(principalAngularInertia: Vector): RigidBodyDesc;
  /**
   * Allow rotation of this rigid-body only along specific axes.
   * @param rotationsEnabledX - Are rotations along the X axis enabled?
   * @param rotationsEnabledY - Are rotations along the y axis enabled?
   * @param rotationsEnabledZ - Are rotations along the Z axis enabled?
   */
  restrictRotations(rotationsEnabledX: boolean, rotationsEnabledY: boolean, rotationsEnabledZ: boolean): RigidBodyDesc;
  /**
   * Locks all rotations that would have resulted from forces on
   * the created rigid-body.
   */
  lockRotations(): RigidBodyDesc;
  /**
   * Sets the linear damping of the rigid-body to create.
   *
   * This will progressively slowdown the translational movement of the rigid-body.
   *
   * @param damping - The angular damping coefficient. Should be >= 0. The higher this
   *                  value is, the stronger the translational slowdown will be.
   */
  setLinearDamping(damping: number): RigidBodyDesc;
  /**
   * Sets the angular damping of the rigid-body to create.
   *
   * This will progressively slowdown the rotational movement of the rigid-body.
   *
   * @param damping - The angular damping coefficient. Should be >= 0. The higher this
   *                  value is, the stronger the rotational slowdown will be.
   */
  setAngularDamping(damping: number): RigidBodyDesc;
  /**
   * Sets whether or not the rigid-body to create can sleep.
   *
   * @param can - true if the rigid-body can sleep, false if it can't.
   */
  setCanSleep(can: boolean): RigidBodyDesc;
  /**
   * Sets whether Continuous Collision Detection (CCD) is enabled for this rigid-body.
   *
   * @param enabled - true if the rigid-body has CCD enabled.
   */
  setCcdEnabled(enabled: boolean): RigidBodyDesc;
}

/**
 * A set of rigid bodies that can be handled by a physics pipeline.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `jointSet.free()`
 * once you are done using it (and all the rigid-bodies it created).
 */
export class RigidBodySet {
  raw: RawRigidBodySet;
  /**
   * Release the WASM memory occupied by this rigid-body set.
   */
  free(): void;
  constructor(raw?: RawRigidBodySet);
  /**
   * Creates a new rigid-body and return its integer handle.
   *
   * @param desc - The description of the rigid-body to create.
   */
  createRigidBody(desc: RigidBodyDesc): RigidBodyHandle;
  /**
   * Removes a rigid-body from this set.
   *
   * This will also remove all the colliders and joints attached to the rigid-body.
   *
   * @param handle - The integer handle of the rigid-body to remove.
   * @param colliders - The set of colliders that may contain colliders attached to the removed rigid-body.
   * @param joints - The set of joints that may contain joints attached to the removed rigid-body.
   */
  remove(handle: RigidBodyHandle, islands: IslandManager, colliders: ColliderSet, joints: JointSet): void;
  /**
   * The number of rigid-bodies on this set.
   */
  len(): number;
  /**
   * Does this set contain a rigid-body with the given handle?
   *
   * @param handle - The rigid-body handle to check.
   */
  contains(handle: RigidBodyHandle): boolean;
  /**
   * Gets the rigid-body with the given handle.
   *
   * @param handle - The handle of the rigid-body to retrieve.
   */
  get(handle: RigidBodyHandle): RigidBody;
  /**
   * Applies the given closure to each rigid-body contained by this set.
   *
   * @param f - The closure to apply.
   */
  forEachRigidBody(f: (body: RigidBody) => void): void;
  /**
   * Applies the given closure to the handle of each rigid-body contained by this set.
   *
   * @param f - The closure to apply.
   */
  forEachRigidBodyHandle(f: (handle: RigidBodyHandle) => void): void;
  /**
   * Applies the given closure to each active rigid-bodies contained by this set.
   *
   * A rigid-body is active if it is not sleeping, i.e., if it moved recently.
   *
   * @param f - The closure to apply.
   */
  forEachActiveRigidBody(islands: IslandManager, f: (body: RigidBody) => void): void;
}

/**
 * The broad-phase used for coarse collision-detection.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `broadPhase.free()`
 * once you are done using it.
 */
export class BroadPhase {
  raw: RawBroadPhase;
  /**
   * Release the WASM memory occupied by this broad-phase.
   */
  free(): void;
  constructor(raw?: RawBroadPhase);
}

export enum ActiveCollisionTypes {
  DYNAMIC_DYNAMIC = 1,
  DYNAMIC_KINEMATIC = 12,
  DYNAMIC_STATIC = 2,
  KINEMATIC_KINEMATIC = 52224,
  KINEMATIC_STATIC = 8704,
  STATIC_STATIC = 32,
  DEFAULT = 15,
  ALL = 60943
}
/**
 * The integer identifier of a collider added to a `ColliderSet`.
 */
export type ColliderHandle = number;
/**
 * A geometric entity that can be attached to a body so it can be affected
 * by contacts and proximity queries.
 */
export class Collider {
  private rawSet;
  readonly handle: ColliderHandle;
  constructor(rawSet: RawColliderSet, handle: ColliderHandle);
  /**
   * Checks if this collider is still valid (i.e. that it has
   * not been deleted from the collider set yet.
   */
  isValid(): boolean;
  /**
   * The world-space translation of this rigid-body.
   */
  translation(): Vector;
  /**
   * The world-space orientation of this rigid-body.
   */
  rotation(): Rotation;
  /**
   * Is this collider a sensor?
   */
  isSensor(): boolean;
  setSensor(isSensor: boolean): void;
  setShape(shape: Shape): void;
  /**
   * Sets the restitution coefficient of the collider to be created.
   *
   * @param restitution - The restitution coefficient in `[0, 1]`. A value of 0 (the default) means no bouncing behavior
   *                   while 1 means perfect bouncing (though energy may still be lost due to numerical errors of the
   *                   constraints solver).
   */
  setRestitution(restitution: number): void;
  /**
   * Sets the friction coefficient of the collider to be created.
   *
   * @param friction - The friction coefficient. Must be greater or equal to 0. This is generally smaller than 1. The
   *                   higher the coefficient, the stronger friction forces will be for contacts with the collider
   *                   being built.
   */
  setFriction(friction: number): void;
  /**
   * Gets the rule used to combine the friction coefficients of two colliders
   * colliders involved in a contact.
   */
  frictionCombineRule(): CoefficientCombineRule;
  /**
   * Sets the rule used to combine the friction coefficients of two colliders
   * colliders involved in a contact.
   *
   * @param rule − The combine rule to apply.
   */
  setFrictionCombineRule(rule: CoefficientCombineRule): void;
  /**
   * Gets the rule used to combine the restitution coefficients of two colliders
   * colliders involved in a contact.
   */
  restitutionCombineRule(): CoefficientCombineRule;
  /**
   * Sets the rule used to combine the restitution coefficients of two colliders
   * colliders involved in a contact.
   *
   * @param rule − The combine rule to apply.
   */
  setRestitutionCombineRule(rule: CoefficientCombineRule): void;
  /**
   * Sets the collision groups used by this collider.
   *
   * Two colliders will interact iff. their collision groups are compatible.
   * See the documentation of `InteractionGroups` for details on teh used bit pattern.
   *
   * @param groups - The collision groups used for the collider being built.
   */
  setCollisionGroups(groups: InteractionGroups): void;
  /**
   * Sets the solver groups used by this collider.
   *
   * Forces between two colliders in contact will be computed iff their solver
   * groups are compatible.
   * See the documentation of `InteractionGroups` for details on the used bit pattern.
   *
   * @param groups - The solver groups used for the collider being built.
   */
  setSolverGroups(groups: InteractionGroups): void;
  /**
   * Get the physics hooks active for this collider.
   */
  activeHooks(): void;
  /**
   * Set the physics hooks active for this collider.
   *
   * Use this to enable custom filtering rules for contact/intersecstion pairs involving this collider.
   *
   * @param activeHooks - The hooks active for contact/intersection pairs involving this collider.
   */
  setActiveHooks(activeHooks: ActiveHooks): void;
  /**
   * The events active for this collider.
   */
  activeEvents(): ActiveEvents;
  /**
   * Set the events active for this collider.
   *
   * Use this to enable contact and/or intersection event reporting for this collider.
   *
   * @param activeEvents - The events active for contact/intersection pairs involving this collider.
   */
  setActiveEvents(activeEvents: ActiveEvents): void;
  /**
   * Gets the collision types active for this collider.
   */
  activeCollisionTypes(): ActiveCollisionTypes;
  /**
   * Set the collision types active for this collider.
   *
   * @param activeCollisionTypes - The hooks active for contact/intersection pairs involving this collider.
   */
  setActiveCollisionTypes(activeCollisionTypes: ActiveCollisionTypes): void;
  /**
   * Sets the translation of this collider.
   *
   * @param tra - The world-space position of the collider.
   */
  setTranslation(tra: Vector): void;
  /**
   * Sets the translation of this collider relative to its parent rigid-body.
   *
   * Does nothing if this collider isn't attached to a rigid-body.
   *
   * @param tra - The new translation of the collider relative to its parent.
   */
  setTranslationWrtParent(tra: Vector): void;
  /**
   * Sets the rotation quaternion of this collider.
   *
   * This does nothing if a zero quaternion is provided.
   *
   * @param rotation - The rotation to set.
   */
  setRotation(rot: Rotation): void;
  /**
   * Sets the rotation quaternion of this collider relative to its parent rigid-body.
   *
   * This does nothing if a zero quaternion is provided or if this collider isn't
   * attached to a rigid-body.
   *
   * @param rotation - The rotation to set.
   */
  setRotationWrtParent(rot: Rotation): void;
  /**
   * The type of the shape of this collider.
   */
  shapeType(): ShapeType;
  /**
   * The half-extents of this collider if it is a cuboid shape.
   */
  halfExtents(): Vector;
  /**
   * The radius of this collider if it is a ball, cylinder, capsule, or cone shape.
   */
  radius(): number;
  /**
   * The radius of the round edges of this collider if it is a round cylinder.
   */
  roundRadius(): number;
  /**
   * The half height of this collider if it is a cylinder, capsule, or cone shape.
   */
  halfHeight(): number;
  /**
   * If this collider has a triangle mesh, polyline, convex polygon, or convex polyhedron shape,
   * this returns the vertex buffer of said shape.
   */
  vertices(): Float32Array;
  /**
   * If this collider has a triangle mesh, polyline, or convex polyhedron shape,
   * this returns the index buffer of said shape.
   */
  indices(): Uint32Array;
  /**
   * If this collider has a heightfield shape, this returns the heights buffer of
   * the heightfield.
   * In 3D, the returned height matrix is provided in column-major order.
   */
  heightfieldHeights(): Float32Array;
  /**
   * If this collider has a heightfield shape, this returns the scale
   * applied to it.
   */
  heightfieldScale(): Vector;
  /**
   * If this collider has a heightfield shape, this returns the number of
   * rows of its height matrix.
   */
  heightfieldNRows(): number;
  /**
   * If this collider has a heightfield shape, this returns the number of
   * columns of its height matrix.
   */
  heightfieldNCols(): number;
  /**
   * The unique integer identifier of the rigid-body this collider is attached to.
   */
  parent(): RigidBodyHandle;
  /**
   * The friction coefficient of this collider.
   */
  friction(): number;
  /**
   * The density of this collider.
   */
  density(): number;
  /**
   * The collision groups of this collider.
   */
  collisionGroups(): InteractionGroups;
  /**
   * The solver groups of this collider.
   */
  solverGroups(): InteractionGroups;
}
export class ColliderDesc {
  shape: Shape;
  useMassProps: boolean;
  mass: number;
  centerOfMass: Vector;
  principalAngularInertia: Vector;
  angularInertiaLocalFrame: Rotation;
  density: number;
  friction: number;
  restitution: number;
  rotation: Rotation;
  translation: Vector;
  isSensor: boolean;
  collisionGroups: InteractionGroups;
  solverGroups: InteractionGroups;
  frictionCombineRule: CoefficientCombineRule;
  restitutionCombineRule: CoefficientCombineRule;
  activeEvents: ActiveEvents;
  activeHooks: ActiveHooks;
  activeCollisionTypes: ActiveCollisionTypes;
  /**
   * Initializes a collider descriptor from the collision shape.
   *
   * @param shape - The shape of the collider being built.
   */
  constructor(shape: Shape);
  /**
   * Create a new collider descriptor with a ball shape.
   *
   * @param radius - The radius of the ball.
   */
  static ball(radius: number): ColliderDesc;
  /**
   * Create a new collider descriptor with a capsule shape.
   *
   * @param halfHeight - The half-height of the capsule, along the `y` axis.
   * @param radius - The radius of the capsule basis.
   */
  static capsule(halfHeight: number, radius: number): ColliderDesc;
  /**
   * Creates a new segment shape.
   *
   * @param a - The first point of the segment.
   * @param b - The second point of the segment.
   */
  static segment(a: Vector, b: Vector): ColliderDesc;
  /**
   * Creates a new triangle shape.
   *
   * @param a - The first point of the triangle.
   * @param b - The second point of the triangle.
   * @param c - The third point of the triangle.
   */
  static triangle(a: Vector, b: Vector, c: Vector): ColliderDesc;
  /**
   * Creates a new triangle shape with round corners.
   *
   * @param a - The first point of the triangle.
   * @param b - The second point of the triangle.
   * @param c - The third point of the triangle.
   * @param borderRadius - The radius of the borders of this triangle. In 3D,
   *   this is also equal to half the thickness of the triangle.
   */
  static roundTriangle(a: Vector, b: Vector, c: Vector, borderRadius: number): ColliderDesc;
  /**
   * Creates a new collider descriptor with a polyline shape.
   *
   * @param vertices - The coordinates of the polyline's vertices.
   * @param indices - The indices of the polyline's segments. If this is `null`,
   *    the vertices are assumed to describe a line strip.
   */
  static polyline(vertices: Float32Array, indices: Uint32Array): ColliderDesc;
  /**
   * Creates a new collider descriptor with a triangle mesh shape.
   *
   * @param vertices - The coordinates of the triangle mesh's vertices.
   * @param indices - The indices of the triangle mesh's triangles.
   */
  static trimesh(vertices: Float32Array, indices: Uint32Array): ColliderDesc;
  /**
   * Creates a new collider descriptor with a cuboid shape.
   *
   * @param hx - The half-width of the rectangle along its local `x` axis.
   * @param hy - The half-width of the rectangle along its local `y` axis.
   * @param hz - The half-width of the rectangle along its local `z` axis.
   */
  static cuboid(hx: number, hy: number, hz: number): ColliderDesc;
  /**
   * Creates a new collider descriptor with a rectangular shape with round borders.
   *
   * @param hx - The half-width of the rectangle along its local `x` axis.
   * @param hy - The half-width of the rectangle along its local `y` axis.
   * @param hz - The half-width of the rectangle along its local `z` axis.
   * @param borderRadius - The radius of the cuboid's borders.
   */
  static roundCuboid(hx: number, hy: number, hz: number, borderRadius: number): ColliderDesc;
  /**
   * Creates a new collider descriptor with a heightfield shape.
   *
   * @param nrows − The number of rows in the heights matrix.
   * @param ncols - The number of columns in the heights matrix.
   * @param heights - The heights of the heightfield along its local `y` axis,
   *                  provided as a matrix stored in column-major order.
   * @param scale - The scale factor applied to the heightfield.
   */
  static heightfield(nrows: number, ncols: number, heights: Float32Array, scale: Vector): ColliderDesc;
  /**
   * Create a new collider descriptor with a cylinder shape.
   *
   * @param halfHeight - The half-height of the cylinder, along the `y` axis.
   * @param radius - The radius of the cylinder basis.
   */
  static cylinder(halfHeight: number, radius: number): ColliderDesc;
  /**
   * Create a new collider descriptor with a cylinder shape with rounded corners.
   *
   * @param halfHeight - The half-height of the cylinder, along the `y` axis.
   * @param radius - The radius of the cylinder basis.
   * @param borderRadius - The radius of the cylinder's rounded edges and vertices.
   */
  static roundCylinder(halfHeight: number, radius: number, borderRadius: number): ColliderDesc;
  /**
   * Create a new collider descriptor with a cone shape.
   *
   * @param halfHeight - The half-height of the cone, along the `y` axis.
   * @param radius - The radius of the cone basis.
   */
  static cone(halfHeight: number, radius: number): ColliderDesc;
  /**
   * Create a new collider descriptor with a cone shape with rounded corners.
   *
   * @param halfHeight - The half-height of the cone, along the `y` axis.
   * @param radius - The radius of the cone basis.
   * @param borderRadius - The radius of the cone's rounded edges and vertices.
   */
  static roundCone(halfHeight: number, radius: number, borderRadius: number): ColliderDesc;
  /**
   * Computes the convex-hull of the given points and use the resulting
   * convex polyhedron as the shape for this new collider descriptor.
   *
   * @param points - The point that will be used to compute the convex-hull.
   */
  static convexHull(points: Float32Array): ColliderDesc | null;
  /**
   * Creates a new collider descriptor that uses the given set of points assumed
   * to form a convex polyline (no convex-hull computation will be done).
   *
   * @param vertices - The vertices of the convex polyline.
   */
  static convexMesh(vertices: Float32Array, indices: Uint32Array): ColliderDesc | null;
  /**
   * Computes the convex-hull of the given points and use the resulting
   * convex polyhedron as the shape for this new collider descriptor. A
   * border is added to that convex polyhedron to give it round corners.
   *
   * @param points - The point that will be used to compute the convex-hull.
   * @param borderRadius - The radius of the round border added to the convex polyhedron.
   */
  static roundConvexHull(points: Float32Array, borderRadius: number): ColliderDesc | null;
  /**
   * Creates a new collider descriptor that uses the given set of points assumed
   * to form a round convex polyline (no convex-hull computation will be done).
   *
   * @param vertices - The vertices of the convex polyline.
   * @param borderRadius - The radius of the round border added to the convex polyline.
   */
  static roundConvexMesh(vertices: Float32Array, indices: Uint32Array, borderRadius: number): ColliderDesc | null;
  /**
   * Sets the position of the collider to be created relative to the rigid-body it is attached to.
   */
  setTranslation(x: number, y: number, z: number): ColliderDesc;
  /**
   * Sets the rotation of the collider to be created relative to the rigid-body it is attached to.
   *
   * @param rot - The rotation of the collider to be created relative to the rigid-body it is attached to.
   */
  setRotation(rot: Rotation): ColliderDesc;
  /**
   * Sets whether or not the collider being created is a sensor.
   *
   * A sensor collider does not take part of the physics simulation, but generates
   * proximity events.
   *
   * @param is - Set to `true` of the collider built is to be a sensor.
   */
  setSensor(is: boolean): ColliderDesc;
  /**
   * Sets the density of the collider being built.
   *
   * @param density - The density to set, must be greater or equal to 0. A density of 0 means that this collider
   *                  will not affect the mass or angular inertia of the rigid-body it is attached to.
   */
  setDensity(density: number): ColliderDesc;
  /**
   * Sets the mass properties of the collider being built.
   *
   * This replaces the mass-properties automatically computed from the collider's density and shape.
   * These mass-properties will be added to the mass-properties of the rigid-body this collider will be attached to.
   *
   * @param mass − The mass of the collider to create.
   * @param centerOfMass − The center-of-mass of the collider to create.
   * @param principalAngularInertia − The initial principal angular inertia of the collider to create.
   *                                  These are the eigenvalues of the angular inertia matrix.
   * @param angularInertiaLocalFrame − The initial local angular inertia frame of the collider to create.
   *                                   These are the eigenvectors of the angular inertia matrix.
   */
  setMassProperties(mass: number, centerOfMass: Vector, principalAngularInertia: Vector, angularInertiaLocalFrame: Rotation): ColliderDesc;
  /**
   * Sets the restitution coefficient of the collider to be created.
   *
   * @param restitution - The restitution coefficient in `[0, 1]`. A value of 0 (the default) means no bouncing behavior
   *                   while 1 means perfect bouncing (though energy may still be lost due to numerical errors of the
   *                   constraints solver).
   */
  setRestitution(restitution: number): ColliderDesc;
  /**
   * Sets the friction coefficient of the collider to be created.
   *
   * @param friction - The friction coefficient. Must be greater or equal to 0. This is generally smaller than 1. The
   *                   higher the coefficient, the stronger friction forces will be for contacts with the collider
   *                   being built.
   */
  setFriction(friction: number): ColliderDesc;
  /**
   * Sets the rule used to combine the friction coefficients of two colliders
   * colliders involved in a contact.
   *
   * @param rule − The combine rule to apply.
   */
  setFrictionCombineRule(rule: CoefficientCombineRule): ColliderDesc;
  /**
   * Sets the rule used to combine the restitution coefficients of two colliders
   * colliders involved in a contact.
   *
   * @param rule − The combine rule to apply.
   */
  setRestitutionCombineRule(rule: CoefficientCombineRule): ColliderDesc;
  /**
   * Sets the collision groups used by this collider.
   *
   * Two colliders will interact iff. their collision groups are compatible.
   * See the documentation of `InteractionGroups` for details on teh used bit pattern.
   *
   * @param groups - The collision groups used for the collider being built.
   */
  setCollisionGroups(groups: InteractionGroups): ColliderDesc;
  /**
   * Sets the solver groups used by this collider.
   *
   * Forces between two colliders in contact will be computed iff their solver
   * groups are compatible.
   * See the documentation of `InteractionGroups` for details on the used bit pattern.
   *
   * @param groups - The solver groups used for the collider being built.
   */
  setSolverGroups(groups: InteractionGroups): ColliderDesc;
  /**
   * Set the physics hooks active for this collider.
   *
   * Use this to enable custom filtering rules for contact/intersecstion pairs involving this collider.
   *
   * @param activeHooks - The hooks active for contact/intersection pairs involving this collider.
   */
  setActiveHooks(activeHooks: ActiveHooks): ColliderDesc;
  /**
   * Set the events active for this collider.
   *
   * Use this to enable contact and/or intersection event reporting for this collider.
   *
   * @param activeEvents - The events active for contact/intersection pairs involving this collider.
   */
  setActiveEvents(activeEvents: ActiveEvents): ColliderDesc;
  /**
   * Set the collision types active for this collider.
   *
   * @param activeCollisionTypes - The hooks active for contact/intersection pairs involving this collider.
   */
  setActiveCollisionTypes(activeCollisionTypes: ActiveCollisionTypes): ColliderDesc;
}

/**
 * A set of rigid bodies that can be handled by a physics pipeline.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `colliderSet.free()`
 * once you are done using it (and all the rigid-bodies it created).
 */
export class ColliderSet {
  raw: RawColliderSet;
  /**
   * Release the WASM memory occupied by this collider set.
   */
  free(): void;
  constructor(raw?: RawColliderSet);
  /**
   * Creates a new collider and return its integer handle.
   *
   * @param bodies - The set of bodies where the collider's parent can be found.
   * @param desc - The collider's description.
   * @param parentHandle - The inteer handle of the rigid-body this collider is attached to.
   */
  createCollider(bodies: RigidBodySet, desc: ColliderDesc, parentHandle: RigidBodyHandle): ColliderHandle;
  /**
   * Remove a collider from this set.
   *
   * @param handle - The integer handle of the collider to remove.
   * @param bodies - The set of rigid-body containing the rigid-body the collider is attached to.
   * @param wakeUp - If `true`, the rigid-body the removed collider is attached to will be woken-up automatically.
   */
  remove(handle: ColliderHandle, islands: IslandManager, bodies: RigidBodySet, wakeUp: boolean): void;
  /**
   * Gets the rigid-body with the given handle.
   *
   * @param handle - The handle of the rigid-body to retrieve.
   */
  get(handle: ColliderHandle): Collider;
  /**
   * The number of colliders on this set.
   */
  len(): number;
  /**
   * Does this set contain a collider with the given handle?
   *
   * @param handle - The collider handle to check.
   */
  contains(handle: ColliderHandle): boolean;
  /**
   * Applies the given closure to each collider contained by this set.
   *
   * @param f - The closure to apply.
   */
  forEachCollider(f: (collider: Collider) => void): void;
  /**
   * Applies the given closure to the handles of each collider contained by this set.
   *
   * @param f - The closure to apply.
   */
  forEachColliderHandle(f: (handle: ColliderHandle) => void): void;
}

/**
 * Pairwise filtering using bit masks.
 *
 * This filtering method is based on two 16-bit values:
 * - The interaction groups (the 16 left-most bits of `self.0`).
 * - The interaction mask (the 16 right-most bits of `self.0`).
 *
 * An interaction is allowed between two filters `a` and `b` two conditions
 * are met simultaneously:
 * - The interaction groups of `a` has at least one bit set to `1` in common with the interaction mask of `b`.
 * - The interaction groups of `b` has at least one bit set to `1` in common with the interaction mask of `a`.
 * In other words, interactions are allowed between two filter iff. the following condition is met:
 *
 * ```
 * ((a >> 16) & b) != 0 && ((b >> 16) & a) != 0
 * ```
 */
export type InteractionGroups = number;

/**
 * The narrow-phase used for precise collision-detection.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `narrowPhase.free()`
 * once you are done using it.
 */
export class NarrowPhase {
  raw: RawNarrowPhase;
  tempManifold: TempContactManifold;
  /**
   * Release the WASM memory occupied by this narrow-phase.
   */
  free(): void;
  constructor(raw?: RawNarrowPhase);
  /**
   * Enumerates all the colliders potentially in contact with the given collider.
   *
   * @param collider1 - The second collider involved in the contact.
   * @param f - Closure that will be called on each collider that is in contact with `collider1`.
   */
  contactsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
  /**
   * Enumerates all the colliders intersecting the given colliders, assuming one of them
   * is a sensor.
   */
  intersectionsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
  /**
   * Iterates through all the contact manifolds between the given pair of colliders.
   *
   * @param collider1 - The first collider involved in the contact.
   * @param collider2 - The second collider involved in the contact.
   * @param f - Closure that will be called on each contact manifold between the two colliders. If the second argument
   *            passed to this closure is `true`, then the contact manifold data is flipped, i.e., methods like `localNormal1`
   *            actually apply to the `collider2` and fields like `localNormal2` apply to the `collider1`.
   */
  contactPair(collider1: ColliderHandle, collider2: ColliderHandle, f: (manifold: TempContactManifold, flipped: boolean) => void): void;
  /**
   * Returns `true` if `collider1` and `collider2` intersect and at least one of them is a sensor.
   * @param collider1 − The first collider involved in the intersection.
   * @param collider2 − The second collider involved in the intersection.
   */
  intersectionPair(collider1: ColliderHandle, collider2: ColliderHandle): boolean;
}
export class TempContactManifold {
  raw: RawContactManifold;
  free(): void;
  constructor(raw: RawContactManifold);
  normal(): Vector;
  localNormal1(): Vector;
  localNormal2(): Vector;
  subshape1(): number;
  subshape2(): number;
  numContacts(): number;
  localContactPoint1(i: number): Vector | null;
  localContactPoint2(i: number): Vector | null;
  contactDist(i: number): number;
  contactFid1(i: number): number;
  contactFid2(i: number): number;
  contactImpulse(i: number): number;
  contactTangentImpulseX(i: number): number;
  contactTangentImpulseY(i: number): number;
  numSolverContacts(): number;
  solverContactPoint(i: number): Vector;
  solverContactDist(i: number): number;
  solverContactFriction(i: number): number;
  solverContactRestitution(i: number): number;
  solverContactTangentVelocity(i: number): Vector;
}

/**
 * The intersection between a ray and a collider.
 */
export class PointColliderProjection {
  /**
   * The handle of the collider hit by the ray.
   */
  colliderHandle: ColliderHandle;
  /**
   * The projection of the point on the collider.
   */
  point: Vector;
  /**
   * Is the point inside of the collider?
   */
  isInside: boolean;
  constructor(colliderHandle: ColliderHandle, point: Vector, isInside: boolean);
  static fromRaw(raw: RawPointColliderProjection): PointColliderProjection;
}

/**
 * A ray. This is a directed half-line.
 */
export class Ray {
  /**
   * The starting point of the ray.
   */
  origin: Vector;
  /**
   * The direction of propagation of the ray.
   */
  dir: Vector;
  /**
   * Builds a ray from its origin and direction.
   *
   * @param origin - The ray's starting point.
   * @param dir - The ray's direction of propagation.
   */
  constructor(origin: Vector, dir: Vector);
  pointAt(t: number): Vector;
}
/**
 * The intersection between a ray and a collider.
 */
export class RayColliderIntersection {
  /**
   * The handle of the collider hit by the ray.
   */
  colliderHandle: ColliderHandle;
  /**
   * The time-of-impact of the ray with the collider.
   *
   * The hit point is obtained from the ray's origin and direction: `origin + dir * toi`.
   */
  toi: number;
  /**
   * The normal of the collider at the hit point.
   */
  normal: Vector;
  constructor(colliderHandle: ColliderHandle, toi: number, normal: Vector);
  static fromRaw(raw: RawRayColliderIntersection): RayColliderIntersection;
}
/**
 * The time of impact between a ray and a collider.
 */
export class RayColliderToi {
  /**
   * The handle of the collider hit by the ray.
   */
  colliderHandle: ColliderHandle;
  /**
   * The time-of-impact of the ray with the collider.
   *
   * The hit point is obtained from the ray's origin and direction: `origin + dir * toi`.
   */
  toi: number;
  constructor(colliderHandle: ColliderHandle, toi: number);
  static fromRaw(raw: RawRayColliderToi): RayColliderToi;
}

/**
 * The type of a shape supported by Rapier.
 */
export type Shape = Ball | Cuboid | Capsule | Segment | Triangle | TriMesh | Heightfield | ConvexPolyhedron | Cylinder | Cone | RoundCuboid | RoundCylinder | RoundCone | RoundConvexPolyhedron;
/**
 * An enumeration representing the type of a shape.
 */
export enum ShapeType {
  Ball = 0,
  Cuboid = 1,
  Capsule = 2,
  Segment = 3,
  Polyline = 4,
  Triangle = 5,
  TriMesh = 6,
  HeightField = 7,
  ConvexPolyhedron = 9,
  Cylinder = 10,
  Cone = 11,
  RoundCuboid = 12,
  RoundTriangle = 13,
  RoundCylinder = 14,
  RoundCone = 15,
  RoundConvexPolyhedron = 16
}
/**
 * A shape that is a sphere in 3D and a circle in 2D.
 */
export class Ball {
  /**
   * The balls radius.
   */
  readonly radius: number;
  /**
   * Creates a new ball with the given radius.
   * @param radius - The balls radius.
   */
  constructor(radius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a box in 3D and a rectangle in 2D.
 */
export class Cuboid {
  /**
   * The half extent of the cuboid along each coordinate axis.
   */
  halfExtents: Vector;
  /**
   * Creates a new 3D cuboid.
   * @param hx - The half width of the cuboid.
   * @param hy - The half height of the cuboid.
   * @param hz - The half depth of the cuboid.
   */
  constructor(hx: number, hy: number, hz: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a box in 3D and a rectangle in 2D, with round corners.
 */
export class RoundCuboid {
  /**
   * The half extent of the cuboid along each coordinate axis.
   */
  halfExtents: Vector;
  /**
   * The radius of the cuboid's round border.
   */
  borderRadius: number;
  /**
   * Creates a new 3D cuboid.
   * @param hx - The half width of the cuboid.
   * @param hy - The half height of the cuboid.
   * @param hz - The half depth of the cuboid.
   * @param borderRadius - The radius of the borders of this cuboid. This will
   *   effectively increase the half-extents of the cuboid by this radius.
   */
  constructor(hx: number, hy: number, hz: number, borderRadius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a capsule.
 */
export class Capsule {
  /**
   * The radius of the capsule's basis.
   */
  readonly radius: number;
  /**
   * The capsule's half height, along the `y` axis.
   */
  readonly halfHeight: number;
  /**
   * Creates a new capsule with the given radius and half-height.
   * @param halfHeight - The balls half-height along the `y` axis.
   * @param radius - The balls radius.
   */
  constructor(halfHeight: number, radius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a segment.
 */
export class Segment {
  /**
   * The first point of the segment.
   */
  readonly a: Vector;
  /**
   * The second point of the segment.
   */
  readonly b: Vector;
  /**
   * Creates a new segment shape.
   * @param a - The first point of the segment.
   * @param b - The second point of the segment.
   */
  constructor(a: Vector, b: Vector);
  intoRaw(): RawShape;
}
/**
 * A shape that is a segment.
 */
export class Triangle {
  /**
   * The first point of the triangle.
   */
  readonly a: Vector;
  /**
   * The second point of the triangle.
   */
  readonly b: Vector;
  /**
   * The second point of the triangle.
   */
  readonly c: Vector;
  /**
   * Creates a new triangle shape.
   *
   * @param a - The first point of the triangle.
   * @param b - The second point of the triangle.
   * @param c - The third point of the triangle.
   */
  constructor(a: Vector, b: Vector, c: Vector);
  intoRaw(): RawShape;
}
/**
 * A shape that is a triangle with round borders and a non-zero thickness.
 */
export class RoundTriangle {
  /**
   * The first point of the triangle.
   */
  readonly a: Vector;
  /**
   * The second point of the triangle.
   */
  readonly b: Vector;
  /**
   * The second point of the triangle.
   */
  readonly c: Vector;
  /**
   * The radius of the triangles's rounded edges and vertices.
   * In 3D, this is also equal to half the thickness of the round triangle.
   */
  readonly borderRadius: number;
  /**
   * Creates a new triangle shape with round corners.
   *
   * @param a - The first point of the triangle.
   * @param b - The second point of the triangle.
   * @param c - The third point of the triangle.
   * @param borderRadius - The radius of the borders of this triangle. In 3D,
   *   this is also equal to half the thickness of the triangle.
   */
  constructor(a: Vector, b: Vector, c: Vector, borderRadius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a triangle mesh.
 */
export class Polyline {
  /**
   * The vertices of the polyline.
   */
  readonly vertices: Float32Array;
  /**
   * The indices of the segments.
   */
  readonly indices: Uint32Array;
  /**
   * Creates a new polyline shape.
   *
   * @param vertices - The coordinates of the polyline's vertices.
   * @param indices - The indices of the polyline's segments. If this is `null` then
   *    the vertices are assumed to form a line strip.
   */
  constructor(vertices: Float32Array, indices: Uint32Array);
  intoRaw(): RawShape;
}
/**
 * A shape that is a triangle mesh.
 */
export class TriMesh {
  /**
   * The vertices of the triangle mesh.
   */
  readonly vertices: Float32Array;
  /**
   * The indices of the triangles.
   */
  readonly indices: Uint32Array;
  /**
   * Creates a new triangle mesh shape.
   *
   * @param vertices - The coordinates of the triangle mesh's vertices.
   * @param indices - The indices of the triangle mesh's triangles.
   */
  constructor(vertices: Float32Array, indices: Uint32Array);
  intoRaw(): RawShape;
}
/**
 * A shape that is a convex polygon.
 */
export class ConvexPolyhedron {
  /**
   * The vertices of the convex polygon.
   */
  readonly vertices: Float32Array;
  /**
   * The indices of the convex polygon.
   */
  readonly indices: Uint32Array | null;
  /**
   * Creates a new convex polygon shape.
   *
   * @param vertices - The coordinates of the convex polygon's vertices.
   * @param indices - The index buffer of this convex mesh. If this is `null`
   *   or `undefined`, the convex-hull of the input vertices will be computed
   *   automatically. Otherwise, it will be assumed that the mesh you provide
   *   is already convex.
   */
  constructor(vertices: Float32Array, indices: Uint32Array | null);
  intoRaw(): RawShape;
}
/**
 * A shape that is a convex polygon.
 */
export class RoundConvexPolyhedron {
  /**
   * The vertices of the convex polygon.
   */
  readonly vertices: Float32Array;
  /**
   * The indices of the convex polygon.
   */
  readonly indices: Uint32Array | null;
  /**
   * The radius of the convex polyhedron's rounded edges and vertices.
   */
  readonly borderRadius: number;
  /**
   * Creates a new convex polygon shape.
   *
   * @param vertices - The coordinates of the convex polygon's vertices.
   * @param indices - The index buffer of this convex mesh. If this is `null`
   *   or `undefined`, the convex-hull of the input vertices will be computed
   *   automatically. Otherwise, it will be assumed that the mesh you provide
   *   is already convex.
   * @param borderRadius - The radius of the borders of this convex polyhedron.
   */
  constructor(vertices: Float32Array, indices: Uint32Array | null, borderRadius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a heightfield.
 */
export class Heightfield {
  /**
   * The number of rows in the heights matrix.
   */
  readonly nrows: number;
  /**
   * The number of columns in the heights matrix.
   */
  readonly ncols: number;
  /**
   * The heights of the heightfield along its local `y` axis,
   * provided as a matrix stored in column-major order.
   */
  readonly heights: Float32Array;
  /**
   * The dimensions of the heightfield's local `x,z` plane.
   */
  readonly scale: Vector;
  /**
   * Creates a new heightfield shape.
   *
   * @param nrows − The number of rows in the heights matrix.
   * @param ncols - The number of columns in the heights matrix.
   * @param heights - The heights of the heightfield along its local `y` axis,
   *                  provided as a matrix stored in column-major order.
   * @param scale - The dimensions of the heightfield's local `x,z` plane.
   */
  constructor(nrows: number, ncols: number, heights: Float32Array, scale: Vector);
  intoRaw(): RawShape;
}
/**
 * A shape that is a 3D cylinder.
 */
export class Cylinder {
  /**
   * The radius of the cylinder's basis.
   */
  readonly radius: number;
  /**
   * The cylinder's half height, along the `y` axis.
   */
  readonly halfHeight: number;
  /**
   * Creates a new cylinder with the given radius and half-height.
   * @param halfHeight - The balls half-height along the `y` axis.
   * @param radius - The balls radius.
   */
  constructor(halfHeight: number, radius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a 3D cylinder with round corners.
 */
export class RoundCylinder {
  /**
   * The radius of the cylinder's basis.
   */
  readonly radius: number;
  /**
   * The cylinder's half height, along the `y` axis.
   */
  readonly halfHeight: number;
  /**
   * The radius of the cylinder's rounded edges and vertices.
   */
  readonly borderRadius: number;
  /**
   * Creates a new cylinder with the given radius and half-height.
   * @param halfHeight - The balls half-height along the `y` axis.
   * @param radius - The balls radius.
   * @param borderRadius - The radius of the borders of this cylinder.
   */
  constructor(halfHeight: number, radius: number, borderRadius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a 3D cone.
 */
export class Cone {
  /**
   * The radius of the cone's basis.
   */
  readonly radius: number;
  /**
   * The cone's half height, along the `y` axis.
   */
  readonly halfHeight: number;
  /**
   * Creates a new cone with the given radius and half-height.
   * @param halfHeight - The balls half-height along the `y` axis.
   * @param radius - The balls radius.
   */
  constructor(halfHeight: number, radius: number);
  intoRaw(): RawShape;
}
/**
 * A shape that is a 3D cone with round corners.
 */
export class RoundCone {
  /**
   * The radius of the cone's basis.
   */
  readonly radius: number;
  /**
   * The cone's half height, along the `y` axis.
   */
  readonly halfHeight: number;
  /**
   * The radius of the cylinder's rounded edges and vertices.
   */
  readonly borderRadius: number;
  /**
   * Creates a new cone with the given radius and half-height.
   * @param halfHeight - The balls half-height along the `y` axis.
   * @param radius - The balls radius.
   * @param borderRadius - The radius of the borders of this cone.
   */
  constructor(halfHeight: number, radius: number, borderRadius: number);
  intoRaw(): RawShape;
}

/**
 * The intersection between a ray and a collider.
 */
export class ShapeColliderTOI {
  /**
   * The handle of the collider hit by the ray.
   */
  colliderHandle: ColliderHandle;
  /**
   * The time of impact of the two shapes.
   */
  toi: number;
  /**
   * The local-space contact point on the first shape, at
   * the time of impact.
   */
  witness1: Vector;
  /**
   * The local-space contact point on the second shape, at
   * the time of impact.
   */
  witness2: Vector;
  /**
   * The local-space normal on the first shape, at
   * the time of impact.
   */
  normal1: Vector;
  /**
   * The local-space normal on the second shape, at
   * the time of impact.
   */
  normal2: Vector;
  constructor(colliderHandle: ColliderHandle, toi: number, witness1: Vector, witness2: Vector, normal1: Vector, normal2: Vector);
  static fromRaw(raw: RawShapeColliderTOI): ShapeColliderTOI;
}

export interface Vector {
  x: number;
  y: number;
  z: number;
}
/**
 * A 3D vector.
 */
export class Vector3 implements Vector {
  x: number;
  y: number;
  z: number;
  constructor(x: number, y: number, z: number);
}
export class VectorOps {
  static new(x: number, y: number, z: number): Vector;
  static intoRaw(v: Vector): RawVector;
  static zeros(): Vector;
  static fromRaw(raw: RawVector): Vector;
}
export interface Rotation {
  x: number;
  y: number;
  z: number;
  w: number;
}
/**
 * A quaternion.
 */
export class Quaternion implements Rotation {
  x: number;
  y: number;
  z: number;
  w: number;
  constructor(x: number, y: number, z: number, w: number);
}
export class RotationOps {
  static identity(): Rotation;
  static fromRaw(raw: RawRotation): Rotation;
  static intoRaw(rot: Rotation): RawRotation;
}

export enum ActiveEvents {
  INTERSECTION_EVENTS = 1,
  CONTACT_EVENTS = 2
}
/**
 * A structure responsible for collecting events generated
 * by the physics engine.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `eventQueue.free()`
 * once you are done using it.
 */
export class EventQueue {
  raw: RawEventQueue;
  /**
   * Creates a new event collector.
   *
   * @param autoDrain -setting this to `true` is strongly recommended. If true, the collector will
   * be automatically drained before each `world.step(collector)`. If false, the collector will
   * keep all events in memory unless it is manually drained/cleared; this may lead to unbounded use of
   * RAM if no drain is performed.
   */
  constructor(autoDrain: boolean, raw?: RawEventQueue);
  /**
   * Release the WASM memory occupied by this event-queue.
   */
  free(): void;
  /**
   * Applies the given javascript closure on each contact event of this collector, then clear
   * the internal contact event buffer.
   *
   * @param f - JavaScript closure applied to each contact event. The
   * closure should take three arguments: two integers representing the handles of the colliders
   * involved in the contact, and a boolean indicating if the contact started (true) or stopped
   * (false).
   */
  drainContactEvents(f: (handle1: ColliderHandle, handle2: ColliderHandle, started: boolean) => void): void;
  /**
   * Applies the given javascript closure on each intersection event of this collector, then clear
   * the internal intersection event buffer.
   *
   * @param f - JavaScript closure applied to each intersection event. The
   * closure should take four arguments: two integers representing the handles of the colliders
   * involved in the intersection, and a boolean indicating if they started intersecting (true) or
   * stopped intersecting (false).
   */
  drainIntersectionEvents(f: (handle1: ColliderHandle, handle2: ColliderHandle, intersecting: boolean) => void): void;
  /**
   * Removes all events contained by this collector
   */
  clear(): void;
}

export enum ActiveHooks {
  FILTER_CONTACT_PAIRS = 1,
  FILTER_INTERSECTION_PAIRS = 2
}
export enum SolverFlags {
  EMPTY = 0,
  COMPUTE_IMPULSE = 1
}
export interface PhysicsHooks {
  /**
   * Function that determines if contacts computation should happen between two colliders, and how the
   * constraints solver should behave for these contacts.
   *
   * This will only be executed and taken into account if at least one of the involved colliders contains the
   * `ActiveHooks.FILTER_CONTACT_PAIR` flag in its active hooks.
   *
   * @param collider1 − Handle of the first collider involved in the potential contact.
   * @param collider2 − Handle of the second collider involved in the potential contact.
   * @param body1 − Handle of the first body involved in the potential contact.
   * @param body2 − Handle of the second body involved in the potential contact.
   */
  filterContactPair(collider1: ColliderHandle, collider2: ColliderHandle, body1: RigidBodyHandle, body2: RigidBodyHandle): SolverFlags | null;
  /**
   * Function that determines if intersection computation should happen between two colliders (where at least
   * one is a sensor).
   *
   * This will only be executed and taken into account if `one of the involved colliders contains the
   * `ActiveHooks.FILTER_INTERSECTION_PAIR` flag in its active hooks.
   *
   * @param collider1 − Handle of the first collider involved in the potential contact.
   * @param collider2 − Handle of the second collider involved in the potential contact.
   * @param body1 − Handle of the first body involved in the potential contact.
   * @param body2 − Handle of the second body involved in the potential contact.
   */
  filterIntersectionPair(collider1: ColliderHandle, collider2: ColliderHandle, body1: RigidBodyHandle, body2: RigidBodyHandle): boolean;
}

export class PhysicsPipeline {
  raw: RawPhysicsPipeline;
  free(): void;
  constructor(raw?: RawPhysicsPipeline);
  step(gravity: Vector, integrationParameters: IntegrationParameters, islands: IslandManager, broadPhase: BroadPhase, narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, joints: JointSet, ccdSolver: CCDSolver, eventQueue?: EventQueue, hooks?: PhysicsHooks): void;
}

/**
 * A pipeline for performing queries on all the colliders of a scene.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `queryPipeline.free()`
 * once you are done using it (and all the rigid-bodies it created).
 */
export class QueryPipeline {
  raw: RawQueryPipeline;
  /**
   * Release the WASM memory occupied by this query pipeline.
   */
  free(): void;
  constructor(raw?: RawQueryPipeline);
  /**
   * Updates the acceleration structure of the query pipeline.
   * @param bodies - The set of rigid-bodies taking part in this pipeline.
   * @param colliders - The set of colliders taking part in this pipeline.
   */
  update(islands: IslandManager, bodies: RigidBodySet, colliders: ColliderSet): void;
  /**
   * Find the closest intersection between a ray and a set of collider.
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param ray - The ray to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the length of the ray to `ray.dir.norm() * maxToi`.
   * @param solid - If `false` then the ray will attempt to hit the boundary of a shape, even if its
   *   origin already lies inside of a shape. In other terms, `true` implies that all shapes are plain,
   *   whereas `false` implies that all shapes are hollow for this ray-cast.
   * @param groups - Used to filter the colliders that can or cannot be hit by the ray.
   */
  castRay(colliders: ColliderSet, ray: Ray, maxToi: number, solid: boolean, groups: InteractionGroups): RayColliderToi | null;
  /**
   * Find the closest intersection between a ray and a set of collider.
   *
   * This also computes the normal at the hit point.
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param ray - The ray to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the length of the ray to `ray.dir.norm() * maxToi`.
   * @param solid - If `false` then the ray will attempt to hit the boundary of a shape, even if its
   *   origin already lies inside of a shape. In other terms, `true` implies that all shapes are plain,
   *   whereas `false` implies that all shapes are hollow for this ray-cast.
   * @param groups - Used to filter the colliders that can or cannot be hit by the ray.
   */
  castRayAndGetNormal(colliders: ColliderSet, ray: Ray, maxToi: number, solid: boolean, groups: InteractionGroups): RayColliderIntersection | null;
  /**
   * Cast a ray and collects all the intersections between a ray and the scene.
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param ray - The ray to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the length of the ray to `ray.dir.norm() * maxToi`.
   * @param solid - If `false` then the ray will attempt to hit the boundary of a shape, even if its
   *   origin already lies inside of a shape. In other terms, `true` implies that all shapes are plain,
   *   whereas `false` implies that all shapes are hollow for this ray-cast.
   * @param groups - Used to filter the colliders that can or cannot be hit by the ray.
   * @param callback - The callback called once per hit (in no particular order) between a ray and a collider.
   *   If this callback returns `false`, then the cast will stop and no further hits will be detected/reported.
   */
  intersectionsWithRay(colliders: ColliderSet, ray: Ray, maxToi: number, solid: boolean, groups: InteractionGroups, callback: (RayColliderIntersection: any) => boolean): void;
  /**
   * Gets the handle of up to one collider intersecting the given shape.
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param shapePos - The position of the shape used for the intersection test.
   * @param shapeRot - The orientation of the shape used for the intersection test.
   * @param shape - The shape used for the intersection test.
   * @param groups - The bit groups and filter associated to the ray, in order to only
   *   hit the colliders with collision groups compatible with the ray's group.
   */
  intersectionWithShape(colliders: ColliderSet, shapePos: Vector, shapeRot: Rotation, shape: Shape, groups: InteractionGroups): ColliderHandle | null;
  /**
   * Find the projection of a point on the closest collider.
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param point - The point to project.
   * @param solid - If this is set to `true` then the collider shapes are considered to
   *   be plain (if the point is located inside of a plain shape, its projection is the point
   *   itself). If it is set to `false` the collider shapes are considered to be hollow
   *   (if the point is located inside of an hollow shape, it is projected on the shape's
   *   boundary).
   * @param groups - The bit groups and filter associated to the point to project, in order to only
   *   project on colliders with collision groups compatible with the ray's group.
   */
  projectPoint(colliders: ColliderSet, point: Vector, solid: boolean, groups: InteractionGroups): PointColliderProjection | null;
  /**
   * Find all the colliders containing the given point.
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param point - The point used for the containment test.
   * @param groups - The bit groups and filter associated to the point to test, in order to only
   *   test on colliders with collision groups compatible with the ray's group.
   * @param callback - A function called with the handles of each collider with a shape
   *   containing the `point`.
   */
  intersectionsWithPoint(colliders: ColliderSet, point: Vector, groups: InteractionGroups, callback: (ColliderHandle: any) => boolean): void;
  /**
   * Casts a shape at a constant linear velocity and retrieve the first collider it hits.
   * This is similar to ray-casting except that we are casting a whole shape instead of
   * just a point (the ray origin).
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param shapePos - The initial position of the shape to cast.
   * @param shapeRot - The initial rotation of the shape to cast.
   * @param shapeVel - The constant velocity of the shape to cast (i.e. the cast direction).
   * @param shape - The shape to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the distance traveled by the shape to `shapeVel.norm() * maxToi`.
   * @param groups - The bit groups and filter associated to the shape to cast, in order to only
   *   test on colliders with collision groups compatible with this group.
   */
  castShape(colliders: ColliderSet, shapePos: Vector, shapeRot: Rotation, shapeVel: Vector, shape: Shape, maxToi: number, groups: InteractionGroups): ShapeColliderTOI | null;
  /**
   * Retrieve all the colliders intersecting the given shape.
   *
   * @param colliders - The set of colliders taking part in this pipeline.
   * @param shapePos - The position of the shape to test.
   * @param shapeRot - The orientation of the shape to test.
   * @param shape - The shape to test.
   * @param groups - The bit groups and filter associated to the shape to test, in order to only
   *   test on colliders with collision groups compatible with this group.
   * @param callback - A function called with the handles of each collider intersecting the `shape`.
   */
  intersectionsWithShape(colliders: ColliderSet, shapePos: Vector, shapeRot: Rotation, shape: Shape, groups: InteractionGroups, callback: (handle: ColliderHandle) => boolean): void;
  /**
   * Finds the handles of all the colliders with an AABB intersecting the given AABB.
   *
   * @param aabbCenter - The center of the AABB to test.
   * @param aabbHalfExtents - The half-extents of the AABB to test.
   * @param callback - The callback that will be called with the handles of all the colliders
   *                   currently intersecting the given AABB.
   */
  collidersWithAabbIntersectingAabb(aabbCenter: Vector, aabbHalfExtents: Vector, callback: (handle: ColliderHandle) => boolean): void;
}

/**
 * A pipeline for serializing the physics scene.
 *
 * To avoid leaking WASM resources, this MUST be freed manually with `queryPipeline.free()`
 * once you are done using it (and all the rigid-bodies it created).
 */
export class SerializationPipeline {
  raw: RawSerializationPipeline;
  /**
   * Release the WASM memory occupied by this serialization pipeline.
   */
  free(): void;
  constructor(raw?: RawSerializationPipeline);
  /**
   * Serialize a complete physics state into a single byte array.
   * @param gravity - The current gravity affecting the simulation.
   * @param integrationParameters - The integration parameters of the simulation.
   * @param broadPhase - The broad-phase of the simulation.
   * @param narrowPhase - The narrow-phase of the simulation.
   * @param bodies - The rigid-bodies taking part into the simulation.
   * @param colliders - The colliders taking part into the simulation.
   * @param joints - The joints taking part into the simulation.
   */
  serializeAll(gravity: Vector, integrationParameters: IntegrationParameters, islands: IslandManager, broadPhase: BroadPhase, narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, joints: JointSet): Uint8Array;
  /**
   * Deserialize the complete physics state from a single byte array.
   *
   * @param data - The byte array to deserialize.
   */
  deserializeAll(data: Uint8Array): World;
}

/**
 * The physics world.
 *
 * This contains all the data-structures necessary for creating and simulating
 * bodies with contacts, joints, and external forces.
 */
export class World {
  gravity: Vector;
  integrationParameters: IntegrationParameters;
  islands: IslandManager;
  broadPhase: BroadPhase;
  narrowPhase: NarrowPhase;
  bodies: RigidBodySet;
  colliders: ColliderSet;
  joints: JointSet;
  ccdSolver: CCDSolver;
  queryPipeline: QueryPipeline;
  physicsPipeline: PhysicsPipeline;
  serializationPipeline: SerializationPipeline;
  /**
   * Release the WASM memory occupied by this physics world.
   *
   * All the fields of this physics world will be freed as well,
   * so there is no need to call their `.free()` methods individually.
   */
  free(): void;
  constructor(gravity: Vector, rawIntegrationParameters?: RawIntegrationParameters, rawIslands?: RawIslandManager, rawBroadPhase?: RawBroadPhase, rawNarrowPhase?: RawNarrowPhase, rawBodies?: RawRigidBodySet, rawColliders?: RawColliderSet, rawJoints?: RawJointSet, rawCCDSolver?: RawCCDSolver, rawQueryPipeline?: RawQueryPipeline, rawPhysicsPipeline?: RawPhysicsPipeline, rawSerializationPipeline?: RawSerializationPipeline);
  static fromRaw(raw: RawDeserializedWorld): World;
  /**
   * Takes a snapshot of this world.
   *
   * Use `World.restoreSnapshot` to create a new physics world with a state identical to
   * the state when `.takeSnapshot()` is called.
   */
  takeSnapshot(): Uint8Array;
  /**
   * Creates a new physics world from a snapshot.
   *
   * This new physics world will be an identical copy of the snapshoted physics world.
   */
  static restoreSnapshot(data: Uint8Array): World;
  /**
   * Advance the simulation by one time step.
   *
   * All events generated by the physics engine are ignored.
   *
   * @param EventQueue - (optional) structure responsible for collecting
   *   events generated by the physics engine.
   */
  step(eventQueue?: EventQueue, hooks?: PhysicsHooks): void;
  /**
   * The current simulation timestep.
   */
  get timestep(): number;
  /**
   * Sets the new simulation timestep.
   *
   * The simulation timestep governs by how much the physics state of the world will
   * be integrated. A simulation timestep should:
   * - be as small as possible. Typical values evolve around 0.016 (assuming the chosen unit is milliseconds,
   * corresponds to the time between two frames of a game running at 60FPS).
   * - not vary too much during the course of the simulation. A timestep with large variations may
   * cause instabilities in the simulation.
   *
   * @param timestep - The timestep length, in milliseconds.
   */
  set timestep(dt: number);
  /**
   * The maximum velocity iterations the velocity-based force constraint solver can make.
   */
  get maxVelocityIterations(): number;
  /**
   * Sets the maximum number of velocity iterations (default: 4).
   *
   * The greater this value is, the most rigid and realistic the physics simulation will be.
   * However a greater number of iterations is more computationally intensive.
   *
   * @param niter - The new maximum number of velocity iterations.
   */
  set maxVelocityIterations(niter: number);
  /**
   * The maximum position iterations the position-based constraint regularization solver can make.
   */
  get maxPositionIterations(): number;
  /**
   * Sets the maximum number of position iterations (default: 1).
   *
   * The greater this value is, the less penetrations will be visible after one timestep where
   * the velocity solver did not converge entirely. Large values will degrade significantly
   * the performance of the simulation.
   *
   * To increase realism of the simulation it is recommended, more efficient, and more effecive,
   * to increase the number of velocity iterations instead of this number of position iterations.
   *
   * @param niter - The new maximum number of position iterations.
   */
  set maxPositionIterations(niter: number);
  /**
   * Creates a new rigid-body from the given rigd-body descriptior.
   *
   * @param body - The description of the rigid-body to create.
   */
  createRigidBody(body: RigidBodyDesc): RigidBody;
  /**
   * Creates a new collider.
   *
   * @param desc - The description of the collider.
   * @param parentHandle - The handle of the rigid-body this collider is attached to.
   */
  createCollider(desc: ColliderDesc, parentHandle?: RigidBodyHandle): Collider;
  /**
   * Creates a new joint from the given joint descriptior.
   *
   * @param joint - The description of the joint to create.
   * @param parent1 - The first rigid-body attached to this joint.
   * @param parent2 - The second rigid-body attached to this joint.
   */
  createJoint(params: JointParams, parent1: RigidBody, parent2: RigidBody): Joint;
  /**
   * Retrieves a rigid-body from its handle.
   *
   * @param handle - The integer handle of the rigid-body to retrieve.
   */
  getRigidBody(handle: RigidBodyHandle): RigidBody;
  /**
   * Retrieves a collider from its handle.
   *
   * @param handle - The integer handle of the collider to retrieve.
   */
  getCollider(handle: ColliderHandle): Collider;
  /**
   * Retrieves a joint from its handle.
   *
   * @param handle - The integer handle of the rigid-body to retrieve.
   */
  getJoint(handle: JointHandle): Joint;
  /**
   * Removes the given rigid-body from this physics world.
   *
   * This will remove this rigid-body as well as all its attached colliders and joints.
   * Every other bodies touching or attached by joints to this rigid-body will be woken-up.
   *
   * @param body - The rigid-body to remove.
   */
  removeRigidBody(body: RigidBody): void;
  /**
   * Removes the given collider from this physics world.
   *
   * @param collider - The collider to remove.
   * @param wakeUp - If set to `true`, the rigid-body this collider is attached to will be awaken.
   */
  removeCollider(collider: Collider, wakeUp: boolean): void;
  /**
   * Removes the given joint from this physics world.
   *
   * @param joint - The joint to remove.
   * @param wakeUp - If set to `true`, the rigid-bodies attached by this joint will be awaken.
   */
  removeJoint(joint: Joint, wakeUp: boolean): void;
  /**
   * Applies the given closure to each collider managed by this physics world.
   *
   * @param f(collider) - The function to apply to each collider managed by this physics world. Called as `f(collider)`.
   */
  forEachCollider(f: (collider: Collider) => void): void;
  /**
   * Applies the given closure to the integer handle of each collider managed by this physics world.
   *
   * @param f(handle) - The function to apply to the integer handle of each collider managed by this physics world. Called as `f(collider)`.
   */
  forEachColliderHandle(f: (handle: ColliderHandle) => void): void;
  /**
   * Applies the given closure to each rigid-body managed by this physics world.
   *
   * @param f(body) - The function to apply to each rigid-body managed by this physics world. Called as `f(collider)`.
   */
  forEachRigidBody(f: (body: RigidBody) => void): void;
  /**
   * Applies the given closure to the integer handle of each rigid-body managed by this physics world.
   *
   * @param f(handle) - The function to apply to the integer handle of each rigid-body managed by this physics world. Called as `f(collider)`.
   */
  forEachRigidBodyHandle(f: (handle: RigidBodyHandle) => void): void;
  /**
   * Applies the given closure to each active rigid-body managed by this physics world.
   *
   * After a short time of inactivity, a rigid-body is automatically deactivated ("asleep") by
   * the physics engine in order to save computational power. A sleeping rigid-body never moves
   * unless it is moved manually by the user.
   *
   * @param f - The function to apply to each active rigid-body managed by this physics world. Called as `f(collider)`.
   */
  forEachActiveRigidBody(f: (body: RigidBody) => void): void;
  /**
   * Applies the given closure to the integer handle of each active rigid-body
   * managed by this physics world.
   *
   * After a short time of inactivity, a rigid-body is automatically deactivated ("asleep") by
   * the physics engine in order to save computational power. A sleeping rigid-body never moves
   * unless it is moved manually by the user.
   *
   * @param f(handle) - The function to apply to the integer handle of each active rigid-body managed by this
   *   physics world. Called as `f(collider)`.
   */
  forEachActiveRigidBodyHandle(f: (handle: RigidBodyHandle) => void): void;
  /**
   * Find the closest intersection between a ray and the physics world.
   *
   * @param ray - The ray to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the length of the ray to `ray.dir.norm() * maxToi`.
   * @param solid - If `false` then the ray will attempt to hit the boundary of a shape, even if its
   *   origin already lies inside of a shape. In other terms, `true` implies that all shapes are plain,
   *   whereas `false` implies that all shapes are hollow for this ray-cast.
   * @param groups - Used to filter the colliders that can or cannot be hit by the ray.
   */
  castRay(ray: Ray, maxToi: number, solid: boolean, groups: InteractionGroups): RayColliderToi | null;
  /**
   * Find the closest intersection between a ray and the physics world.
   *
   * This also computes the normal at the hit point.
   * @param ray - The ray to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the length of the ray to `ray.dir.norm() * maxToi`.
   * @param solid - If `false` then the ray will attempt to hit the boundary of a shape, even if its
   *   origin already lies inside of a shape. In other terms, `true` implies that all shapes are plain,
   *   whereas `false` implies that all shapes are hollow for this ray-cast.
   * @param groups - Used to filter the colliders that can or cannot be hit by the ray.
   */
  castRayAndGetNormal(ray: Ray, maxToi: number, solid: boolean, groups: InteractionGroups): RayColliderIntersection | null;
  /**
   * Cast a ray and collects all the intersections between a ray and the scene.
   *
   * @param ray - The ray to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the length of the ray to `ray.dir.norm() * maxToi`.
   * @param solid - If `false` then the ray will attempt to hit the boundary of a shape, even if its
   *   origin already lies inside of a shape. In other terms, `true` implies that all shapes are plain,
   *   whereas `false` implies that all shapes are hollow for this ray-cast.
   * @param groups - Used to filter the colliders that can or cannot be hit by the ray.
   * @param callback - The callback called once per hit (in no particular order) between a ray and a collider.
   *   If this callback returns `false`, then the cast will stop and no further hits will be detected/reported.
   */
  intersectionsWithRay(ray: Ray, maxToi: number, solid: boolean, groups: InteractionGroups, callback: (RayColliderIntersection: any) => boolean): void;
  /**
   * Gets the handle of up to one collider intersecting the given shape.
   *
   * @param shapePos - The position of the shape used for the intersection test.
   * @param shapeRot - The orientation of the shape used for the intersection test.
   * @param shape - The shape used for the intersection test.
   * @param groups - The bit groups and filter associated to the ray, in order to only
   *   hit the colliders with collision groups compatible with the ray's group.
   */
  intersectionWithShape(shapePos: Vector, shapeRot: Rotation, shape: Shape, groups: InteractionGroups): ColliderHandle | null;
  /**
   * Find the projection of a point on the closest collider.
   *
   * @param point - The point to project.
   * @param solid - If this is set to `true` then the collider shapes are considered to
   *   be plain (if the point is located inside of a plain shape, its projection is the point
   *   itself). If it is set to `false` the collider shapes are considered to be hollow
   *   (if the point is located inside of an hollow shape, it is projected on the shape's
   *   boundary).
   * @param groups - The bit groups and filter associated to the point to project, in order to only
   *   project on colliders with collision groups compatible with the ray's group.
   */
  projectPoint(point: Vector, solid: boolean, groups: InteractionGroups): PointColliderProjection | null;
  /**
   * Find all the colliders containing the given point.
   *
   * @param point - The point used for the containment test.
   * @param groups - The bit groups and filter associated to the point to test, in order to only
   *   test on colliders with collision groups compatible with the ray's group.
   * @param callback - A function called with the handles of each collider with a shape
   *   containing the `point`.
   */
  intersectionsWithPoint(point: Vector, groups: InteractionGroups, callback: (ColliderHandle: any) => boolean): void;
  /**
   * Casts a shape at a constant linear velocity and retrieve the first collider it hits.
   * This is similar to ray-casting except that we are casting a whole shape instead of
   * just a point (the ray origin).
   *
   * @param shapePos - The initial position of the shape to cast.
   * @param shapeRot - The initial rotation of the shape to cast.
   * @param shapeVel - The constant velocity of the shape to cast (i.e. the cast direction).
   * @param shape - The shape to cast.
   * @param maxToi - The maximum time-of-impact that can be reported by this cast. This effectively
   *   limits the distance traveled by the shape to `shapeVel.norm() * maxToi`.
   * @param groups - The bit groups and filter associated to the shape to cast, in order to only
   *   test on colliders with collision groups compatible with this group.
   */
  castShape(shapePos: Vector, shapeRot: Rotation, shapeVel: Vector, shape: Shape, maxToi: number, groups: InteractionGroups): ShapeColliderTOI | null;
  /**
   * Retrieve all the colliders intersecting the given shape.
   *
   * @param shapePos - The position of the shape to test.
   * @param shapeRot - The orientation of the shape to test.
   * @param shape - The shape to test.
   * @param groups - The bit groups and filter associated to the shape to test, in order to only
   *   test on colliders with collision groups compatible with this group.
   * @param callback - A function called with the handles of each collider intersecting the `shape`.
   */
  intersectionsWithShape(shapePos: Vector, shapeRot: Rotation, shape: Shape, groups: InteractionGroups, callback: (handle: ColliderHandle) => boolean): void;
  /**
   * Finds the handles of all the colliders with an AABB intersecting the given AABB.
   *
   * @param aabbCenter - The center of the AABB to test.
   * @param aabbHalfExtents - The half-extents of the AABB to test.
   * @param callback - The callback that will be called with the handles of all the colliders
   *                   currently intersecting the given AABB.
   */
  collidersWithAabbIntersectingAabb(aabbCenter: Vector, aabbHalfExtents: Vector, callback: (handle: ColliderHandle) => boolean): void;
  /**
   * Enumerates all the colliders potentially in contact with the given collider.
   *
   * @param collider1 - The second collider involved in the contact.
   * @param f - Closure that will be called on each collider that is in contact with `collider1`.
   */
  contactsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
  /**
   * Enumerates all the colliders intersecting the given colliders, assuming one of them
   * is a sensor.
   */
  intersectionsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
  /**
   * Iterates through all the contact manifolds between the given pair of colliders.
   *
   * @param collider1 - The first collider involved in the contact.
   * @param collider2 - The second collider involved in the contact.
   * @param f - Closure that will be called on each contact manifold between the two colliders. If the second argument
   *            passed to this closure is `true`, then the contact manifold data is flipped, i.e., methods like `localNormal1`
   *            actually apply to the `collider2` and fields like `localNormal2` apply to the `collider1`.
   */
  contactPair(collider1: ColliderHandle, collider2: ColliderHandle, f: (manifold: TempContactManifold, flipped: boolean) => void): void;
  /**
   * Returns `true` if `collider1` and `collider2` intersect and at least one of them is a sensor.
   * @param collider1 − The first collider involved in the intersection.
   * @param collider2 − The second collider involved in the intersection.
   */
  intersectionPair(collider1: ColliderHandle, collider2: ColliderHandle): boolean;
}

/* eslint-disable */
/**
* @returns {string}
*/
export function version(): string;
/**
*/
export enum RawJointType {
  Ball,
  Fixed,
  Prismatic,
  Revolute,
}
/**
*/
export enum RawSpringModel {
  Disabled,
  VelocityBased,
  AccelerationBased,
  ForceBased,
}
/**
*/
export enum RawRigidBodyType {
  Dynamic,
  Static,
  KinematicPositionBased,
  KinematicVelocityBased,
}
/**
*/
export enum RawShapeType {
  Ball,
  Cuboid,
  Capsule,
  Segment,
  Polyline,
  Triangle,
  TriMesh,
  HeightField,
  Compound,
  ConvexPolyhedron,
  Cylinder,
  Cone,
  RoundCuboid,
  RoundTriangle,
  RoundCylinder,
  RoundCone,
  RoundConvexPolyhedron,
}
/**
*/
export class RawBroadPhase {
  free(): void;
  /**
  */
  constructor();
}
/**
*/
export class RawCCDSolver {
  free(): void;
  /**
  */
  constructor();
}
/**
*/
export class RawColliderSet {
  free(): void;
  /**
  * The world-space translation of this collider.
  * @param {number} handle
  * @returns {RawVector}
  */
  coTranslation(handle: number): RawVector;
  /**
  * The world-space orientation of this collider.
  * @param {number} handle
  * @returns {RawRotation}
  */
  coRotation(handle: number): RawRotation;
  /**
  * Sets the translation of this collider.
  *
  * # Parameters
  * - `x`: the world-space position of the collider along the `x` axis.
  * - `y`: the world-space position of the collider along the `y` axis.
  * - `z`: the world-space position of the collider along the `z` axis.
  * - `wakeUp`: forces the collider to wake-up so it is properly affected by forces if it
  * wasn't moving before modifying its position.
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  */
  coSetTranslation(handle: number, x: number, y: number, z: number): void;
  /**
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  */
  coSetTranslationWrtParent(handle: number, x: number, y: number, z: number): void;
  /**
  * Sets the rotation quaternion of this collider.
  *
  * This does nothing if a zero quaternion is provided.
  *
  * # Parameters
  * - `x`: the first vector component of the quaternion.
  * - `y`: the second vector component of the quaternion.
  * - `z`: the third vector component of the quaternion.
  * - `w`: the scalar component of the quaternion.
  * - `wakeUp`: forces the collider to wake-up so it is properly affected by forces if it
  * wasn't moving before modifying its position.
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  * @param {number} w
  */
  coSetRotation(handle: number, x: number, y: number, z: number, w: number): void;
  /**
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  * @param {number} w
  */
  coSetRotationWrtParent(handle: number, x: number, y: number, z: number, w: number): void;
  /**
  * Is this collider a sensor?
  * @param {number} handle
  * @returns {boolean}
  */
  coIsSensor(handle: number): boolean;
  /**
  * The type of the shape of this collider.
  * @param {number} handle
  * @returns {number}
  */
  coShapeType(handle: number): number;
  /**
  * The half-extents of this collider if it is has a cuboid shape.
  * @param {number} handle
  * @returns {RawVector | undefined}
  */
  coHalfExtents(handle: number): RawVector | undefined;
  /**
  * The radius of this collider if it is a ball, capsule, cylinder, or cone shape.
  * @param {number} handle
  * @returns {number | undefined}
  */
  coRadius(handle: number): number | undefined;
  /**
  * The radius of this collider if it is a capsule, cylinder, or cone shape.
  * @param {number} handle
  * @returns {number | undefined}
  */
  coHalfHeight(handle: number): number | undefined;
  /**
  * The radius of the round edges of this collider if it is a round cylinder.
  * @param {number} handle
  * @returns {number | undefined}
  */
  coRoundRadius(handle: number): number | undefined;
  /**
  * The vertices of this triangle mesh, polyline, convex polyhedron, or convex polyhedron, if it is one.
  * @param {number} handle
  * @returns {Float32Array | undefined}
  */
  coVertices(handle: number): Float32Array | undefined;
  /**
  * The indices of this triangle mesh, polyline, or convex polyhedron, if it is one.
  * @param {number} handle
  * @returns {Uint32Array | undefined}
  */
  coIndices(handle: number): Uint32Array | undefined;
  /**
  * The height of this heightfield if it is one.
  * @param {number} handle
  * @returns {Float32Array | undefined}
  */
  coHeightfieldHeights(handle: number): Float32Array | undefined;
  /**
  * The scaling factor applied of this heightfield if it is one.
  * @param {number} handle
  * @returns {RawVector | undefined}
  */
  coHeightfieldScale(handle: number): RawVector | undefined;
  /**
  * The number of rows on this heightfield's height matrix, if it is one.
  * @param {number} handle
  * @returns {number | undefined}
  */
  coHeightfieldNRows(handle: number): number | undefined;
  /**
  * The number of columns on this heightfield's height matrix, if it is one.
  * @param {number} handle
  * @returns {number | undefined}
  */
  coHeightfieldNCols(handle: number): number | undefined;
  /**
  * The unique integer identifier of the collider this collider is attached to.
  * @param {number} handle
  * @returns {number}
  */
  coParent(handle: number): number;
  /**
  * The friction coefficient of this collider.
  * @param {number} handle
  * @returns {number}
  */
  coFriction(handle: number): number;
  /**
  * The density of this collider.
  * @param {number} handle
  * @returns {number | undefined}
  */
  coDensity(handle: number): number | undefined;
  /**
  * The collision groups of this collider.
  * @param {number} handle
  * @returns {number}
  */
  coCollisionGroups(handle: number): number;
  /**
  * The solver groups of this collider.
  * @param {number} handle
  * @returns {number}
  */
  coSolverGroups(handle: number): number;
  /**
  * The physics hooks enabled for this collider.
  * @param {number} handle
  * @returns {number}
  */
  coActiveHooks(handle: number): number;
  /**
  * The collision types enabled for this collider.
  * @param {number} handle
  * @returns {number}
  */
  coActiveCollisionTypes(handle: number): number;
  /**
  * The events enabled for this collider.
  * @param {number} handle
  * @returns {number}
  */
  coActiveEvents(handle: number): number;
  /**
  * @param {number} handle
  * @param {boolean} is_sensor
  */
  coSetSensor(handle: number, is_sensor: boolean): void;
  /**
  * @param {number} handle
  * @param {number} restitution
  */
  coSetRestitution(handle: number, restitution: number): void;
  /**
  * @param {number} handle
  * @param {number} friction
  */
  coSetFriction(handle: number, friction: number): void;
  /**
  * @param {number} handle
  * @returns {number}
  */
  coFrictionCombineRule(handle: number): number;
  /**
  * @param {number} handle
  * @param {number} rule
  */
  coSetFrictionCombineRule(handle: number, rule: number): void;
  /**
  * @param {number} handle
  * @returns {number}
  */
  coRestitutionCombineRule(handle: number): number;
  /**
  * @param {number} handle
  * @param {number} rule
  */
  coSetRestitutionCombineRule(handle: number, rule: number): void;
  /**
  * @param {number} handle
  * @param {number} groups
  */
  coSetCollisionGroups(handle: number, groups: number): void;
  /**
  * @param {number} handle
  * @param {number} groups
  */
  coSetSolverGroups(handle: number, groups: number): void;
  /**
  * @param {number} handle
  * @param {number} hooks
  */
  coSetActiveHooks(handle: number, hooks: number): void;
  /**
  * @param {number} handle
  * @param {number} events
  */
  coSetActiveEvents(handle: number, events: number): void;
  /**
  * @param {number} handle
  * @param {number} types
  */
  coSetActiveCollisionTypes(handle: number, types: number): void;
  /**
  * @param {number} handle
  * @param {RawShape} shape
  */
  coSetShape(handle: number, shape: RawShape): void;
  /**
  */
  constructor();
  /**
  * @returns {number}
  */
  len(): number;
  /**
  * @param {number} handle
  * @returns {boolean}
  */
  contains(handle: number): boolean;
  /**
  * @param {RawShape} shape
  * @param {RawVector} translation
  * @param {RawRotation} rotation
  * @param {boolean} useMassProps
  * @param {number} mass
  * @param {RawVector} centerOfMass
  * @param {RawVector} principalAngularInertia
  * @param {RawRotation} angularInertiaFrame
  * @param {number} density
  * @param {number} friction
  * @param {number} restitution
  * @param {number} frictionCombineRule
  * @param {number} restitutionCombineRule
  * @param {boolean} isSensor
  * @param {number} collisionGroups
  * @param {number} solverGroups
  * @param {number} activeCollisionTypes
  * @param {number} activeHooks
  * @param {number} activeEvents
  * @param {boolean} hasParent
  * @param {number} parent
  * @param {RawRigidBodySet} bodies
  * @returns {number | undefined}
  */
  createCollider(shape: RawShape, translation: RawVector, rotation: RawRotation, useMassProps: boolean, mass: number, centerOfMass: RawVector, principalAngularInertia: RawVector, angularInertiaFrame: RawRotation, density: number, friction: number, restitution: number, frictionCombineRule: number, restitutionCombineRule: number, isSensor: boolean, collisionGroups: number, solverGroups: number, activeCollisionTypes: number, activeHooks: number, activeEvents: number, hasParent: boolean, parent: number, bodies: RawRigidBodySet): number | undefined;
  /**
  * Removes a collider from this set and wake-up the rigid-body it is attached to.
  * @param {number} handle
  * @param {RawIslandManager} islands
  * @param {RawRigidBodySet} bodies
  * @param {boolean} wakeUp
  */
  remove(handle: number, islands: RawIslandManager, bodies: RawRigidBodySet, wakeUp: boolean): void;
  /**
  * Checks if a collider with the given integer handle exists.
  * @param {number} handle
  * @returns {boolean}
  */
  isHandleValid(handle: number): boolean;
  /**
  * Applies the given JavaScript function to the integer handle of each collider managed by this collider set.
  *
  * # Parameters
  * - `f(handle)`: the function to apply to the integer handle of each collider managed by this collider set. Called as `f(handle)`.
  * @param {Function} f
  */
  forEachColliderHandle(f: Function): void;
}
/**
*/
export class RawContactManifold {
  free(): void;
  /**
  * @returns {RawVector}
  */
  normal(): RawVector;
  /**
  * @returns {RawVector}
  */
  local_n1(): RawVector;
  /**
  * @returns {RawVector}
  */
  local_n2(): RawVector;
  /**
  * @returns {number}
  */
  subshape1(): number;
  /**
  * @returns {number}
  */
  subshape2(): number;
  /**
  * @returns {number}
  */
  num_contacts(): number;
  /**
  * @param {number} i
  * @returns {RawVector | undefined}
  */
  contact_local_p1(i: number): RawVector | undefined;
  /**
  * @param {number} i
  * @returns {RawVector | undefined}
  */
  contact_local_p2(i: number): RawVector | undefined;
  /**
  * @param {number} i
  * @returns {number}
  */
  contact_dist(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  contact_fid1(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  contact_fid2(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  contact_impulse(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  contact_tangent_impulse_x(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  contact_tangent_impulse_y(i: number): number;
  /**
  * @returns {number}
  */
  num_solver_contacts(): number;
  /**
  * @param {number} i
  * @returns {RawVector | undefined}
  */
  solver_contact_point(i: number): RawVector | undefined;
  /**
  * @param {number} i
  * @returns {number}
  */
  solver_contact_dist(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  solver_contact_friction(i: number): number;
  /**
  * @param {number} i
  * @returns {number}
  */
  solver_contact_restitution(i: number): number;
  /**
  * @param {number} i
  * @returns {RawVector}
  */
  solver_contact_tangent_velocity(i: number): RawVector;
}
/**
*/
export class RawContactPair {
  free(): void;
  /**
  * @returns {number}
  */
  collider1(): number;
  /**
  * @returns {number}
  */
  collider2(): number;
  /**
  * @returns {number}
  */
  numContactManifolds(): number;
  /**
  * @param {number} i
  * @returns {RawContactManifold | undefined}
  */
  contactManifold(i: number): RawContactManifold | undefined;
}
/**
*/
export class RawDeserializedWorld {
  free(): void;
  /**
  * @returns {RawVector | undefined}
  */
  takeGravity(): RawVector | undefined;
  /**
  * @returns {RawIntegrationParameters | undefined}
  */
  takeIntegrationParameters(): RawIntegrationParameters | undefined;
  /**
  * @returns {RawIslandManager | undefined}
  */
  takeIslandManager(): RawIslandManager | undefined;
  /**
  * @returns {RawBroadPhase | undefined}
  */
  takeBroadPhase(): RawBroadPhase | undefined;
  /**
  * @returns {RawNarrowPhase | undefined}
  */
  takeNarrowPhase(): RawNarrowPhase | undefined;
  /**
  * @returns {RawRigidBodySet | undefined}
  */
  takeBodies(): RawRigidBodySet | undefined;
  /**
  * @returns {RawColliderSet | undefined}
  */
  takeColliders(): RawColliderSet | undefined;
  /**
  * @returns {RawJointSet | undefined}
  */
  takeJoints(): RawJointSet | undefined;
}
/**
* A structure responsible for collecting events generated
* by the physics engine.
*/
export class RawEventQueue {
  free(): void;
  /**
  * Creates a new event collector.
  *
  * # Parameters
  * - `autoDrain`: setting this to `true` is strongly recommended. If true, the collector will
  * be automatically drained before each `world.step(collector)`. If false, the collector will
  * keep all events in memory unless it is manually drained/cleared; this may lead to unbounded use of
  * RAM if no drain is performed.
  * @param {boolean} autoDrain
  */
  constructor(autoDrain: boolean);
  /**
  * Applies the given javascript closure on each contact event of this collector, then clear
  * the internal contact event buffer.
  *
  * # Parameters
  * - `f(handle1, handle2, started)`:  JavaScript closure applied to each contact event. The
  * closure should take three arguments: two integers representing the handles of the colliders
  * involved in the contact, and a boolean indicating if the contact started (true) or stopped
  * (false).
  * @param {Function} f
  */
  drainContactEvents(f: Function): void;
  /**
  * Applies the given javascript closure on each proximity event of this collector, then clear
  * the internal proximity event buffer.
  *
  * # Parameters
  * - `f(handle1, handle2, prev_prox, new_prox)`:  JavaScript closure applied to each proximity event. The
  * closure should take four arguments: two integers representing the handles of the colliders
  * involved in the proximity, and one boolean representing the intersection status.
  * @param {Function} f
  */
  drainIntersectionEvents(f: Function): void;
  /**
  * Removes all events contained by this collector.
  */
  clear(): void;
}
/**
*/
export class RawIntegrationParameters {
  free(): void;
  /**
  */
  constructor();
  /**
  * @returns {number}
  */
  allowedAngularError: number;
  /**
  * @returns {number}
  */
  allowedLinearError: number;
  /**
  * @returns {number}
  */
  dt: number;
  /**
  * @returns {number}
  */
  erp: number;
  /**
  * @returns {number}
  */
  jointErp: number;
  /**
  * @returns {number}
  */
  maxAngularCorrection: number;
  /**
  * @returns {number}
  */
  maxCcdSubsteps: number;
  /**
  * @returns {number}
  */
  maxLinearCorrection: number;
  /**
  * @returns {number}
  */
  maxPositionIterations: number;
  /**
  * @returns {number}
  */
  maxVelocityIterations: number;
  /**
  * @returns {number}
  */
  minIslandSize: number;
  /**
  * @returns {number}
  */
  predictionDistance: number;
  /**
  * @returns {number}
  */
  warmstartCoeff: number;
}
/**
*/
export class RawIslandManager {
  free(): void;
  /**
  */
  constructor();
  /**
  * Applies the given JavaScript function to the integer handle of each active rigid-body
  * managed by this island manager.
  *
  * After a short time of inactivity, a rigid-body is automatically deactivated ("asleep") by
  * the physics engine in order to save computational power. A sleeping rigid-body never moves
  * unless it is moved manually by the user.
  *
  * # Parameters
  * - `f(handle)`: the function to apply to the integer handle of each active rigid-body managed by this
  *   set. Called as `f(collider)`.
  * @param {Function} f
  */
  forEachActiveRigidBodyHandle(f: Function): void;
}
/**
*/
export class RawJointParams {
  free(): void;
  /**
  * Create a new joint descriptor that builds Ball joints.
  *
  * A ball joints allows three relative rotational degrees of freedom
  * by preventing any relative translation between the anchors of the
  * two attached rigid-bodies.
  * @param {RawVector} anchor1
  * @param {RawVector} anchor2
  * @returns {RawJointParams}
  */
  static ball(anchor1: RawVector, anchor2: RawVector): RawJointParams;
  /**
  * Creates a new joint descriptor that builds a Prismatic joint.
  *
  * A prismatic joint removes all the degrees of freedom between the
  * affected bodies, except for the translation along one axis.
  *
  * Returns `None` if any of the provided axes cannot be normalized.
  * @param {RawVector} anchor1
  * @param {RawVector} axis1
  * @param {RawVector} tangent1
  * @param {RawVector} anchor2
  * @param {RawVector} axis2
  * @param {RawVector} tangent2
  * @param {boolean} limitsEnabled
  * @param {number} limitsMin
  * @param {number} limitsMax
  * @returns {RawJointParams | undefined}
  */
  static prismatic(anchor1: RawVector, axis1: RawVector, tangent1: RawVector, anchor2: RawVector, axis2: RawVector, tangent2: RawVector, limitsEnabled: boolean, limitsMin: number, limitsMax: number): RawJointParams | undefined;
  /**
  * Creates a new joint descriptor that builds a Fixed joint.
  *
  * A fixed joint removes all the degrees of freedom between the affected bodies.
  * @param {RawVector} anchor1
  * @param {RawRotation} axes1
  * @param {RawVector} anchor2
  * @param {RawRotation} axes2
  * @returns {RawJointParams}
  */
  static fixed(anchor1: RawVector, axes1: RawRotation, anchor2: RawVector, axes2: RawRotation): RawJointParams;
  /**
  * Create a new joint descriptor that builds Revolute joints.
  *
  * A revolute joint removes all degrees of freedom between the affected
  * bodies except for the rotation along one axis.
  * @param {RawVector} anchor1
  * @param {RawVector} axis1
  * @param {RawVector} anchor2
  * @param {RawVector} axis2
  * @returns {RawJointParams | undefined}
  */
  static revolute(anchor1: RawVector, axis1: RawVector, anchor2: RawVector, axis2: RawVector): RawJointParams | undefined;
}
/**
*/
export class RawJointSet {
  free(): void;
  /**
  * The unique integer identifier of the first rigid-body this joint it attached to.
  * @param {number} handle
  * @returns {number}
  */
  jointBodyHandle1(handle: number): number;
  /**
  * The unique integer identifier of the second rigid-body this joint is attached to.
  * @param {number} handle
  * @returns {number}
  */
  jointBodyHandle2(handle: number): number;
  /**
  * The type of this joint given as a string.
  * @param {number} handle
  * @returns {number}
  */
  jointType(handle: number): number;
  /**
  * The rotation quaternion that aligns this joint's first local axis to the `x` axis.
  * @param {number} handle
  * @returns {RawRotation}
  */
  jointFrameX1(handle: number): RawRotation;
  /**
  * The rotation matrix that aligns this joint's second local axis to the `x` axis.
  * @param {number} handle
  * @returns {RawRotation}
  */
  jointFrameX2(handle: number): RawRotation;
  /**
  * The position of the first anchor of this joint.
  *
  * The first anchor gives the position of the points application point on the
  * local frame of the first rigid-body it is attached to.
  * @param {number} handle
  * @returns {RawVector}
  */
  jointAnchor1(handle: number): RawVector;
  /**
  * The position of the second anchor of this joint.
  *
  * The second anchor gives the position of the points application point on the
  * local frame of the second rigid-body it is attached to.
  * @param {number} handle
  * @returns {RawVector}
  */
  jointAnchor2(handle: number): RawVector;
  /**
  * The first axis of this joint, if any.
  *
  * For joints where an application axis makes sense (e.g. the revolute and prismatic joins),
  * this returns the application axis on the first rigid-body this joint is attached to, expressed
  * in the local-space of this first rigid-body.
  * @param {number} handle
  * @returns {RawVector | undefined}
  */
  jointAxis1(handle: number): RawVector | undefined;
  /**
  * The second axis of this joint, if any.
  *
  * For joints where an application axis makes sense (e.g. the revolute and prismatic joins),
  * this returns the application axis on the second rigid-body this joint is attached to, expressed
  * in the local-space of this second rigid-body.
  * @param {number} handle
  * @returns {RawVector | undefined}
  */
  jointAxis2(handle: number): RawVector | undefined;
  /**
  * Are the limits for this joint enabled?
  * @param {number} handle
  * @returns {boolean}
  */
  jointLimitsEnabled(handle: number): boolean;
  /**
  * If this is a prismatic joint, returns its lower limit.
  * @param {number} handle
  * @returns {number}
  */
  jointLimitsMin(handle: number): number;
  /**
  * If this is a prismatic joint, returns its upper limit.
  * @param {number} handle
  * @returns {number}
  */
  jointLimitsMax(handle: number): number;
  /**
  * @param {number} handle
  * @param {number} model
  */
  jointConfigureMotorModel(handle: number, model: number): void;
  /**
  * @param {number} handle
  * @param {number} vx
  * @param {number} vy
  * @param {number} vz
  * @param {number} factor
  */
  jointConfigureBallMotorVelocity(handle: number, vx: number, vy: number, vz: number, factor: number): void;
  /**
  * @param {number} handle
  * @param {number} qw
  * @param {number} qx
  * @param {number} qy
  * @param {number} qz
  * @param {number} stiffness
  * @param {number} damping
  */
  jointConfigureBallMotorPosition(handle: number, qw: number, qx: number, qy: number, qz: number, stiffness: number, damping: number): void;
  /**
  * @param {number} handle
  * @param {number} qw
  * @param {number} qx
  * @param {number} qy
  * @param {number} qz
  * @param {number} vx
  * @param {number} vy
  * @param {number} vz
  * @param {number} stiffness
  * @param {number} damping
  */
  jointConfigureBallMotor(handle: number, qw: number, qx: number, qy: number, qz: number, vx: number, vy: number, vz: number, stiffness: number, damping: number): void;
  /**
  * @param {number} handle
  * @param {number} targetVel
  * @param {number} factor
  */
  jointConfigureUnitMotorVelocity(handle: number, targetVel: number, factor: number): void;
  /**
  * @param {number} handle
  * @param {number} targetPos
  * @param {number} stiffness
  * @param {number} damping
  */
  jointConfigureUnitMotorPosition(handle: number, targetPos: number, stiffness: number, damping: number): void;
  /**
  * @param {number} handle
  * @param {number} targetPos
  * @param {number} targetVel
  * @param {number} stiffness
  * @param {number} damping
  */
  jointConfigureUnitMotor(handle: number, targetPos: number, targetVel: number, stiffness: number, damping: number): void;
  /**
  */
  constructor();
  /**
  * @param {RawRigidBodySet} bodies
  * @param {RawJointParams} params
  * @param {number} parent1
  * @param {number} parent2
  * @returns {number}
  */
  createJoint(bodies: RawRigidBodySet, params: RawJointParams, parent1: number, parent2: number): number;
  /**
  * @param {number} handle
  * @param {RawIslandManager} islands
  * @param {RawRigidBodySet} bodies
  * @param {boolean} wakeUp
  */
  remove(handle: number, islands: RawIslandManager, bodies: RawRigidBodySet, wakeUp: boolean): void;
  /**
  * @returns {number}
  */
  len(): number;
  /**
  * @param {number} handle
  * @returns {boolean}
  */
  contains(handle: number): boolean;
  /**
  * Applies the given JavaScript function to the integer handle of each joint managed by this physics world.
  *
  * # Parameters
  * - `f(handle)`: the function to apply to the integer handle of each joint managed by this set. Called as `f(collider)`.
  * @param {Function} f
  */
  forEachJointHandle(f: Function): void;
}
/**
*/
export class RawNarrowPhase {
  free(): void;
  /**
  */
  constructor();
  /**
  * @param {number} handle1
  * @param {Function} f
  */
  contacts_with(handle1: number, f: Function): void;
  /**
  * @param {number} handle1
  * @param {number} handle2
  * @returns {RawContactPair | undefined}
  */
  contact_pair(handle1: number, handle2: number): RawContactPair | undefined;
  /**
  * @param {number} handle1
  * @param {Function} f
  */
  intersections_with(handle1: number, f: Function): void;
  /**
  * @param {number} handle1
  * @param {number} handle2
  * @returns {boolean}
  */
  intersection_pair(handle1: number, handle2: number): boolean;
}
/**
*/
export class RawPhysicsPipeline {
  free(): void;
  /**
  */
  constructor();
  /**
  * @param {RawVector} gravity
  * @param {RawIntegrationParameters} integrationParameters
  * @param {RawIslandManager} islands
  * @param {RawBroadPhase} broadPhase
  * @param {RawNarrowPhase} narrowPhase
  * @param {RawRigidBodySet} bodies
  * @param {RawColliderSet} colliders
  * @param {RawJointSet} joints
  * @param {RawCCDSolver} ccd_solver
  */
  step(gravity: RawVector, integrationParameters: RawIntegrationParameters, islands: RawIslandManager, broadPhase: RawBroadPhase, narrowPhase: RawNarrowPhase, bodies: RawRigidBodySet, colliders: RawColliderSet, joints: RawJointSet, ccd_solver: RawCCDSolver): void;
  /**
  * @param {RawVector} gravity
  * @param {RawIntegrationParameters} integrationParameters
  * @param {RawIslandManager} islands
  * @param {RawBroadPhase} broadPhase
  * @param {RawNarrowPhase} narrowPhase
  * @param {RawRigidBodySet} bodies
  * @param {RawColliderSet} colliders
  * @param {RawJointSet} joints
  * @param {RawCCDSolver} ccd_solver
  * @param {RawEventQueue} eventQueue
  * @param {object} hookObject
  * @param {Function} hookFilterContactPair
  * @param {Function} hookFilterIntersectionPair
  */
  stepWithEvents(gravity: RawVector, integrationParameters: RawIntegrationParameters, islands: RawIslandManager, broadPhase: RawBroadPhase, narrowPhase: RawNarrowPhase, bodies: RawRigidBodySet, colliders: RawColliderSet, joints: RawJointSet, ccd_solver: RawCCDSolver, eventQueue: RawEventQueue, hookObject: object, hookFilterContactPair: Function, hookFilterIntersectionPair: Function): void;
}
/**
*/
export class RawPointColliderProjection {
  free(): void;
  /**
  * @returns {number}
  */
  colliderHandle(): number;
  /**
  * @returns {RawVector}
  */
  point(): RawVector;
  /**
  * @returns {boolean}
  */
  isInside(): boolean;
}
/**
*/
export class RawQueryPipeline {
  free(): void;
  /**
  */
  constructor();
  /**
  * @param {RawIslandManager} islands
  * @param {RawRigidBodySet} bodies
  * @param {RawColliderSet} colliders
  */
  update(islands: RawIslandManager, bodies: RawRigidBodySet, colliders: RawColliderSet): void;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} rayOrig
  * @param {RawVector} rayDir
  * @param {number} maxToi
  * @param {boolean} solid
  * @param {number} groups
  * @returns {RawRayColliderToi | undefined}
  */
  castRay(colliders: RawColliderSet, rayOrig: RawVector, rayDir: RawVector, maxToi: number, solid: boolean, groups: number): RawRayColliderToi | undefined;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} rayOrig
  * @param {RawVector} rayDir
  * @param {number} maxToi
  * @param {boolean} solid
  * @param {number} groups
  * @returns {RawRayColliderIntersection | undefined}
  */
  castRayAndGetNormal(colliders: RawColliderSet, rayOrig: RawVector, rayDir: RawVector, maxToi: number, solid: boolean, groups: number): RawRayColliderIntersection | undefined;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} rayOrig
  * @param {RawVector} rayDir
  * @param {number} maxToi
  * @param {boolean} solid
  * @param {number} groups
  * @param {Function} callback
  */
  intersectionsWithRay(colliders: RawColliderSet, rayOrig: RawVector, rayDir: RawVector, maxToi: number, solid: boolean, groups: number, callback: Function): void;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} shapePos
  * @param {RawRotation} shapeRot
  * @param {RawShape} shape
  * @param {number} groups
  * @returns {number | undefined}
  */
  intersectionWithShape(colliders: RawColliderSet, shapePos: RawVector, shapeRot: RawRotation, shape: RawShape, groups: number): number | undefined;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} point
  * @param {boolean} solid
  * @param {number} groups
  * @returns {RawPointColliderProjection | undefined}
  */
  projectPoint(colliders: RawColliderSet, point: RawVector, solid: boolean, groups: number): RawPointColliderProjection | undefined;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} point
  * @param {number} groups
  * @param {Function} callback
  */
  intersectionsWithPoint(colliders: RawColliderSet, point: RawVector, groups: number, callback: Function): void;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} shapePos
  * @param {RawRotation} shapeRot
  * @param {RawVector} shapeVel
  * @param {RawShape} shape
  * @param {number} maxToi
  * @param {number} groups
  * @returns {RawShapeColliderTOI | undefined}
  */
  castShape(colliders: RawColliderSet, shapePos: RawVector, shapeRot: RawRotation, shapeVel: RawVector, shape: RawShape, maxToi: number, groups: number): RawShapeColliderTOI | undefined;
  /**
  * @param {RawColliderSet} colliders
  * @param {RawVector} shapePos
  * @param {RawRotation} shapeRot
  * @param {RawShape} shape
  * @param {number} groups
  * @param {Function} callback
  */
  intersectionsWithShape(colliders: RawColliderSet, shapePos: RawVector, shapeRot: RawRotation, shape: RawShape, groups: number, callback: Function): void;
  /**
  * @param {RawVector} aabbCenter
  * @param {RawVector} aabbHalfExtents
  * @param {Function} callback
  */
  collidersWithAabbIntersectingAabb(aabbCenter: RawVector, aabbHalfExtents: RawVector, callback: Function): void;
}
/**
*/
export class RawRayColliderIntersection {
  free(): void;
  /**
  * @returns {number}
  */
  colliderHandle(): number;
  /**
  * @returns {RawVector}
  */
  normal(): RawVector;
  /**
  * @returns {number}
  */
  toi(): number;
}
/**
*/
export class RawRayColliderToi {
  free(): void;
  /**
  * @returns {number}
  */
  colliderHandle(): number;
  /**
  * @returns {number}
  */
  toi(): number;
}
/**
*/
export class RawRigidBodySet {
  free(): void;
  /**
  * The world-space translation of this rigid-body.
  * @param {number} handle
  * @returns {RawVector}
  */
  rbTranslation(handle: number): RawVector;
  /**
  * The world-space orientation of this rigid-body.
  * @param {number} handle
  * @returns {RawRotation}
  */
  rbRotation(handle: number): RawRotation;
  /**
  * Put the given rigid-body to sleep.
  * @param {number} handle
  */
  rbSleep(handle: number): void;
  /**
  * Is this rigid-body sleeping?
  * @param {number} handle
  * @returns {boolean}
  */
  rbIsSleeping(handle: number): boolean;
  /**
  * Is the velocity of this rigid-body not zero?
  * @param {number} handle
  * @returns {boolean}
  */
  rbIsMoving(handle: number): boolean;
  /**
  * The world-space predicted translation of this rigid-body.
  *
  * If this rigid-body is kinematic this value is set by the `setNextKinematicTranslation`
  * method and is used for estimating the kinematic body velocity at the next timestep.
  * For non-kinematic bodies, this value is currently unspecified.
  * @param {number} handle
  * @returns {RawVector}
  */
  rbNextTranslation(handle: number): RawVector;
  /**
  * The world-space predicted orientation of this rigid-body.
  *
  * If this rigid-body is kinematic this value is set by the `setNextKinematicRotation`
  * method and is used for estimating the kinematic body velocity at the next timestep.
  * For non-kinematic bodies, this value is currently unspecified.
  * @param {number} handle
  * @returns {RawRotation}
  */
  rbNextRotation(handle: number): RawRotation;
  /**
  * Sets the translation of this rigid-body.
  *
  * # Parameters
  * - `x`: the world-space position of the rigid-body along the `x` axis.
  * - `y`: the world-space position of the rigid-body along the `y` axis.
  * - `z`: the world-space position of the rigid-body along the `z` axis.
  * - `wakeUp`: forces the rigid-body to wake-up so it is properly affected by forces if it
  * wasn't moving before modifying its position.
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  * @param {boolean} wakeUp
  */
  rbSetTranslation(handle: number, x: number, y: number, z: number, wakeUp: boolean): void;
  /**
  * Sets the rotation quaternion of this rigid-body.
  *
  * This does nothing if a zero quaternion is provided.
  *
  * # Parameters
  * - `x`: the first vector component of the quaternion.
  * - `y`: the second vector component of the quaternion.
  * - `z`: the third vector component of the quaternion.
  * - `w`: the scalar component of the quaternion.
  * - `wakeUp`: forces the rigid-body to wake-up so it is properly affected by forces if it
  * wasn't moving before modifying its position.
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  * @param {number} w
  * @param {boolean} wakeUp
  */
  rbSetRotation(handle: number, x: number, y: number, z: number, w: number, wakeUp: boolean): void;
  /**
  * Sets the linear velocity of this rigid-body.
  * @param {number} handle
  * @param {RawVector} linvel
  * @param {boolean} wakeUp
  */
  rbSetLinvel(handle: number, linvel: RawVector, wakeUp: boolean): void;
  /**
  * Sets the angular velocity of this rigid-body.
  * @param {number} handle
  * @param {RawVector} angvel
  * @param {boolean} wakeUp
  */
  rbSetAngvel(handle: number, angvel: RawVector, wakeUp: boolean): void;
  /**
  * If this rigid body is kinematic, sets its future translation after the next timestep integration.
  *
  * This should be used instead of `rigidBody.setTranslation` to make the dynamic object
  * interacting with this kinematic body behave as expected. Internally, Rapier will compute
  * an artificial velocity for this rigid-body from its current position and its next kinematic
  * position. This velocity will be used to compute forces on dynamic bodies interacting with
  * this body.
  *
  * # Parameters
  * - `x`: the world-space position of the rigid-body along the `x` axis.
  * - `y`: the world-space position of the rigid-body along the `y` axis.
  * - `z`: the world-space position of the rigid-body along the `z` axis.
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  */
  rbSetNextKinematicTranslation(handle: number, x: number, y: number, z: number): void;
  /**
  * If this rigid body is kinematic, sets its future rotation after the next timestep integration.
  *
  * This should be used instead of `rigidBody.setRotation` to make the dynamic object
  * interacting with this kinematic body behave as expected. Internally, Rapier will compute
  * an artificial velocity for this rigid-body from its current position and its next kinematic
  * position. This velocity will be used to compute forces on dynamic bodies interacting with
  * this body.
  *
  * # Parameters
  * - `x`: the first vector component of the quaternion.
  * - `y`: the second vector component of the quaternion.
  * - `z`: the third vector component of the quaternion.
  * - `w`: the scalar component of the quaternion.
  * @param {number} handle
  * @param {number} x
  * @param {number} y
  * @param {number} z
  * @param {number} w
  */
  rbSetNextKinematicRotation(handle: number, x: number, y: number, z: number, w: number): void;
  /**
  * The linear velocity of this rigid-body.
  * @param {number} handle
  * @returns {RawVector}
  */
  rbLinvel(handle: number): RawVector;
  /**
  * The angular velocity of this rigid-body.
  * @param {number} handle
  * @returns {RawVector}
  */
  rbAngvel(handle: number): RawVector;
  /**
  * @param {number} handle
  * @param {boolean} locked
  * @param {boolean} wake_up
  */
  rbLockTranslations(handle: number, locked: boolean, wake_up: boolean): void;
  /**
  * @param {number} handle
  * @param {boolean} locked
  * @param {boolean} wake_up
  */
  rbLockRotations(handle: number, locked: boolean, wake_up: boolean): void;
  /**
  * @param {number} handle
  * @param {boolean} allow_x
  * @param {boolean} allow_y
  * @param {boolean} allow_z
  * @param {boolean} wake_up
  */
  rbRestrictRotations(handle: number, allow_x: boolean, allow_y: boolean, allow_z: boolean, wake_up: boolean): void;
  /**
  * @param {number} handle
  * @returns {number}
  */
  rbDominanceGroup(handle: number): number;
  /**
  * @param {number} handle
  * @param {number} group
  */
  rbSetDominanceGroup(handle: number, group: number): void;
  /**
  * @param {number} handle
  * @param {boolean} enabled
  */
  rbEnableCcd(handle: number, enabled: boolean): void;
  /**
  * The mass of this rigid-body.
  * @param {number} handle
  * @returns {number}
  */
  rbMass(handle: number): number;
  /**
  * Wakes this rigid-body up.
  *
  * A dynamic rigid-body that does not move during several consecutive frames will
  * be put to sleep by the physics engine, i.e., it will stop being simulated in order
  * to avoid useless computations.
  * This methods forces a sleeping rigid-body to wake-up. This is useful, e.g., before modifying
  * the position of a dynamic body so that it is properly simulated afterwards.
  * @param {number} handle
  */
  rbWakeUp(handle: number): void;
  /**
  * Is Continuous Collision Detection enabled for this rigid-body?
  * @param {number} handle
  * @returns {boolean}
  */
  rbIsCcdEnabled(handle: number): boolean;
  /**
  * The number of colliders attached to this rigid-body.
  * @param {number} handle
  * @returns {number}
  */
  rbNumColliders(handle: number): number;
  /**
  * Retrieves the `i-th` collider attached to this rigid-body.
  *
  * # Parameters
  * - `at`: The index of the collider to retrieve. Must be a number in `[0, this.numColliders()[`.
  *         This index is **not** the same as the unique identifier of the collider.
  * @param {number} handle
  * @param {number} at
  * @returns {number}
  */
  rbCollider(handle: number, at: number): number;
  /**
  * The status of this rigid-body: static, dynamic, or kinematic.
  * @param {number} handle
  * @returns {number}
  */
  rbBodyType(handle: number): number;
  /**
  * Is this rigid-body static?
  * @param {number} handle
  * @returns {boolean}
  */
  rbIsStatic(handle: number): boolean;
  /**
  * Is this rigid-body kinematic?
  * @param {number} handle
  * @returns {boolean}
  */
  rbIsKinematic(handle: number): boolean;
  /**
  * Is this rigid-body dynamic?
  * @param {number} handle
  * @returns {boolean}
  */
  rbIsDynamic(handle: number): boolean;
  /**
  * The linear damping coefficient of this rigid-body.
  * @param {number} handle
  * @returns {number}
  */
  rbLinearDamping(handle: number): number;
  /**
  * The angular damping coefficient of this rigid-body.
  * @param {number} handle
  * @returns {number}
  */
  rbAngularDamping(handle: number): number;
  /**
  * @param {number} handle
  * @param {number} factor
  */
  rbSetLinearDamping(handle: number, factor: number): void;
  /**
  * @param {number} handle
  * @param {number} factor
  */
  rbSetAngularDamping(handle: number, factor: number): void;
  /**
  * @param {number} handle
  * @returns {number}
  */
  rbGravityScale(handle: number): number;
  /**
  * @param {number} handle
  * @param {number} factor
  * @param {boolean} wakeUp
  */
  rbSetGravityScale(handle: number, factor: number, wakeUp: boolean): void;
  /**
  * Applies a force at the center-of-mass of this rigid-body.
  *
  * # Parameters
  * - `force`: the world-space force to apply on the rigid-body.
  * - `wakeUp`: should the rigid-body be automatically woken-up?
  * @param {number} handle
  * @param {RawVector} force
  * @param {boolean} wakeUp
  */
  rbApplyForce(handle: number, force: RawVector, wakeUp: boolean): void;
  /**
  * Applies an impulse at the center-of-mass of this rigid-body.
  *
  * # Parameters
  * - `impulse`: the world-space impulse to apply on the rigid-body.
  * - `wakeUp`: should the rigid-body be automatically woken-up?
  * @param {number} handle
  * @param {RawVector} impulse
  * @param {boolean} wakeUp
  */
  rbApplyImpulse(handle: number, impulse: RawVector, wakeUp: boolean): void;
  /**
  * Applies a torque at the center-of-mass of this rigid-body.
  *
  * # Parameters
  * - `torque`: the world-space torque to apply on the rigid-body.
  * - `wakeUp`: should the rigid-body be automatically woken-up?
  * @param {number} handle
  * @param {RawVector} torque
  * @param {boolean} wakeUp
  */
  rbApplyTorque(handle: number, torque: RawVector, wakeUp: boolean): void;
  /**
  * Applies an impulsive torque at the center-of-mass of this rigid-body.
  *
  * # Parameters
  * - `torque impulse`: the world-space torque impulse to apply on the rigid-body.
  * - `wakeUp`: should the rigid-body be automatically woken-up?
  * @param {number} handle
  * @param {RawVector} torque_impulse
  * @param {boolean} wakeUp
  */
  rbApplyTorqueImpulse(handle: number, torque_impulse: RawVector, wakeUp: boolean): void;
  /**
  * Applies a force at the given world-space point of this rigid-body.
  *
  * # Parameters
  * - `force`: the world-space force to apply on the rigid-body.
  * - `point`: the world-space point where the impulse is to be applied on the rigid-body.
  * - `wakeUp`: should the rigid-body be automatically woken-up?
  * @param {number} handle
  * @param {RawVector} force
  * @param {RawVector} point
  * @param {boolean} wakeUp
  */
  rbApplyForceAtPoint(handle: number, force: RawVector, point: RawVector, wakeUp: boolean): void;
  /**
  * Applies an impulse at the given world-space point of this rigid-body.
  *
  * # Parameters
  * - `impulse`: the world-space impulse to apply on the rigid-body.
  * - `point`: the world-space point where the impulse is to be applied on the rigid-body.
  * - `wakeUp`: should the rigid-body be automatically woken-up?
  * @param {number} handle
  * @param {RawVector} impulse
  * @param {RawVector} point
  * @param {boolean} wakeUp
  */
  rbApplyImpulseAtPoint(handle: number, impulse: RawVector, point: RawVector, wakeUp: boolean): void;
  /**
  */
  constructor();
  /**
  * @param {RawVector} translation
  * @param {RawRotation} rotation
  * @param {number} gravityScale
  * @param {number} mass
  * @param {boolean} translationsEnabled
  * @param {RawVector} centerOfMass
  * @param {RawVector} linvel
  * @param {RawVector} angvel
  * @param {RawVector} principalAngularInertia
  * @param {RawRotation} angularInertiaFrame
  * @param {boolean} rotationEnabledX
  * @param {boolean} rotationEnabledY
  * @param {boolean} rotationEnabledZ
  * @param {number} linearDamping
  * @param {number} angularDamping
  * @param {number} rb_type
  * @param {boolean} canSleep
  * @param {boolean} ccdEnabled
  * @param {number} dominanceGroup
  * @returns {number}
  */
  createRigidBody(translation: RawVector, rotation: RawRotation, gravityScale: number, mass: number, translationsEnabled: boolean, centerOfMass: RawVector, linvel: RawVector, angvel: RawVector, principalAngularInertia: RawVector, angularInertiaFrame: RawRotation, rotationEnabledX: boolean, rotationEnabledY: boolean, rotationEnabledZ: boolean, linearDamping: number, angularDamping: number, rb_type: number, canSleep: boolean, ccdEnabled: boolean, dominanceGroup: number): number;
  /**
  * @param {number} handle
  * @param {RawIslandManager} islands
  * @param {RawColliderSet} colliders
  * @param {RawJointSet} joints
  */
  remove(handle: number, islands: RawIslandManager, colliders: RawColliderSet, joints: RawJointSet): void;
  /**
  * The number of rigid-bodies on this set.
  * @returns {number}
  */
  len(): number;
  /**
  * Checks if a rigid-body with the given integer handle exists.
  * @param {number} handle
  * @returns {boolean}
  */
  contains(handle: number): boolean;
  /**
  * Applies the given JavaScript function to the integer handle of each rigid-body managed by this set.
  *
  * # Parameters
  * - `f(handle)`: the function to apply to the integer handle of each rigid-body managed by this set. Called as `f(collider)`.
  * @param {Function} f
  */
  forEachRigidBodyHandle(f: Function): void;
}
/**
* A rotation quaternion.
*/
export class RawRotation {
  free(): void;
  /**
  * @param {number} x
  * @param {number} y
  * @param {number} z
  * @param {number} w
  */
  constructor(x: number, y: number, z: number, w: number);
  /**
  * The identity quaternion.
  * @returns {RawRotation}
  */
  static identity(): RawRotation;
  /**
  * The `w` component of this quaternion.
  * @returns {number}
  */
  readonly w: number;
  /**
  * The `x` component of this quaternion.
  * @returns {number}
  */
  readonly x: number;
  /**
  * The `y` component of this quaternion.
  * @returns {number}
  */
  readonly y: number;
  /**
  * The `z` component of this quaternion.
  * @returns {number}
  */
  readonly z: number;
}
/**
*/
export class RawSerializationPipeline {
  free(): void;
  /**
  */
  constructor();
  /**
  * @param {RawVector} gravity
  * @param {RawIntegrationParameters} integrationParameters
  * @param {RawIslandManager} islands
  * @param {RawBroadPhase} broadPhase
  * @param {RawNarrowPhase} narrowPhase
  * @param {RawRigidBodySet} bodies
  * @param {RawColliderSet} colliders
  * @param {RawJointSet} joints
  * @returns {Uint8Array | undefined}
  */
  serializeAll(gravity: RawVector, integrationParameters: RawIntegrationParameters, islands: RawIslandManager, broadPhase: RawBroadPhase, narrowPhase: RawNarrowPhase, bodies: RawRigidBodySet, colliders: RawColliderSet, joints: RawJointSet): Uint8Array | undefined;
  /**
  * @param {Uint8Array} data
  * @returns {RawDeserializedWorld | undefined}
  */
  deserializeAll(data: Uint8Array): RawDeserializedWorld | undefined;
}
/**
*/
export class RawShape {
  free(): void;
  /**
  * @param {number} hx
  * @param {number} hy
  * @param {number} hz
  * @returns {RawShape}
  */
  static cuboid(hx: number, hy: number, hz: number): RawShape;
  /**
  * @param {number} hx
  * @param {number} hy
  * @param {number} hz
  * @param {number} borderRadius
  * @returns {RawShape}
  */
  static roundCuboid(hx: number, hy: number, hz: number, borderRadius: number): RawShape;
  /**
  * @param {number} radius
  * @returns {RawShape}
  */
  static ball(radius: number): RawShape;
  /**
  * @param {number} halfHeight
  * @param {number} radius
  * @returns {RawShape}
  */
  static capsule(halfHeight: number, radius: number): RawShape;
  /**
  * @param {number} halfHeight
  * @param {number} radius
  * @returns {RawShape}
  */
  static cylinder(halfHeight: number, radius: number): RawShape;
  /**
  * @param {number} halfHeight
  * @param {number} radius
  * @param {number} borderRadius
  * @returns {RawShape}
  */
  static roundCylinder(halfHeight: number, radius: number, borderRadius: number): RawShape;
  /**
  * @param {number} halfHeight
  * @param {number} radius
  * @returns {RawShape}
  */
  static cone(halfHeight: number, radius: number): RawShape;
  /**
  * @param {number} halfHeight
  * @param {number} radius
  * @param {number} borderRadius
  * @returns {RawShape}
  */
  static roundCone(halfHeight: number, radius: number, borderRadius: number): RawShape;
  /**
  * @param {Float32Array} vertices
  * @param {Uint32Array} indices
  * @returns {RawShape}
  */
  static polyline(vertices: Float32Array, indices: Uint32Array): RawShape;
  /**
  * @param {Float32Array} vertices
  * @param {Uint32Array} indices
  * @returns {RawShape}
  */
  static trimesh(vertices: Float32Array, indices: Uint32Array): RawShape;
  /**
  * @param {number} nrows
  * @param {number} ncols
  * @param {Float32Array} heights
  * @param {RawVector} scale
  * @returns {RawShape}
  */
  static heightfield(nrows: number, ncols: number, heights: Float32Array, scale: RawVector): RawShape;
  /**
  * @param {RawVector} p1
  * @param {RawVector} p2
  * @returns {RawShape}
  */
  static segment(p1: RawVector, p2: RawVector): RawShape;
  /**
  * @param {RawVector} p1
  * @param {RawVector} p2
  * @param {RawVector} p3
  * @returns {RawShape}
  */
  static triangle(p1: RawVector, p2: RawVector, p3: RawVector): RawShape;
  /**
  * @param {RawVector} p1
  * @param {RawVector} p2
  * @param {RawVector} p3
  * @param {number} borderRadius
  * @returns {RawShape}
  */
  static roundTriangle(p1: RawVector, p2: RawVector, p3: RawVector, borderRadius: number): RawShape;
  /**
  * @param {Float32Array} points
  * @returns {RawShape | undefined}
  */
  static convexHull(points: Float32Array): RawShape | undefined;
  /**
  * @param {Float32Array} points
  * @param {number} borderRadius
  * @returns {RawShape | undefined}
  */
  static roundConvexHull(points: Float32Array, borderRadius: number): RawShape | undefined;
  /**
  * @param {Float32Array} vertices
  * @param {Uint32Array} indices
  * @returns {RawShape | undefined}
  */
  static convexMesh(vertices: Float32Array, indices: Uint32Array): RawShape | undefined;
  /**
  * @param {Float32Array} vertices
  * @param {Uint32Array} indices
  * @param {number} borderRadius
  * @returns {RawShape | undefined}
  */
  static roundConvexMesh(vertices: Float32Array, indices: Uint32Array, borderRadius: number): RawShape | undefined;
}
/**
*/
export class RawShapeColliderTOI {
  free(): void;
  /**
  * @returns {number}
  */
  colliderHandle(): number;
  /**
  * @returns {number}
  */
  toi(): number;
  /**
  * @returns {RawVector}
  */
  witness1(): RawVector;
  /**
  * @returns {RawVector}
  */
  witness2(): RawVector;
  /**
  * @returns {RawVector}
  */
  normal1(): RawVector;
  /**
  * @returns {RawVector}
  */
  normal2(): RawVector;
}
/**
* A vector.
*/
export class RawVector {
  free(): void;
  /**
  * Creates a new vector filled with zeros.
  * @returns {RawVector}
  */
  static zero(): RawVector;
  /**
  * Creates a new 3D vector from its two components.
  *
  * # Parameters
  * - `x`: the `x` component of this 3D vector.
  * - `y`: the `y` component of this 3D vector.
  * - `z`: the `z` component of this 3D vector.
  * @param {number} x
  * @param {number} y
  * @param {number} z
  */
  constructor(x: number, y: number, z: number);
  /**
  * Create a new 3D vector from this vector with its components rearranged as `{x, y, z}`.
  *
  * This will effectively return a copy of `this`. This method exist for completeness with the
  * other swizzling functions.
  * @returns {RawVector}
  */
  xyz(): RawVector;
  /**
  * Create a new 3D vector from this vector with its components rearranged as `{y, x, z}`.
  * @returns {RawVector}
  */
  yxz(): RawVector;
  /**
  * Create a new 3D vector from this vector with its components rearranged as `{z, x, y}`.
  * @returns {RawVector}
  */
  zxy(): RawVector;
  /**
  * Create a new 3D vector from this vector with its components rearranged as `{x, z, y}`.
  * @returns {RawVector}
  */
  xzy(): RawVector;
  /**
  * Create a new 3D vector from this vector with its components rearranged as `{y, z, x}`.
  * @returns {RawVector}
  */
  yzx(): RawVector;
  /**
  * Create a new 3D vector from this vector with its components rearranged as `{z, y, x}`.
  * @returns {RawVector}
  */
  zyx(): RawVector;
  /**
  * The `x` component of this vector.
  * @returns {number}
  */
  x: number;
  /**
  * The `y` component of this vector.
  * @returns {number}
  */
  y: number;
  /**
  * The `z` component of this vector.
  * @returns {number}
  */
  z: number;
}

