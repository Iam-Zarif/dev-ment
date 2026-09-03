import { config } from "../../../config/index.js";
import { connectRedis, redisClient } from "../../../lib/redis/index.js";
import { AUTH_CONSTANTS, AUTH_REDIS_PREFIXES } from "./auth.constant.js";
import type { OtpPurpose, PendingRegistration } from "./auth.interface.js";

const getKey = (prefix: string, value: string): string => {
	return `${config.redis.keyPrefix}${prefix}${value}`;
};

const ensureRedisConnection = async () => {
	if (!redisClient.isOpen) {
		await connectRedis();
	}
};

const getRegistrationSuffix = (purpose: OtpPurpose, email: string) =>
	`${purpose}:${email}`;

const savePendingRegistration = async (
	purpose: OtpPurpose,
	email: string,
	data: PendingRegistration,
) => {
	await ensureRedisConnection();

	await redisClient.set(
		getKey(
			AUTH_REDIS_PREFIXES.PENDING_REGISTRATION,
			getRegistrationSuffix(purpose, email),
		),
		JSON.stringify(data),
		{
			EX: AUTH_CONSTANTS.PENDING_REGISTRATION_TTL_SECONDS,
		},
	);
};

const getPendingRegistration = async (
	purpose: OtpPurpose,
	email: string,
): Promise<PendingRegistration | null> => {
	await ensureRedisConnection();

	const key = getKey(
		AUTH_REDIS_PREFIXES.PENDING_REGISTRATION,
		getRegistrationSuffix(purpose, email),
	);

	const value = await redisClient.get(key);

	if (!value) {
		return null;
	}

	try {
		return JSON.parse(value) as PendingRegistration;
	} catch {
		await redisClient.del(key);
		return null;
	}
};

const hasOtpCooldown = async (
	purpose: OtpPurpose,
	email: string,
): Promise<boolean> => {
	await ensureRedisConnection();

	const exists = await redisClient.exists(
		getKey(
			AUTH_REDIS_PREFIXES.OTP_COOLDOWN,
			getRegistrationSuffix(purpose, email),
		),
	);

	return exists > 0;
};

const saveOtp = async (purpose: OtpPurpose, email: string, otpHash: string) => {
	await ensureRedisConnection();

	const suffix = getRegistrationSuffix(purpose, email);

	const otpKey = getKey(AUTH_REDIS_PREFIXES.OTP, suffix);

	const cooldownKey = getKey(AUTH_REDIS_PREFIXES.OTP_COOLDOWN, suffix);

	const attemptKey = getKey(AUTH_REDIS_PREFIXES.OTP_ATTEMPT, suffix);

	await Promise.all([
		redisClient.set(otpKey, otpHash, {
			EX: config.otp.expiresInSeconds,
		}),
		redisClient.set(cooldownKey, "1", {
			EX: config.otp.resendCooldownSeconds,
		}),
		redisClient.del(attemptKey),
	]);
};

const getOtpHash = async (purpose: OtpPurpose, email: string) => {
	await ensureRedisConnection();

	return redisClient.get(
		getKey(AUTH_REDIS_PREFIXES.OTP, getRegistrationSuffix(purpose, email)),
	);
};

const incrementOtpAttempt = async (
	purpose: OtpPurpose,
	email: string,
): Promise<number> => {
	await ensureRedisConnection();

	const key = getKey(
		AUTH_REDIS_PREFIXES.OTP_ATTEMPT,
		getRegistrationSuffix(purpose, email),
	);

	const attempts = await redisClient.incr(key);

	if (attempts === 1) {
		await redisClient.expire(key, config.otp.expiresInSeconds);
	}

	return attempts;
};

const clearOtpState = async (purpose: OtpPurpose, email: string) => {
	await ensureRedisConnection();

	const suffix = getRegistrationSuffix(purpose, email);

	await Promise.all([
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.OTP, suffix)),
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.OTP_ATTEMPT, suffix)),
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.OTP_COOLDOWN, suffix)),
	]);
};

const clearRegistrationState = async (purpose: OtpPurpose, email: string) => {
	await ensureRedisConnection();

	const suffix = getRegistrationSuffix(purpose, email);

	await Promise.all([
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.PENDING_REGISTRATION, suffix)),
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.OTP, suffix)),
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.OTP_ATTEMPT, suffix)),
		redisClient.del(getKey(AUTH_REDIS_PREFIXES.OTP_COOLDOWN, suffix)),
	]);
};

const saveRefreshSession = async (
	userId: string,
	sessionId: string,
	expiresInSeconds: number,
) => {
	await ensureRedisConnection();

	const sessionKey = getKey(AUTH_REDIS_PREFIXES.REFRESH_SESSION, sessionId);

	const userKey = getKey(AUTH_REDIS_PREFIXES.REFRESH_USER, userId);

	await redisClient.set(sessionKey, userId, {
		EX: expiresInSeconds,
	});

	await redisClient.sAdd(userKey, sessionId);

	await redisClient.expire(userKey, expiresInSeconds);
};

const consumeRefreshSession = async (
	sessionId: string,
): Promise<string | null> => {
	await ensureRedisConnection();

	const sessionKey = getKey(AUTH_REDIS_PREFIXES.REFRESH_SESSION, sessionId);

	const userId = await redisClient.getDel(sessionKey);

	if (userId) {
		await redisClient.sRem(
			getKey(AUTH_REDIS_PREFIXES.REFRESH_USER, userId),
			sessionId,
		);
	}

	return userId;
};

const revokeRefreshSession = async (sessionId: string) => {
	await ensureRedisConnection();

	const sessionKey = getKey(AUTH_REDIS_PREFIXES.REFRESH_SESSION, sessionId);

	const userId = await redisClient.get(sessionKey);

	await redisClient.del(sessionKey);

	if (userId) {
		await redisClient.sRem(
			getKey(AUTH_REDIS_PREFIXES.REFRESH_USER, userId),
			sessionId,
		);
	}
};

const revokeAllRefreshSessions = async (userId: string) => {
	await ensureRedisConnection();

	const userKey = getKey(AUTH_REDIS_PREFIXES.REFRESH_USER, userId);

	const sessions = await redisClient.sMembers(userKey);

	await Promise.all(
		sessions.map((sessionId) =>
			redisClient.del(getKey(AUTH_REDIS_PREFIXES.REFRESH_SESSION, sessionId)),
		),
	);

	await redisClient.del(userKey);
};

const savePasswordResetToken = async (tokenHash: string, userId: string) => {
	await ensureRedisConnection();

	await redisClient.set(
		getKey(AUTH_REDIS_PREFIXES.PASSWORD_RESET, tokenHash),
		userId,
		{
			EX: AUTH_CONSTANTS.PASSWORD_RESET_TTL_SECONDS,
		},
	);
};

const consumePasswordResetToken = async (tokenHash: string) => {
	await ensureRedisConnection();

	return redisClient.getDel(
		getKey(AUTH_REDIS_PREFIXES.PASSWORD_RESET, tokenHash),
	);
};

const deletePasswordResetToken = async (tokenHash: string) => {
	await ensureRedisConnection();

	await redisClient.del(getKey(AUTH_REDIS_PREFIXES.PASSWORD_RESET, tokenHash));
};

export const authRedis = {
	savePendingRegistration,
	getPendingRegistration,
	hasOtpCooldown,
	saveOtp,
	getOtpHash,
	incrementOtpAttempt,
	clearOtpState,
	clearRegistrationState,
	saveRefreshSession,
	consumeRefreshSession,
	revokeRefreshSession,
	revokeAllRefreshSessions,
	savePasswordResetToken,
	consumePasswordResetToken,
	deletePasswordResetToken,
};
