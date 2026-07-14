import net from "node:net";
import { pathToFileURL } from "node:url";
import { handl } from "./brain.js";

function encodeString(str) {
    return "+" + str + "\r\n";
}

function error(err) {
    const message = err.startsWith("ERROR ") ? "ERR " + err.slice(6) : err;
    return "-" + message + "\r\n";
}

function encodeInteger(num) {
    return ":" + num + "\r\n";
}

function encodeBulkString(str) {
    const text = String(str);
    return "$" + Buffer.byteLength(text) + "\r\n" + text + "\r\n";
}

function encodeNull() {
    return "$-1\r\n";
}

// Added this function so your server can actually send Lists and Sets back!
function encodeArray(arr) {
    let res = "*" + arr.length + "\r\n";
    for (const item of arr) {
        if (item === null) {
            res += encodeNull();
        } else if (Array.isArray(item)) {
            res += encodeArray(item);
        } else if (typeof item === "number") {
            res += encodeInteger(item);
        } else {
            res += encodeBulkString(String(item));
        }
    }
    return res;
}

function readRespLine(text, start) {
    const lineEnd = text.indexOf("\r\n", start);
    if (lineEnd === -1) {
        return { wait: true };
    }

    return {
        line: text.slice(start, lineEnd),
        next: lineEnd + 2
    };
}

function readRespArray(text, start) {
    const header = readRespLine(text, start + 1);
    if (header.wait) {
        return header;
    }

    const count = Number(header.line);
    if (!Number.isInteger(count) || count < 0) {
        return { error: "invalid RESP array length" };
    }

    const command = [];
    let cursor = header.next;

    for (let i = 0; i < count; i++) {
        if (cursor >= text.length) {
            return { wait: true };
        }

        if (text[cursor] !== "$") {
            return { error: "expected bulk string" };
        }

        const bulkHeader = readRespLine(text, cursor + 1);
        if (bulkHeader.wait) {
            return bulkHeader;
        }

        const bulkLength = Number(bulkHeader.line);
        if (!Number.isInteger(bulkLength) || bulkLength < -1) {
            return { error: "invalid bulk string length" };
        }

        cursor = bulkHeader.next;

        if (bulkLength == -1) {
            command.push(null);
            continue;
        }

        const valueEnd = cursor + bulkLength;
        if (text.length < valueEnd + 2) {
            return { wait: true };
        }

        if (text.slice(valueEnd, valueEnd + 2) !== "\r\n") {
            return { error: "bulk string missing terminator" };
        }

        command.push(text.slice(cursor, valueEnd));
        cursor = valueEnd + 2;
    }

    return {
        command,
        next: cursor
    };
}

function parseRESP(text) {
    const commands = [];
    let cursor = 0;

    while (cursor < text.length) {
        if (text.startsWith("\r\n", cursor)) {
            cursor += 2;
            continue;
        }

        if (text[cursor] == "*") {
            const parsed = readRespArray(text, cursor);
            if (parsed.wait) {
                break;
            }
            if (parsed.error) {
                throw new Error(parsed.error);
            }

            commands.push(parsed.command);
            cursor = parsed.next;
            continue;
        }

        const inline = readRespLine(text, cursor);
        if (inline.wait) {
            break;
        }

        const line = inline.line.trim();
        if (line.length > 0) {
            commands.push(line.split(/\s+/));
        }
        cursor = inline.next;
    }

    return {
        commands,
        rest: text.slice(cursor)
    };
}

function encodeAnswer(brainAnswer) {
    if (brainAnswer === null) {
        return encodeNull();
    } 
    else if (typeof brainAnswer === "number") {
        return encodeInteger(brainAnswer);
    } 
    else if (Array.isArray(brainAnswer)) {
        return encodeArray(brainAnswer);
    } 
    else if (typeof brainAnswer === "string" && brainAnswer.startsWith("ERROR")) {
        return error(brainAnswer);
    } 
    else if (brainAnswer === "OK" || brainAnswer === "PONG") {
        return encodeString(brainAnswer);
    } 
    else {
        return encodeBulkString(String(brainAnswer));
    }
}

function createServer() {
    return net.createServer((socket) => {
        console.log("client connected");
        let pendingText = "";
        
        socket.on("data", (data) => {
            pendingText += data.toString();
            let parsed;

            try {
                parsed = parseRESP(pendingText);
            } catch (err) {
                socket.write(error("ERR " + err.message));
                pendingText = "";
                return;
            }

            pendingText = parsed.rest;
            
            for (const parsedArray of parsed.commands) {
                if (parsedArray.length === 0) {
                    continue; 
                }
                
                console.log("Brain will receive: ", parsedArray);
                const brainAnswer = handl(parsedArray);
                socket.write(encodeAnswer(brainAnswer));
            }
        });
    });
}

function startServer(port = Number(process.env.PORT || 6380), host = process.env.HOST || "127.0.0.1") {
    const server = createServer();
    server.on("error", (err) => {
        console.error(`server failed to start: ${err.message}`);
        process.exitCode = 1;
    });
    server.listen(port, host, () => {
        console.log(`server is listening on ${host}:${port}`);
    });
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startServer();
}

export { createServer, startServer, parseRESP, encodeAnswer };
