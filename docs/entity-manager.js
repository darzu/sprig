import { hashCode } from "./util.js";
export class EntityManager {
    constructor() {
        this.entities = new Map();
        this.systems = [];
        this.components = new Map();
        this.serializers = new Map();
        this.ranges = {};
        this.defaultRange = "";
        this.entities.set(0, { id: 0 });
    }
    defineComponent(name, construct) {
        const id = hashCode(name);
        if (this.components.has(id)) {
            throw `Component with name ${name} already defined--hash collision?`;
        }
        const component = {
            name,
            construct,
            id,
            isOn: (e) => name in e,
        };
        this.components.set(id, component);
        return component;
    }
    checkComponent(def) {
        if (!this.components.has(def.id))
            throw `Component ${def.name} (id ${def.id}) not found`;
        if (this.components.get(def.id).name !== def.name)
            throw `Component id ${def.id} has name ${this.components.get(def.id).name}, not ${def.name}`;
    }
    registerSerializerPair(def, serialize, deserialize) {
        this.serializers.set(def.id, { serialize, deserialize });
    }
    serialize(id, componentId, buf) {
        const def = this.components.get(componentId);
        if (!def)
            throw `Trying to serialize unknown component id ${componentId}`;
        const entity = this.findEntity(id, [def]);
        if (!entity)
            throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
        const serializerPair = this.serializers.get(componentId);
        if (!serializerPair)
            throw `No serializer for component ${def.name} (for entity ${id})`;
        serializerPair.serialize(entity[def.name], buf);
    }
    deserialize(id, componentId, buf) {
        const def = this.components.get(componentId);
        if (!def)
            throw `Trying to deserialize unknown component id ${componentId}`;
        if (!this.hasEntity(id)) {
            throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
        }
        let entity = this.findEntity(id, [def]);
        let component;
        if (!entity) {
            component = this.addComponent(id, def);
        }
        else {
            component = entity[def.name];
        }
        const serializerPair = this.serializers.get(componentId);
        if (!serializerPair)
            throw `No deserializer for component ${def.name} (for entity ${id})`;
        serializerPair.deserialize(component, buf);
    }
    setDefaultRange(rangeName) {
        this.defaultRange = rangeName;
    }
    setIdRange(rangeName, nextId, maxId) {
        this.ranges[rangeName] = { nextId, maxId };
    }
    // TODO(@darzu): dont return the entity!
    newEntity(rangeName) {
        if (rangeName === undefined)
            rangeName = this.defaultRange;
        const range = this.ranges[rangeName];
        if (!range) {
            throw `Entity manager has no ID range (range specifier is ${rangeName})`;
        }
        if (range.nextId >= range.maxId)
            throw `EntityManager has exceeded its id range!`;
        const e = { id: range.nextId++ };
        this.entities.set(e.id, e);
        return e;
    }
    registerEntity(id) {
        if (id in this.entities)
            throw `EntityManager already has id ${id}!`;
        /* TODO: should we do the check below but for all ranges?
        if (this.nextId <= id && id < this.maxId)
        throw `EntityManager cannot register foreign ids inside its local range; ${this.nextId} <= ${id} && ${id} < ${this.maxId}!`;
        */
        const e = { id: id };
        this.entities.set(e.id, e);
        return e;
    }
    addComponent(id, def, ...args) {
        this.checkComponent(def);
        if (id === 0)
            throw `hey, use addSingletonComponent!`;
        const c = def.construct(...args);
        const e = this.entities.get(id);
        if (def.name in e)
            throw `double defining component ${def.name} on ${e.id}!`;
        e[def.name] = c;
        return c;
    }
    addSingletonComponent(def, ...args) {
        this.checkComponent(def);
        const c = def.construct(...args);
        const e = this.entities.get(0);
        if (def.name in e)
            throw `double defining singleton component ${def.name} on ${e.id}!`;
        e[def.name] = c;
        return c;
    }
    removeSingletonComponent(def) {
        const e = this.entities.get(0);
        if (def.name in e) {
            delete e[def.name];
        }
        else {
            throw `Tried to remove absent singleton component ${def.name}`;
        }
    }
    // TODO(@darzu): should this be public??
    // TODO(@darzu): rename to findSingletonComponent
    findSingletonEntity(c) {
        const e = this.entities.get(0);
        if (c.name in e) {
            return e;
        }
        return undefined;
    }
    hasEntity(id) {
        return this.entities.has(id);
    }
    hasComponents(e, cs) {
        return cs.every((c) => c.name in e);
    }
    findEntity(id, cs) {
        const e = this.entities.get(id);
        if (e && !cs.every((c) => c.name in e)) {
            return undefined;
        }
        return e;
    }
    findEntitySet(...es) {
        const res = [];
        for (let [id, ...cs] of es) {
            res.push(this.findEntity(id, cs));
        }
        return res;
    }
    filterEntities(cs) {
        const res = [];
        if (cs === null)
            return res;
        for (let e of this.entities.values()) {
            if (cs.every((c) => c.name in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    filterEntitiesByKey(cs) {
        console.log("filterEntitiesByKey called--should only be called from console");
        const res = [];
        for (let e of this.entities.values()) {
            if (cs.every((c) => c in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    registerSystem(cs, rs, callback) {
        this.systems.push({
            cs,
            rs,
            callback,
        });
    }
    callSystems() {
        // dispatch to all the systems
        for (let s of this.systems) {
            const es = this.filterEntities(s.cs);
            let haveAllResources = true;
            for (let r of s.rs) {
                // note this is just to verify it exists
                haveAllResources && (haveAllResources = !!this.findSingletonEntity(r));
            }
            if (haveAllResources) {
                s.callback(es, this.entities.get(0));
            }
        }
    }
}
// TODO(@darzu): where to put this?
export const EM = new EntityManager();
window.EM = EM;
//# sourceMappingURL=entity-manager.js.map