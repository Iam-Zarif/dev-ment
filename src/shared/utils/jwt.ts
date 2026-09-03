import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { config } from "../../config/index.js";
import {
	UserRole,
	type UserRole as UserRoleType,
} from "../../generated/prisma/enums.js";

export type TokenPayload = {
	userId: string;
	email: string;
	role: UserRoleType;
};

export type RefreshTokenPayload = TokenPayload & {
	sessionId: string;
};

export type VerifiedRefreshTokenPayload = RefreshTokenPayload & {
	exp: number;
};

const isUserRole = (value: unknown): value is UserRoleType => {
	return Object.values(UserRole).includes(value as UserRoleType);
};

const signToken = (
	payload: object,
	secret: string,
	expiresIn: string,
): string => {
	return jwt.sign(payload, secret, {
		expiresIn: expiresIn as SignOptions["expiresIn"],
	});
};

const verifyJwt = (token: string, secret: string): JwtPayload => {
	const decoded = jwt.verify(token, secret);

	if (typeof decoded === "string") {
		throw new Error("Invalid token payload");
	}

	return decoded;
};

const parseTokenPayload = (decoded: JwtPayload): TokenPayload => {
	if (
		typeof decoded.userId !== "string" ||
		typeof decoded.email !== "string" ||
		!isUserRole(decoded.role)
	) {
		throw new Error("Invalid token payload");
	}

	return {
		userId: decoded.userId,
		email: decoded.email,
		role: decoded.role,
	};
};

export const createAccessToken = (payload: TokenPayload): string => {
	return signToken(
		payload,
		config.jwt.accessSecret,
		config.jwt.accessExpiresIn,
	);
};

export const createRefreshToken = (payload: RefreshTokenPayload): string => {
	return signToken(
		payload,
		config.jwt.refreshSecret,
		config.jwt.refreshExpiresIn,
	);
};

export const verifyAccessToken = (token: string): TokenPayload => {
	const decoded = verifyJwt(token, config.jwt.accessSecret);

	return parseTokenPayload(decoded);
};

export const verifyRefreshToken = (
	token: string,
): VerifiedRefreshTokenPayload => {
	const decoded = verifyJwt(token, config.jwt.refreshSecret);

	const payload = parseTokenPayload(decoded);

	if (
		typeof decoded.sessionId !== "string" ||
		typeof decoded.exp !== "number"
	) {
		throw new Error("Invalid refresh token payload");
	}

	return {
		...payload,
		sessionId: decoded.sessionId,
		exp: decoded.exp,
	};
};
