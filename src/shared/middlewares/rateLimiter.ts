import type { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { type RedisReply, RedisStore } from "rate-limit-redis";
import { config } from "../../config/index.js";
import { connectRedis, redisClient } from "../../lib/redis/index.js";

const sendCommand = async (...args: string[]): Promise<RedisReply> => {
	if (!redisClient.isOpen) {
		await connectRedis();
	}

	const result = await redisClient.sendCommand(args);

	return result as unknown as RedisReply;
};

const createRedisStore = (prefix: string) => {
	return new RedisStore({
		sendCommand,
		prefix: `${config.redis.keyPrefix}rate-limit:${prefix}:`,
	});
};

const createHandler = (message: string) => (_req: Request, res: Response) => {
	res.status(429).json({
		success: false,
		message,
		errors: [],
	});
};

export const globalRateLimiter = rateLimit({
	windowMs: config.rateLimit.windowMs,
	limit: config.rateLimit.maxRequests,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	store: createRedisStore("global"),
	handler: createHandler("Too many requests. Please try again later."),
});

export const authRateLimiter = rateLimit({
	windowMs: config.rateLimit.windowMs,
	limit: config.rateLimit.authMaxRequests,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	store: createRedisStore("auth"),
	handler: createHandler(
		"Too many authentication requests. Please try again later.",
	),
});

export const otpRequestRateLimiter = rateLimit({
	windowMs: 60 * 1000,
	limit: 5,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	store: createRedisStore("otp-request"),
	handler: createHandler(
		"Too many OTP requests. Please wait before trying again.",
	),
});

export const passwordResetRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 5,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	store: createRedisStore("password-reset"),
	handler: createHandler(
		"Too many password reset requests. Please try again later.",
	),
});
