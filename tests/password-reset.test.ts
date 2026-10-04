import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/index.js", () => ({
	config: { app: { isProduction: true } },
}));

import {
	resetPasswordSchema,
	verifyPasswordResetOtpSchema,
} from "../src/app/modules/auth/auth.validation.js";
import {
	getPasswordResetCookie,
	setPasswordResetCookie,
} from "../src/shared/utils/passwordResetCookie.js";

const session = "a".repeat(64);

describe("password reset contract", () => {
	it("requires exactly six OTP digits", () => {
		expect(
			verifyPasswordResetOtpSchema.safeParse({
				email: "person@example.com",
				otp: "012345",
			}).success,
		).toBe(true);
		for (const otp of ["12345", "1234567", "abcdef"]) {
			expect(
				verifyPasswordResetOtpSchema.safeParse({
					email: "person@example.com",
					otp,
				}).success,
			).toBe(false);
		}
	});
	it("accepts only matching new passwords without a user-entered token", () => {
		const input = {
			password: "NewPassword123!",
			confirmPassword: "NewPassword123!",
		};
		expect(resetPasswordSchema.safeParse(input).success).toBe(true);
		expect(
			resetPasswordSchema.safeParse({
				...input,
				confirmPassword: "DifferentPassword123!",
			}).success,
		).toBe(false);
		expect(
			resetPasswordSchema.safeParse({ ...input, token: "old-token" }).success,
		).toBe(false);
	});
	it("rejects missing or malformed reset authorization", () => {
		for (const cookies of [{}, { devment_password_reset: "invalid" }]) {
			expect(() => getPasswordResetCookie({ cookies } as Request)).toThrow(
				"Verify the password reset code first",
			);
		}
		expect(
			getPasswordResetCookie({
				cookies: { devment_password_reset: session },
			} as Request),
		).toBe(session);
	});
	it("keeps verified reset authorization in a secure HttpOnly cookie", () => {
		const cookie = vi.fn();
		setPasswordResetCookie({ cookie } as unknown as Response, session);
		expect(cookie).toHaveBeenCalledWith(
			"devment_password_reset",
			session,
			expect.objectContaining({
				httpOnly: true,
				secure: true,
				sameSite: "strict",
				maxAge: 900000,
			}),
		);
	});
});
