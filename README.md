# mini-redis-by-shady

A custom, RESP-compliant Redis clone built from scratch in Node.js.

Small code, no dependencies, and still very much Shady style.

## What it can do

- RESP server on `127.0.0.1:6380`
- AOF persistence in `database.aof`
- background expiration for dead keys
- strings: `PING`, `SET`, `GET`, `INCR`, `DEL`, `EXISTS`
- hashes: `HSET`, `HGET`, `HGETALL`, `HDEL`
- lists / job queues: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LLEN`, `LRANGE`
- sets: `SADD`, `SREM`, `SISMEMBER`, `SMEMBERS`
- server helpers: `KEYS *`, `DBSIZE`, `TYPE`, `TTL`, `PERSIST`, `FLUSHALL`

## Run it

```bash
npm start
```

Then in another terminal:

```bash
redis-cli -p 6380
```

Example:

```redis
SET name shady
GET name
LPUSH jobs build
RPUSH jobs ship
LRANGE jobs 0 -1
```

## Test it

```bash
npm test
```

## Notes

The AOF now stores commands as JSON lines, so values do not get glued to keys during recovery. Old simple space-separated AOF lines are still read when possible.
