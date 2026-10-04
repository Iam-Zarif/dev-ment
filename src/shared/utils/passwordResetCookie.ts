import type { CookieOptions, Request, Response } from "express";
import { AUTH_CONSTANTS } from "../../app/modules/auth/auth.constant.js";
import { config } from "../../config/index.js";
import { AppError } from "../errors/index.js";

export const PASSWORD_RESET_COOKIE_NAME = "devment_password_reset";
const options = (): CookieOptions => ({
	httpOnly: true,
	secure: config.app.isProduction,
	sameSite: "strict",
	path: "/",
});
export const setPasswordResetCookie = (res: Response, session: string) => {
	res.cookie(PASSWORD_RESET_COOKIE_NAME, session, {
		...options(),
		maxAge: AUTH_CONSTANTS.PASSWORD_RESET_TTL_SECONDS * 1000,
	});
};
export const clearPasswordResetCookie = (res: Response) => {
	res.clearCookie(PASSWORD_RESET_COOKIE_NAME, options());
};
export const getPasswordResetCookie = (req: Request): string => {
	const session: unknown = req.cookies?.[PASSWORD_RESET_COOKIE_NAME];
	if (typeof session !== "string" || !/^[a-f0-9]{64}$/.test(session)) {
		throw new AppError(400, "Verify the password reset code first");
	}
	return session;
};
