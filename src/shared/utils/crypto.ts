import {
	createHash,
	randomBytes,
	randomInt,
	timingSafeEqual,
} from "node:crypto";

export const generateOtp = (): string => {
	return randomInt(100000, 1000000).toString();
};

export const generateSecureToken = (size = 32): string => {
	return randomBytes(size).toString("hex");
};

export const hashToken = (token: string): string => {
	return createHash("sha256").update(token).digest("hex");
};

export const secureHashCompare = (first: string, second: string): boolean => {
	const firstBuffer = Buffer.from(first);
	const secondBuffer = Buffer.from(second);

	if (firstBuffer.length !== secondBuffer.length) {
		return false;
	}

	return timingSafeEqual(firstBuffer, secondBuffer);
};
