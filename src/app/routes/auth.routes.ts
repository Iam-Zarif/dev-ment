import { Router } from "express";
import {
	auth,
	authRateLimiter,
	otpRequestRateLimiter,
	passwordResetRateLimiter,
	validateRequest,
} from "../../shared/middlewares/index.js";
import { authController } from "../modules/auth/auth.controller.js";
import {
	forgotPasswordSchema,
	googleLoginSchema,
	loginSchema,
	registerCandidateSchema,
	registerRecruiterSchema,
	resendOtpSchema,
	resetPasswordSchema,
	verifyOtpSchema,
} from "../modules/auth/auth.validation.js";

const router = Router();

router.post(
	"/register/candidate",
	otpRequestRateLimiter,
	validateRequest({
		body: registerCandidateSchema,
	}),
	authController.registerCandidate,
);

router.post(
	"/register/recruiter",
	otpRequestRateLimiter,
	validateRequest({
		body: registerRecruiterSchema,
	}),
	authController.registerRecruiter,
);

router.post(
	"/verify-otp",
	authRateLimiter,
	validateRequest({
		body: verifyOtpSchema,
	}),
	authController.verifyOtp,
);

router.post(
	"/resend-otp",
	otpRequestRateLimiter,
	validateRequest({
		body: resendOtpSchema,
	}),
	authController.resendOtp,
);

router.post(
	"/login",
	authRateLimiter,
	validateRequest({
		body: loginSchema,
	}),
	authController.login,
);

router.post(
	"/google",
	authRateLimiter,
	validateRequest({
		body: googleLoginSchema,
	}),
	authController.googleLogin,
);

router.post("/refresh", authRateLimiter, authController.refresh);

router.post("/logout", auth(), authController.logout);

router.post(
	"/forgot-password",
	passwordResetRateLimiter,
	validateRequest({
		body: forgotPasswordSchema,
	}),
	authController.forgotPassword,
);

router.post(
	"/reset-password",
	passwordResetRateLimiter,
	validateRequest({
		body: resetPasswordSchema,
	}),
	authController.resetPassword,
);

router.get("/me", auth(), authController.getMe);

export default router;
