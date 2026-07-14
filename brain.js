import fs from "fs";

// unshift for lpush that is adding element in front of the list and
// .push is for right push
// list.shift() this means removing elest from left that is
// the removal of the first element

const AOF_FILE = process.env.MINI_REDIS_AOF || "database.aof";

const store = new Map();
const expiries = new Map();

function wrongType() {
    return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
}

function appendCommand(parts) {
    fs.appendFileSync(AOF_FILE, JSON.stringify(parts) + "\n");
}

function expireIfNeeded(key) {
    if (!expiries.has(key)) {
        return false;
    }

    if (Date.now() <= expiries.get(key)) {
        return false;
    }

    store.delete(key);
    expiries.delete(key);
    return true;
}

function getValue(key) {
    expireIfNeeded(key);
    return store.get(key);
}

function keyExists(key) {
    expireIfNeeded(key);
    return store.has(key);
}

function sweepExpiredKeys() {
    const now = Date.now();
    for (const [key, deathTime] of expiries.entries()) {
        if (now > deathTime) {
            store.delete(key);
            expiries.delete(key);
            console.log(`shady bhai swept away dead key: ${key}`);
        }
    }
}

function parse(input) {
    if (!input || input.length == 0) {
        return null;
    }
    return {
        command: String(input[0]).toUpperCase(),
        key: input[1],
        val: input[2],
        length: input.length
    };
}

function isIntegerString(value) {
    return /^-?\d+$/.test(String(value));
}

function getList(key) {
    const list = getValue(key);
    if (list === undefined) {
        return null;
    }
    if (!Array.isArray(list)) {
        return wrongType();
    }
    return list;
}

function getHash(key) {
    const hash = getValue(key);
    if (hash === undefined) {
        return null;
    }
    if (!(hash instanceof Map)) {
        return wrongType();
    }
    return hash;
}

function getSet(key) {
    const setObj = getValue(key);
    if (setObj === undefined) {
        return null;
    }
    if (!(setObj instanceof Set)) {
        return wrongType();
    }
    return setObj;
}

function normalizeRange(start, stop, size) {
    let left = start;
    let right = stop;

    if (left < 0) {
        left = size + left;
    }
    if (right < 0) {
        right = size + right;
    }

    if (left < 0) {
        left = 0;
    }
    if (right >= size) {
        right = size - 1;
    }

    if (size == 0 || left >= size || right < 0 || left > right) {
        return [];
    }

    return [left, right];
}

function ensureList(key) {
    if (!keyExists(key)) {
        store.set(key, []);
    }

    const list = store.get(key);
    if (!Array.isArray(list)) {
        return wrongType();
    }

    return list;
}

function ensureHash(key) {
    if (!keyExists(key)) {
        store.set(key, new Map());
    }

    const hash = store.get(key);
    if (!(hash instanceof Map)) {
        return wrongType();
    }

    return hash;
}

function ensureSet(key) {
    if (!keyExists(key)) {
        store.set(key, new Set());
    }

    const setObj = store.get(key);
    if (!(setObj instanceof Set)) {
        return wrongType();
    }

    return setObj;
}

function commandFromOldAofLine(line) {
    const parts = line.split(" ");
    return parts.filter((part) => part.length > 0);
}

function commandFromAofLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith("[")) {
        return JSON.parse(trimmed);
    }

    return commandFromOldAofLine(trimmed);
}

function loadAof() {
    if (!fs.existsSync(AOF_FILE)) {
        return;
    }

    const fileData = fs.readFileSync(AOF_FILE, "utf8");
    const lines = fileData.split("\n");

    for (const line of lines) {
        if (!line.trim()) {
            continue;
        }

        try {
            const command = commandFromAofLine(line);
            if (command) {
                handl(command, { persist: false });
            }
        } catch {
            console.log("shady found one bad AOF line and skipped it");
        }
    }

    sweepExpiredKeys();
    console.log("yeah shady ne memory recover kar di");
}

function handl(input, options = {}) {
    const persist = options.persist !== false;
    const parsed = parse(input);
    if (parsed == null) {
        return "ERROR empty command beta";
    }
    
    const command = parsed.command;
    const key = parsed.key;
    const val = parsed.val;
    const length = parsed.length;
    
    if (command == "PING") {
        if (length == 1) {
            return "PONG";
        }
        if (length == 2) {
            return key;
        }
        return "ERROR wrong number of arguments";
    }

    if (command == "COMMAND") {
        return [];
    }

    if (command == "SET") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }

        store.set(key, val);
        expiries.delete(key);

        if (persist) {
            appendCommand([command, key, val]);
        }

        return "OK";
    } 
    else if (command == "GET") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        const data = getValue(key);
        if (data === undefined) {
            return null;
        }
        if (typeof data != "string") {
            return wrongType();
        }

        return data;
    } 
    else if (command == "INCR") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        const curr = getValue(key);
        if (curr !== undefined && typeof curr != "string") {
            return wrongType();
        }

        const numText = curr ?? "0";
        if (!isIntegerString(numText)) {
            return "ERROR value is not an integer or out of range";
        }

        const next = Number(numText) + 1;
        store.set(key, String(next));

        if (persist) {
            appendCommand([command, key]);
        }

        return next;
    }
    else if (command == "DEL") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        expireIfNeeded(key);
        const deleted = store.delete(key);
        expiries.delete(key);

        if (deleted && persist) {
            appendCommand([command, key]);
        }

        if (deleted) {
            return 1;
        }
        return 0;
    } 
    else if (command == "EXISTS") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        if (keyExists(key)) {
            return 1;
        } else {
            return 0;
        }
    }
    else if (command == "EXPIRE") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }

        if (!keyExists(key)) {
            return 0;
        }

        const seconds = Number(val);
        if (!isIntegerString(val)) {
            return "ERROR seconds must be an integer";
        }

        if (seconds <= 0) {
            store.delete(key);
            expiries.delete(key);
            if (persist) {
                appendCommand(["DEL", key]);
            }
            return 1;
        }

        const deathTime = Date.now() + (seconds * 1000);
        expiries.set(key, deathTime);

        if (persist) {
            appendCommand(["PEXPIREAT", key, String(deathTime)]);
        }

        return 1;
    }
    else if (command == "PEXPIREAT") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }

        if (!keyExists(key)) {
            return 0;
        }

        const deathTime = Number(val);
        if (!isIntegerString(val)) {
            return "ERROR unix time must be an integer";
        }

        expiries.set(key, deathTime);
        expireIfNeeded(key);

        if (persist) {
            appendCommand([command, key, String(deathTime)]);
        }

        return 1;
    }
    else if (command == "TTL") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        if (!keyExists(key)) {
            return -2;
        }
        if (!expiries.has(key)) {
            return -1;
        }

        return Math.ceil((expiries.get(key) - Date.now()) / 1000);
    }
    else if (command == "PERSIST") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        if (!keyExists(key) || !expiries.has(key)) {
            return 0;
        }

        expiries.delete(key);
        if (persist) {
            appendCommand([command, key]);
        }
        return 1;
    }
    else if (command == "TYPE") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        const data = getValue(key);
        if (data === undefined) {
            return "none";
        }
        if (typeof data == "string") {
            return "string";
        }
        if (Array.isArray(data)) {
            return "list";
        }
        if (data instanceof Set) {
            return "set";
        }
        if (data instanceof Map) {
            return "hash";
        }
        return "unknown";
    }
    else if (command == "HSET") {
        if (length != 4) {
            return "ERROR wrong number of arguments";
        }

        const hash = ensureHash(key);
        if (typeof hash == "string") {
            return hash;
        }

        const isNewField = !hash.has(input[2]);
        hash.set(input[2], input[3]);

        if (persist) {
            appendCommand([command, key, input[2], input[3]]);
        }

        return isNewField ? 1 : 0;
    }
    else if (command == "HGET") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }

        const hash = getHash(key);
        if (!hash) {
            return null;
        }
        if (typeof hash == "string") {
            return hash;
        }

        return hash.has(val) ? hash.get(val) : null;
    }
    else if (command == "HDEL") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        const hash = getHash(key);
        if (!hash) {
            return 0; 
        }
        if (typeof hash == "string") {
            return hash;
        }
        
        const wasRemoved = hash.delete(val);
        
        if (wasRemoved) {
            if (hash.size === 0) {
                store.delete(key);
                expiries.delete(key);
            }
            
            if (persist) {
                appendCommand([command, key, val]);
            }

            return 1;
        }
        
        return 0;
    }
    else if (command == "HGETALL") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        
        const hash = getHash(key);
        if (!hash) {
            return []; 
        }
        if (typeof hash == "string") {
            return hash;
        }
        
        return Array.from(hash.entries()).flat();
    }
    else if(command == "LPUSH") {
        if(length < 3) {
            return "ERROR wrong number of arguments";
        }

        const list = ensureList(key);
        if (typeof list == "string") {
            return list;
        }

        for (let i = 2; i < input.length; i++) {
            list.unshift(input[i]);
        }

        if (persist) {
            appendCommand(input);
        }

        return list.length;
    }
    else if (command == "RPUSH") {
        if (length < 3) {
            return "ERROR wrong number of arguments";
        }
        
        const list = ensureList(key);
        if (typeof list == "string") {
            return list;
        }
        
        for (let i = 2; i < input.length; i++) {
            list.push(input[i]);
        }

        if (persist) {
            appendCommand(input);
        }
        
        return list.length;
    }
    else if (command == "LPOP" || command == "RPOP") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        
        const list = getList(key);
        if (!list) {
            return null; 
        }
        if (typeof list == "string") {
            return list;
        }
        
        const poppedElement = command == "LPOP" ? list.shift() : list.pop();
        
        if (list.length === 0) {
            store.delete(key);
            expiries.delete(key);
        }
        
        if (persist) {
            appendCommand([command, key]);
        }
        
        return poppedElement;
    }
    else if (command == "LLEN") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }

        const list = getList(key);
        if (!list) {
            return 0;
        }
        if (typeof list == "string") {
            return list;
        }

        return list.length;
    }
    else if (command == "LRANGE") {
        if(length != 4) {
            return "ERROR wrong number of arguments";
        }

        const list = getList(key);
        if (!list) {
            return [];
        }
        if (typeof list == "string") {
            return list;
        }

        const start = Number(val);
        const stop = Number(input[3]);
        if(!isIntegerString(val) || !isIntegerString(input[3])) {
            return "ERROR value is not an integer or out of range";
        }

        const range = normalizeRange(start, stop, list.length);
        if (range.length == 0) {
            return [];
        }

        return list.slice(range[0], range[1] + 1);
    }
    else if (command == "SADD") {
        if (length < 3) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = ensureSet(key);
        if (typeof setObj == "string") {
            return setObj;
        }
        
        let added = 0;
        for (let i = 2; i < input.length; i++) {
            const before = setObj.size;
            setObj.add(input[i]);
            if (setObj.size > before) {
                added++;
            }
        }
        
        if (added > 0 && persist) {
            appendCommand(input);
        }
        
        return added;
    }
    else if (command == "SREM") {
        if (length < 3) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = getSet(key);
        if (!setObj) {
            return 0; 
        }
        if (typeof setObj == "string") {
            return setObj;
        }
        
        let removed = 0;
        for (let i = 2; i < input.length; i++) {
            if (setObj.delete(input[i])) {
                removed++;
            }
        }
        
        if (removed > 0) {
            if (setObj.size === 0) {
                store.delete(key);
                expiries.delete(key);
            }
            
            if (persist) {
                appendCommand(input);
            }
        }
        
        return removed;
    }
    else if (command == "SISMEMBER") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = getSet(key);
        if (!setObj) {
            return 0; 
        }
        if (typeof setObj == "string") {
            return setObj;
        }
        
        if (setObj.has(val)) {
            return 1;
        } else {
            return 0;
        }
    }
    else if (command == "SMEMBERS") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = getSet(key);
        if (!setObj) {
            return []; 
        }
        if (typeof setObj == "string") {
            return setObj;
        }
        
        return Array.from(setObj);
    }
    else if (command == "KEYS") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
      
        if (key === "*") {
            const keys = [];
            for (const storeKey of store.keys()) {
                if (keyExists(storeKey)) {
                    keys.push(storeKey);
                }
            }
            return keys;
        }
        
        return [];
    }
    else if (command == "DBSIZE") {
        if (length != 1) {
            return "ERROR wrong number of arguments";
        }

        sweepExpiredKeys();
        return store.size;
    }
    else if (command == "FLUSHALL") {
        if (length != 1) {
            return "ERROR wrong number of arguments";
        }
        
        store.clear();
        expiries.clear();
        
        if (persist) {
            fs.writeFileSync(AOF_FILE, ""); 
        }
        
        return "OK";
    }
    else {
        return `ERROR unknown command '${command}'`;
    }
}

function resetForTesting(options = {}) {
    store.clear();
    expiries.clear();

    if (options.removeAof !== false && fs.existsSync(AOF_FILE)) {
        fs.unlinkSync(AOF_FILE);
    }
}

function reloadAofForTesting() {
    store.clear();
    expiries.clear();
    loadAof();
}

loadAof();

const cleaner = setInterval(() => {
    sweepExpiredKeys();
}, 1000);

cleaner.unref();

export { handl, resetForTesting, reloadAofForTesting };
