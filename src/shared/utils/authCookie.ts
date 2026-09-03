import type { CookieOptions, Request, Response } from "express";
import { config } from "../../config/index.js";
import { AppError } from "../errors/index.js";
import { verifyRefreshToken } from "./jwt.js";

export const REFRESH_TOKEN_COOKIE_NAME = "devment_refresh_token";

const getRefreshCookieOptions = (): CookieOptions => ({
	httpOnly: true,
	secure: config.app.isProduction,
	sameSite: "lax",
	path: `/api/${config.app.apiVersion}/auth`,
});

export const setRefreshTokenCookie = (
	res: Response,
	refreshToken: string,
): void => {
	const payload = verifyRefreshToken(refreshToken);

	const maxAge = Math.max(payload.exp * 1000 - Date.now(), 0);

	res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
		...getRefreshCookieOptions(),
		maxAge,
	});
};

export const clearRefreshTokenCookie = (res: Response): void => {
	res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getRefreshCookieOptions());
};

export const getRefreshTokenCookie = (req: Request): string => {
	const cookies = req.cookies as Record<string, unknown>;

	const refreshToken = cookies[REFRESH_TOKEN_COOKIE_NAME];

	if (typeof refreshToken !== "string" || !refreshToken) {
		throw new AppError(401, "Refresh token is missing");
	}

	return refreshToken;
};
