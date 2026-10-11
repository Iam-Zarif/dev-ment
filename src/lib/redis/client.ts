import { createClient } from "redis";
import { config } from "../../config/index.js";

export const redisClient = createClient({
	url: config.redis.url,
	commandOptions: {
		timeout: Math.max(config.redis.commandTimeoutMs, config.redis.connectTimeoutMs + 5_000),
	},
	socket: {
		connectTimeout: config.redis.connectTimeoutMs,
		reconnectStrategy: (retries) => {
			if (retries > 10) {
				return new Error("Redis reconnect limit reached");
			}

			return Math.min(retries * 100, 3000);
		},
	},
});

redisClient.on("error", (error) => {
	console.error("Redis error:", error);
});
