import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    const { username } = req.query;

    if (!username || username.length < 2) {
        return res.status(400).json({ error: "Username must be at least 2 characters." });
    }

    /* Normalize: lowercase, alphanumeric + underscores only */
    const key = `user:${username.toLowerCase().replace(/[^a-z0-9_]/g, "")}`;

    try {
        const data = await redis.hgetall(key);

        if (data && data.balance !== undefined) {
            return res.status(200).json({
                isNew: false,
                balance: Number(data.balance),
                theme: data.theme || "default",
                trail: data.trail || "none"
            });
        }

        /* New user — create with defaults */
        await redis.hset(key, { balance: 0, theme: "default", trail: "none" });
        return res.status(200).json({
            isNew: true,
            balance: 0,
            theme: "default",
            trail: "none"
        });
    } catch (err) {
        console.error("Redis get-user error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
}
