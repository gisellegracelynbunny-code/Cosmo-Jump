import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    try {
        /* Fetch top N from sorted set, highest first */
        const raw = await redis.zrange("leaderboard", 0, limit - 1, {
            rev: true,
            withScores: true
        });

        /* raw is an interleaved array: [member, score, member, score, ...] */
        const leaderboard = [];
        for (let i = 0; i < raw.length; i += 2) {
            leaderboard.push({
                username: raw[i],
                score: Number(raw[i + 1])
            });
        }

        return res.status(200).json({ leaderboard });
    } catch (err) {
        console.error("Leaderboard error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
}
