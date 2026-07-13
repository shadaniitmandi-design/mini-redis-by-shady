import net from "node:net";
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
import { handl } from "./brain.js"
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

const respPing = "*1\r\n$4\r\nPING\r\n";


const server = net.createServer((socket) => {
    console.log("client connected");
    socket.on("data", (data) => {
        const text = data.toString();
        const parsedArray = parseRESP(text);
        if(parsedArray[0] && parsedArray[0].toUpperCase() == "COMMAND") {
            socket.write(encodeString("OK"));
            return;
        }
        console.log("Brain will recieve.: ", parsedArray);
        parsedArray[0] = parsedArray[0].toUpperCase();
        const brainAnswer = handl(parsedArray);
        socket.write(encodeString(brainAnswer));
    });
});

server.listen(6380, () => {
  console.log("server is listening on port 6380");
});
