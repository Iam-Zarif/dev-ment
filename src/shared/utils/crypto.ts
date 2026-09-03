import { createHash, randomBytes, randomInt } from "node:crypto";

export const generateOtp = (): string => {
	return randomInt(100000, 1000000).toString();
};

export const generateSecureToken = (size = 32): string => {
	return randomBytes(size).toString("hex");
};

export const hashToken = (token: string): string => {
	return createHash("sha256").update(token).digest("hex");
};
