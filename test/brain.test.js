import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-redis-shady-"));
process.env.MINI_REDIS_AOF = path.join(testDir, "database.aof");

const { handl, resetForTesting, reloadAofForTesting } = await import("../brain.js");

beforeEach(() => {
    resetForTesting();
});

after(() => {
    resetForTesting();
    fs.rmSync(testDir, { recursive: true, force: true });
});

test("strings, counters and deletes work", () => {
    assert.equal(handl(["PING"]), "PONG");
    assert.equal(handl(["SET", "name", "shady"]), "OK");
    assert.equal(handl(["GET", "name"]), "shady");
    assert.equal(handl(["INCR", "visits"]), 1);
    assert.equal(handl(["GET", "visits"]), "1");
    assert.equal(handl(["DEL", "name"]), 1);
    assert.equal(handl(["GET", "name"]), null);
});

test("lists behave like redis lists", () => {
    assert.equal(handl(["LPUSH", "jobs", "one"]), 1);
    assert.equal(handl(["RPUSH", "jobs", "two"]), 2);
    assert.deepEqual(handl(["LRANGE", "jobs", "0", "-1"]), ["one", "two"]);
    assert.equal(handl(["LLEN", "jobs"]), 2);
    assert.equal(handl(["LPOP", "jobs"]), "one");
    assert.equal(handl(["RPOP", "jobs"]), "two");
    assert.equal(handl(["LPOP", "jobs"]), null);
});

test("hashes return fields and values cleanly", () => {
    assert.equal(handl(["HSET", "profile", "name", "shady"]), 1);
    assert.equal(handl(["HSET", "profile", "name", "shady2"]), 0);
    assert.equal(handl(["HGET", "profile", "name"]), "shady2");
    assert.deepEqual(handl(["HGETALL", "profile"]), ["name", "shady2"]);
    assert.equal(handl(["HDEL", "profile", "name"]), 1);
    assert.deepEqual(handl(["HGETALL", "profile"]), []);
});

test("sets count only real changes", () => {
    assert.equal(handl(["SADD", "tags", "node", "redis", "node"]), 2);
    assert.deepEqual(handl(["SMEMBERS", "tags"]), ["node", "redis"]);
    assert.equal(handl(["SISMEMBER", "tags", "redis"]), 1);
    assert.equal(handl(["SREM", "tags", "node", "missing"]), 1);
    assert.deepEqual(handl(["SMEMBERS", "tags"]), ["redis"]);
});

test("wrong type operations return redis style errors", () => {
    assert.equal(handl(["SET", "thing", "hello"]), "OK");
    assert.match(handl(["LPUSH", "thing", "bad"]), /^ERROR WRONGTYPE/);

    assert.equal(handl(["SET", "empty", ""]), "OK");
    assert.match(handl(["SADD", "empty", "bad"]), /^ERROR WRONGTYPE/);

    assert.equal(handl(["RPUSH", "queue", "job"]), 1);
    assert.match(handl(["GET", "queue"]), /^ERROR WRONGTYPE/);
});

test("expiry removes keys and ttl reports missing keys", () => {
    assert.equal(handl(["SET", "temp", "value"]), "OK");
    assert.equal(handl(["EXPIRE", "temp", "0"]), 1);
    assert.equal(handl(["GET", "temp"]), null);
    assert.equal(handl(["TTL", "temp"]), -2);
});

test("aof replay restores data without sticking key and value together", () => {
    assert.equal(handl(["SET", "name", "shady"]), "OK");
    assert.equal(handl(["HSET", "profile", "lang", "js"]), 1);
    assert.equal(handl(["LPUSH", "jobs", "one"]), 1);
    assert.equal(handl(["RPUSH", "jobs", "two"]), 2);
    assert.equal(handl(["EXPIRE", "name", "60"]), 1);

    resetForTesting({ removeAof: false });
    reloadAofForTesting();

    assert.equal(handl(["GET", "name"]), "shady");
    assert.equal(handl(["HGET", "profile", "lang"]), "js");
    assert.deepEqual(handl(["LRANGE", "jobs", "0", "-1"]), ["one", "two"]);
    assert.ok(handl(["TTL", "name"]) > 0);
});
