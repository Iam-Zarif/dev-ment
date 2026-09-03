import type { Response } from "express";
import { AppError } from "../../../shared/errors/index.js";
import {
	catchAsync,
	clearRefreshTokenCookie,
	getRefreshTokenCookie,
	sendResponse,
	setRefreshTokenCookie,
} from "../../../shared/utils/index.js";
import type { AuthSession } from "./auth.interface.js";
import { authService } from "./auth.service.js";
import type {
	ForgotPasswordInput,
	GoogleLoginInput,
	LoginInput,
	RegisterCandidateInput,
	RegisterRecruiterInput,
	ResendOtpInput,
	ResetPasswordInput,
	VerifyOtpInput,
} from "./auth.validation.js";

const sendAuthSession = (
	res: Response,
	session: AuthSession,
	statusCode: number,
	message: string,
) => {
	setRefreshTokenCookie(res, session.refreshToken);

	return sendResponse(res, {
		statusCode,
		message,
		data: {
			user: session.user,
			accessToken: session.accessToken,
		},
	});
};

const registerCandidate = catchAsync(async (req, res) => {
	const data = await authService.registerCandidate(
		req.body as RegisterCandidateInput,
	);

	return sendResponse(res, {
		statusCode: 202,
		message: "Verification code sent successfully",
		data,
	});
});

const registerRecruiter = catchAsync(async (req, res) => {
	const data = await authService.registerRecruiter(
		req.body as RegisterRecruiterInput,
	);

	return sendResponse(res, {
		statusCode: 202,
		message: "Verification code sent successfully",
		data,
	});
});

const verifyOtp = catchAsync(async (req, res) => {
	const session = await authService.verifyOtp(req.body as VerifyOtpInput);

	return sendAuthSession(res, session, 201, "Account verified successfully");
});

const resendOtp = catchAsync(async (req, res) => {
	const data = await authService.resendOtp(req.body as ResendOtpInput);

	return sendResponse(res, {
		statusCode: 200,
		message: "Verification code resent successfully",
		data,
	});
});

const login = catchAsync(async (req, res) => {
	const session = await authService.login(req.body as LoginInput);

	return sendAuthSession(res, session, 200, "Login successful");
});

const googleLogin = catchAsync(async (req, res) => {
	const session = await authService.googleLogin(req.body as GoogleLoginInput);

	return sendAuthSession(res, session, 200, "Google authentication successful");
});

const refresh = catchAsync(async (req, res) => {
	const refreshToken = getRefreshTokenCookie(req);

	const session = await authService.refresh(refreshToken);

	return sendAuthSession(res, session, 200, "Token refreshed successfully");
});

const logout = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const refreshToken = getRefreshTokenCookie(req);

	await authService.logout(refreshToken, req.user.userId);

	clearRefreshTokenCookie(res);

	return sendResponse(res, {
		statusCode: 200,
		message: "Logout successful",
		data: null,
	});
});

const forgotPassword = catchAsync(async (req, res) => {
	await authService.forgotPassword(req.body as ForgotPasswordInput);

	return sendResponse(res, {
		statusCode: 200,
		message:
			"If an account exists with this email, a password reset email has been sent",
		data: null,
	});
});

const resetPassword = catchAsync(async (req, res) => {
	await authService.resetPassword(req.body as ResetPasswordInput);

	return sendResponse(res, {
		statusCode: 200,
		message: "Password reset successfully",
		data: null,
	});
});

const getMe = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const data = await authService.getMe(req.user.userId);

	return sendResponse(res, {
		statusCode: 200,
		message: "Profile retrieved successfully",
		data,
	});
});

export const authController = {
	registerCandidate,
	registerRecruiter,
	verifyOtp,
	resendOtp,
	login,
	googleLogin,
	refresh,
	logout,
	forgotPassword,
	resetPassword,
	getMe,
};
