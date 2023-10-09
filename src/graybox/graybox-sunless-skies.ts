/*
# of Sessions: 2

SKETCH:

environment
  world plane
docks
ship
pirates

gameplay:
  front cannon
  docking
    slide into dock
  trade goods
    each dock randomly generates trade missions with timers,
    each dock restocks temp trade goods w/ timer,
    each dock has a set of reliable resource forever, but more expensive,
  upgrades:
    broadside cannons
    relative tracking
    thruster speed
  world danger:
    enemy ships have headlights and smoke trails,
      gives you a heads up when u might encounter them
    graph of possible enemy travel
      enemies pick random new location to travel to
      dead enemies respawn after X seconds
  enemy AI:
    moves toward destination by picking random point on circle in radius R of destination
      draw line from here to there, if unobstructed, that is the path
      waits for velocity drift to near zero before aiming and moving
    aggro bubble
      pulls enemy cluster
    enemy moves toward player
      goal is to be within X distance + facing the player
      shoots when it can
    periodically adjusts to look at the player
      has a %chance of looking aiming correctly
        takes into account velocity (not accel)
        chance is worse as velocity increases
      longer the player stays still, more likely they'll be looking at the player
      if player is moving, chance are much lower
    fires when it's roughly looking at the player, every N seconds + fudge
    occassionally strafes before aiming
    movement is based on target radius from player
      aims toward nearest unobstructed point on circle and moves toward
    flees at Z% health

    

PSEUDO CODE:

init:
  initEnvironment
  initShip
  initShipVsShip
  initDocks
  initTradeRoutes

initEnvironment:
  createWalls
  createDocks
  spawnEnemies

initShip:
  setRenderable
  setPosition
  setVelocity
  setShipHeat
  
  on update:
    // move
    accel = f(inputs, shipHeat)
      // strafe costs heat
      // boost costs heat
    vel += accel
    vel -= dampening(vel)
  
  on spacebar:
    // try fire
    kickBack

initShipVsShip:
  on collision(shipA, shipB):
    dmg(shipA)
    dmg(shipB)
    pushBack(shipA)
    pushBack(shipB)

  on collision(ship, bullet)
    dmg(ship)
    pushBack(ship)
    delete(bullet)
  
initDocks:
  for each dock pos:
    createDock

  


    
*/
