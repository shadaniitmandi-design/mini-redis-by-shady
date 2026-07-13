import fs from "fs";

// unshift for lpush that is adding element in front of the list and
// .push is for left push
// list.shift() this means removing elest from left that is
// the removal of the first element

const store = new Map();
const expiries = new Map();

if (fs.existsSync("database.aof")) {
    const fileData = fs.readFileSync("database.aof", "utf8");
    const lines = fileData.split("\n");
    for (const line of lines) {
        if (!line) {
            continue;
        }
        const parts = line.split(" ");
        const cmd = parts[0];
        const key = parts[1];
        const val = parts[2];
        
        if (cmd == "SET") {
            store.set(key, val);
        } else if (cmd == "DEL") {
            store.delete(key);
        } else if (cmd == "INCR") {
            const curr = store.get(key) ?? "0";
            const next = Number(curr) + 1;
            store.set(key, String(next));
        } else if (cmd == "HSET") {
            if (!store.has(key)) store.set(key, new Map());
            store.get(key).set(parts[2], parts[3]);
        }
        else if(cmd == "LPUSH") {
            if(!store.has(key)) {
                store.set(key, []);
            }
            store.get(key).unshift(val);
        }
        else if (cmd == "RPUSH") {
            if (!store.has(key)) store.set(key, []);
            store.get(key).push(val);
        }
        else if (cmd == "LPOP") {
            if (store.has(key)) {
                const arr = store.get(key);
                arr.shift(); 

                if (arr.length === 0) store.delete(key); 
            }
        }
        else if (cmd == "SADD") {
            if (!store.has(key)) store.set(key, new Set());
            store.get(key).add(val);
        }
        else if (cmd == "SREM") {
            if (store.has(key)) {
                store.get(key).delete(val); 
                
                if (store.get(key).size === 0) {
                    store.delete(key);
                }
            }
        }
        else if (cmd == "HDEL") {
            if (store.has(key)) {
                store.get(key).delete(parts[2]); 
                
                if (store.get(key).size === 0) {
                    store.delete(key);
                }
            }
        }
        else if (cmd == "FLUSHALL") {
            store.clear();
            expiries.clear();
        }
    }
    console.log("yeah shady ne memory recover kar di");
}

function parse(input) {
    if (!input || input.length == 0) {
        return null;
    }
    return {
        command: input[0].toUpperCase(),
        key: input[1],
        val: input[2],
        length: input.length
    };
}

function handl(input) {
    const parsed = parse(input);
    if (parsed == null) {
        return "ERROR empty command beta";
    }
    
    const command = parsed.command;
    const key = parsed.key;
    const val = parsed.val;
    const length = parsed.length;
    
    if (command == "PING") {
        if (length != 1) {
            return "ERROR wrong number of commands";
        } else {
            return "PONG";
        }
    }

    if (command == "SET") {
        fs.appendFileSync("database.aof", `${command} ${key}${val}\n`);
        if (length != 3) {
            return "ERROR wrong number of argument";
        }
        store.set(key, val);
        return "OK";
    } 
    else if (command == "EXPIRE") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        const seconds = Number(val);
        if (Number.isNaN(seconds)) {
            return "ERROR seconds must be an integer";
        }
        const deathTime = Date.now() + (seconds * 1000);
        expiries.set(key, deathTime);
        fs.appendFileSync("database.aof", `EXPIRE ${key}\n`);
        return 1;
    }
    else if (command == "GET") {
        if (length != 2) {
            return "ERROR wrong number of argument";
        }
        if (expiries.has(key)) {
            if (Date.now() > expiries.get(key)) {
                store.delete(key);
                expiries.delete(key);
                return null;
            }
        }
        return store.get(key) ?? null;
    } 
    else if (command == "INCR") {
        fs.appendFileSync("database.aof", `${command} ${key}${val}\n`);
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        const curr = store.get(key) ?? "0";
        const numi = Number(curr);
        if (Number.isNaN(numi)) {
            return "ERREO value is not an integer";
        }
        const next = numi + 1;
        store.set(key, String(next));
        return next;
    }
    else if (command == "DEL") {
        fs.appendFileSync("database.aof", `${command} ${key}${val}\n`);
        if (length != 2) {
            return "ERROR wrong number of argument";
        }
        const deleted = store.delete(key);
        if (deleted) {
            return 1;
        }
        return 0;
    } 
    else if (command == "EXISTS") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        if (store.has(key)) {
            return 1;
        } else {
            return 0;
        }
    }
    else if (command == "HSET") {
        if (length != 4) {
            return "ERROR wrong number of arguments";
        }
        if (!store.has(key)) {
            store.set(key, new Map());
        }
        const hash = store.get(key);
        if (!(hash instanceof Map)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        hash.set(input[2], input[3]);
        fs.appendFileSync("database.aof", `HSET ${key} ${input[2]}${input[3]}\n`);
        return "OK";
    }
    else if (command == "HGET") {
        if (length != 3) {
            return "ERROR wrong number of argumnets";
        }
        const hash = store.get(key);
        if (!hash || !(hash instanceof Map)) {
            return null;
        }
        return hash.get(val) || null;
    }
    else if(command == "LPUSH") {
        if(length != 3) {
            return "ERROR wrong number of arguments";
        }
        if(!store.has(key)) {
            store.set(key, []);
        }
        const list = store.get(key);
        if(!Array.isArray(list)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        list.unshift(val);
        fs.appendFileSync("database.aof", `LPUSH ${key}${val}\n`);
        return list.length;
    }
    else if (command == "HDEL") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        const hash = store.get(key);
        
        if (!hash) {
            return 0; 
        }
        
        if (!(hash instanceof Map)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        const wasRemoved = hash.delete(val);
        
        if (wasRemoved) {
            if (hash.size === 0) {
                store.delete(key);
            }
            
            fs.appendFileSync("database.aof", `HDEL ${key}${val}\n`);
            return 1;
        }
        
        return 0;
    }
    
    else if (command == "HGETALL") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        
        const hash = store.get(key);
        
        if (!hash) {
            return "[]"; 
        }
        
        if (!(hash instanceof Map)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        return Array.from(hash.entries()).flat();
    }
    else if (command == "LRANGE") {
        if(length != 4) {
            return "ERROR wrong number of arguments";
        }
        const list = store.get(key);
        if(!list) {
            return "[]";
        }
        if (!Array.isArray(list)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        const start = Number(val);
        const stop = Number(input[3]);
        if(Number.isNaN(start) || Number.isNaN(stop)) {
            return "ERROR value is not an integer or out of range";
        }
        const result = list.slice(start, stop == -1 ? undefined : stop + 1);
        return result;
    }
    else if (command == "SREM") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = store.get(key);
        
        if (!setObj) {
            return 0; 
        }
        
        if (!(setObj instanceof Set)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        const wasRemoved = setObj.delete(val);
        
        if (wasRemoved) {
            if (setObj.size === 0) {
                store.delete(key);
            }
            
            fs.appendFileSync("database.aof", `SREM ${key}${val}\n`);
            return 1;
        }
        
        return 0;
    }
  
    else if (command == "SISMEMBER") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = store.get(key);
        
        if (!setObj) {
            return 0; 
        }
        
        if (!(setObj instanceof Set)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        if (setObj.has(val)) {
            return 1;
        } else {
            return 0;
        }
    }
    else if (command == "RPUSH") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        if (!store.has(key)) {
            store.set(key, []);
        }
        
        const list = store.get(key);
        
        if (!Array.isArray(list)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        list.push(val);
        fs.appendFileSync("database.aof", `RPUSH ${key}${val}\n`);
        
        return list.length;
    }
    else if (command == "SADD") {
        if (length != 3) {
            return "ERROR wrong number of arguments";
        }
        
        if (!store.has(key)) {
            store.set(key, new Set());
        }
        
        const setObj = store.get(key);
        
        if (!(setObj instanceof Set)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        const initialSize = setObj.size;
        setObj.add(val);
        
        const added = setObj.size > initialSize ? 1 : 0;
        
        if (added === 1) {
            fs.appendFileSync("database.aof", `SADD ${key}${val}\n`);
        }
        
        return added;
    }
    
    else if (command == "SMEMBERS") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        
        const setObj = store.get(key);
        
        if (!setObj) {
            return "[]"; 
        }
        
        if (!(setObj instanceof Set)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        return Array.from(setObj);
    }
    
    else if (command == "LPOP") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
        
        const list = store.get(key);
        
        if (!list) {
            return null; 
        }
        
        if (!Array.isArray(list)) {
            return "ERROR WRONGTYPE operation against a key holding the wrong kind of value";
        }
        
        const poppedElement = list.shift();
        
        if (list.length === 0) {
            store.delete(key);
        }
        
        fs.appendFileSync("database.aof", `LPOP ${key}\n`);
        
        return poppedElement;
    }
    else if (command == "KEYS") {
        if (length != 2) {
            return "ERROR wrong number of arguments";
        }
      
       
        if (key === "*") {
            return Array.from(store.keys());
        }
        
        return [];
    }
    
    else if (command == "FLUSHALL") {
        if (length != 1) {
            return "ERROR wrong number of arguments";
        }
        
        store.clear();
        expiries.clear();
        
        fs.writeFileSync("database.aof", ""); 
        
        return "OK";
    }
    else {
        return "unknown command";
    }
}

export { handl };

setInterval(() => {
    const now = Date.now();
    for (const [key, deathTime] of expiries.entries()) {
        if (now > deathTime) {
            store.delete(key);
            expiries.delete(key);
            console.log(`💀 shady bhai swept away dead key: ${key}`);
        }
    }
}, 1000);