import { redisClient } from "./client.js";

export const connectRedis = async () => {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}

	await redisClient.ping();
};

export const disconnectRedis = async () => {
	if (redisClient.isOpen) {
		await redisClient.quit();
	}
};

export { redisClient };
