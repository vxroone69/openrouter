import { redis } from "./redis";

const slidingWindowScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)

local count = redis.call("ZCARD", key)

if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local resetAt = 0

  if oldest[2] then
    resetAt = tonumber(oldest[2]) + window
  end

  return {0, count, resetAt}
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window)

return {1, count + 1, now + window}
`;

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const member = `${now}:${crypto.randomUUID()}`;

  const result = await redis.eval(
    slidingWindowScript,
    1,
    key,
    now,
    windowMs,
    limit,
    member
  );

  const [allowed, count, resetAt] = result as [number, number, number];

  return {
    allowed: allowed === 1,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}