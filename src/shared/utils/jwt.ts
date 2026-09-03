import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { config } from "../../config/index.js";
import type { UserRole } from "../../generated/prisma/enums.js";

export type TokenPayload = {
	userId: string;
	email: string;
	role: UserRole;
};

const signToken = (
	payload: TokenPayload,
	secret: string,
	expiresIn: string,
): string => {
	return jwt.sign(payload, secret, {
		expiresIn: expiresIn as SignOptions["expiresIn"],
	});
};

export const createAccessToken = (payload: TokenPayload): string => {
	return signToken(
		payload,
		config.jwt.accessSecret,
		config.jwt.accessExpiresIn,
	);
};

export const createRefreshToken = (payload: TokenPayload): string => {
	return signToken(
		payload,
		config.jwt.refreshSecret,
		config.jwt.refreshExpiresIn,
	);
};

const verifyToken = (token: string, secret: string): TokenPayload => {
	const decoded = jwt.verify(token, secret) as JwtPayload & TokenPayload;

	return {
		userId: decoded.userId,
		email: decoded.email,
		role: decoded.role,
	};
};

export const verifyAccessToken = (token: string): TokenPayload => {
	return verifyToken(token, config.jwt.accessSecret);
};

export const verifyRefreshToken = (token: string): TokenPayload => {
	return verifyToken(token, config.jwt.refreshSecret);
};
