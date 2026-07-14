import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-redis-server-shady-"));
process.env.MINI_REDIS_AOF = path.join(testDir, "database.aof");

const { parseRESP, encodeAnswer } = await import("../server.js");

test("resp parser handles pipelined commands", () => {
    const input = "*1\r\n$4\r\nPING\r\n*2\r\n$3\r\nGET\r\n$4\r\nname\r\n";
    const parsed = parseRESP(input);

    assert.deepEqual(parsed.commands, [["PING"], ["GET", "name"]]);
    assert.equal(parsed.rest, "");
});

test("resp parser keeps partial packets for the next data event", () => {
    const input = "*2\r\n$3\r\nGET\r\n$4\r\nna";
    const parsed = parseRESP(input);

    assert.deepEqual(parsed.commands, []);
    assert.equal(parsed.rest, input);
});

test("encoder returns normal redis wire values", () => {
    assert.equal(encodeAnswer("OK"), "+OK\r\n");
    assert.equal(encodeAnswer(null), "$-1\r\n");
    assert.equal(encodeAnswer(["one", "two"]), "*2\r\n$3\r\none\r\n$3\r\ntwo\r\n");
});
