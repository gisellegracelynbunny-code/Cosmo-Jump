import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed." });
    }

    const { username, balance, highScore, theme, trail } = req.body || {};

    if (!username || username.length < 2) {
        return res.status(400).json({ error: "Username must be at least 2 characters." });
    }
    if (typeof balance !== "number" || balance < 0) {
        return res.status(400).json({ error: "Invalid balance." });
    }

    const key = `user:${username.toLowerCase().replace(/[^a-z0-9_]/g, "")}`;
    const safeHighScore = Math.floor(Math.max(0, highScore || 0));

    try {
        /* Update user hash */
        await redis.hset(key, {
            balance: Math.floor(balance),
            highScore: safeHighScore,
            theme: theme || "default",
            trail: trail || "none"
        });

        /* Update leaderboard sorted set (only if score is higher) */
        const currentLbScore = await redis.zscore("leaderboard", username);
        if (!currentLbScore || safeHighScore > Number(currentLbScore)) {
            await redis.zadd("leaderboard", { score: safeHighScore, member: username });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("Redis update-user error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
}
