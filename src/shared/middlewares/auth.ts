import type { RequestHandler } from "express";
import { type UserRole, UserStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma/index.js";
import { APP_CONSTANTS } from "../constants/index.js";
import { AppError } from "../errors/index.js";
import { type TokenPayload, verifyAccessToken } from "../utils/index.js";

export const auth = (...allowedRoles: UserRole[]): RequestHandler => {
	return async (req, _res, next) => {
		const authorization = req.headers[APP_CONSTANTS.AUTHORIZATION_HEADER];

		if (!authorization?.startsWith(APP_CONSTANTS.BEARER_PREFIX)) {
			return next(new AppError(401, "Authentication required"));
		}

		const token = authorization
			.slice(APP_CONSTANTS.BEARER_PREFIX.length)
			.trim();

		if (!token) {
			return next(new AppError(401, "Authentication required"));
		}

		let payload: TokenPayload;

		try {
			payload = verifyAccessToken(token);
		} catch {
			return next(new AppError(401, "Invalid or expired access token"));
		}

		try {
			const user = await prisma.user.findUnique({
				where: {
					id: payload.userId,
				},
				select: {
					id: true,
					email: true,
					role: true,
					status: true,
					deletedAt: true,
				},
			});

			if (!user || user.deletedAt) {
				return next(new AppError(401, "User account no longer exists"));
			}

			if (user.status !== UserStatus.ACTIVE) {
				return next(new AppError(403, "User account is not active"));
			}

			if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
				return next(
					new AppError(
						403,
						"You do not have permission to perform this action",
					),
				);
			}

			req.user = {
				userId: user.id,
				email: user.email,
				role: user.role,
			};

			return next();
		} catch (error) {
			return next(error);
		}
	};
};
