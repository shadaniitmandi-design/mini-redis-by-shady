import fs from "fs";
const store = new Map();
const expiries = new Map();
if(fs.existsSync("database.aof")) {
    const fileData = fs.readFileSync("database.aof", "utf8");
    const lines = fileData.split("\n");
    for (const line of lines) {
        if(!line) {
            continue;
        }
        const parts = line.split(" ");
        const cmd = parts[0];
        const key = parts[1];
        const val = parts[2];
        if(cmd == "SET") {
            store.set(key, val);

        }
        else if (cmd == "DEL") {
            srore.delete(key);

        }
        else if (cmd == "INCR") {
            const curr = store.get(key) ?? "0";
            const next = Number(curr) + 1;
            store.set(key, string(next));
        }
        console.log("yeah shady ne memory recover kar di");
    }
}
function parse(input) {
    if(!input || input.length == 0) {
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
  if(parsed == null) {
    return "ERROR empty command beta"
  }
  const command = parsed.command;
  const key = parsed.key;
  const val = parsed.val;
  const length = parsed.length;
  
  if(command == "PING") {
    if(length != 1) {
        return "ERROR wrong number of commands";
    }
    else {
        return "PONG";
    }
  }

  if (command == "SET") {
    fs.appendFileSync("database.aof", '${command} ${key} ${val}\n');
    if (length != 3) {
      return "ERROR wrong number of argument";
    }
    

    store.set(key, val);
    return "OK";
  } 
  else if (command == "EXPIRE") {
    if(length != 3) {
        return "ERROR wrong number of arguments";
    }
    const seconds = Number(val);
    if(Number.isNaN(seconds)) {
        return "ERROR seconds must be an integer";
    }
    const deathTime = Date.now() + (seconds * 1000);
    expiries.set(key, deathTime);
    fs.appendFileSync("database.aof", 'EXPIRE ${key}\n');
    return 1;
  }
  else if (command == "GET") {
    
    if (length != 2) {
      return "ERROR wrong number of argument";
    }
    if(expiries.has(key)) {
        if(Date.now() > expiries.get(key)) {
            store.delete(key);
            expiries.delete(key);
            return null;
        }
    }
    

    return store.get(key) ?? null;
  } 
  else if(command == "INCR") {
    fs.appendFileSync("database.aof", '${command} ${key} ${val}\n');
    if(length != 2) {
        return "ERROR wrong number of arguments";
    }
    const curr = store.get(key) ?? "0";
    const numi = Number(curr);
    if(Number.isNaN(numi)) {
        return "ERREO value is not an integer";
    }
    const next = numi + 1;
    store.set(key, String(next));
    return next;


  }
  else if (command == "DEL") {
    fs.appendFileSync("database.aof", '${command} ${key} ${val}\n');
    if (length != 2) {
      return "ERROR wrong number of argument";
    }

    const deleted = store.delete(key);

    if (deleted) {
      return 1;
    }

    return 0;
  } 
  else if(command == "EXISTS") {
    if(length != 2) {
        return "ERROR wrong number of arguments";
    }
    if(store.has(key)) {
        return 1;
    }
    else {
        return 0;
    }
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
            console.log(`💀 shady swept away dead key: ${key}`);
        }
    }
}, 1000);
// --------------------------------------