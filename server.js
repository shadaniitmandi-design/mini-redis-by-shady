import net from "node:net";
import { handl } from "./brain.js";

function encodeString(str) {
    return "+" + str + "\r\n";
}

function error(err) {
    return "-" + err + "\r\n";
}

function encodeInteger(num) {
    return ":" + num + "\r\n";
}

function encodeBulkingString(str) {
    return "$" + str.length + "\r\n" + str + "\r\n";
}

function encodeNull() {
    return "$-1\r\n";
}

// Added this function so your server can actually send Lists and Sets back!
function encodeArray(arr) {
    if (arr.length === 0) return "*0\r\n";
    let res = "*" + arr.length + "\r\n";
    for (const item of arr) {
        if (item === null) {
            res += encodeNull();
        } else if (typeof item === 'number') {
            res += encodeInteger(item);
        } else {
            res += encodeBulkingString(String(item));
        }
    }
    return res;
}

function parseRESP(text) {
    const parts = text.split("\r\n");
    const commands = [];
    for(let i = 2; i < parts.length; i = i + 2) {
        if(parts[i] != "") {
            commands.push(parts[i]);
        }
    }
    return commands;
}

const server = net.createServer((socket) => {
    console.log("client connected");
    
    socket.on("data", (data) => {
        const text = data.toString();
        const parsedArray = parseRESP(text);
        
        // Safety check to prevent crashes if an empty packet arrives
        if (parsedArray.length === 0) return; 
        
        if(parsedArray[0] && parsedArray[0].toUpperCase() == "COMMAND") {
            socket.write(encodeString("OK"));
            return;
        }
        
        console.log("Brain will recieve.: ", parsedArray);
        parsedArray[0] = parsedArray[0].toUpperCase();
        
        const brainAnswer = handl(parsedArray);
        
        
        if (brainAnswer === null) {
            socket.write(encodeNull());
        } 
        else if (typeof brainAnswer === "number") {
            socket.write(encodeInteger(brainAnswer));
        } 
        else if (Array.isArray(brainAnswer)) {
            socket.write(encodeArray(brainAnswer));
        } 
        else if (typeof brainAnswer === "string" && brainAnswer.startsWith("ERROR")) {
            socket.write(error(brainAnswer.replace("ERROR ", "ERR ")));
        } 
        else if (brainAnswer === "OK" || brainAnswer === "PONG") {
            socket.write(encodeString(brainAnswer));
        } 
        else {
            socket.write(encodeBulkingString(String(brainAnswer)));
        }
    });
});

server.listen(6380, () => {
  console.log("server is listening on port 6380");
});