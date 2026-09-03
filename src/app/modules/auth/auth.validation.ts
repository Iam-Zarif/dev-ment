import { z } from "zod";
import { UserRole } from "../../../generated/prisma/enums.js";
import {
	emailSchema,
	otpSchema,
	passwordSchema,
} from "../../../shared/validation/index.js";
import { AUTH_OTP_PURPOSE_VALUES } from "./auth.constant.js";

const legalNameSchema = z
	.string()
	.trim()
	.min(2, "Legal name must be at least 2 characters")
	.max(150, "Legal name cannot exceed 150 characters");

const companyNameSchema = z
	.string()
	.trim()
	.min(2, "Company name must be at least 2 characters")
	.max(180, "Company name cannot exceed 180 characters");

const jobTitleSchema = z
	.string()
	.trim()
	.min(2, "Job title must be at least 2 characters")
	.max(150, "Job title cannot exceed 150 characters");

export const registerCandidateSchema = z
	.object({
		legalName: legalNameSchema,
		email: emailSchema,
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.strict()
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export const registerRecruiterSchema = z
	.object({
		legalName: legalNameSchema,
		email: emailSchema,
		companyName: companyNameSchema,
		jobTitle: jobTitleSchema.optional(),
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.strict()
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export const verifyOtpSchema = z
	.object({
		email: emailSchema,
		otp: otpSchema,
		purpose: z.enum(AUTH_OTP_PURPOSE_VALUES),
	})
	.strict();

export const resendOtpSchema = z
	.object({
		email: emailSchema,
		purpose: z.enum(AUTH_OTP_PURPOSE_VALUES),
	})
	.strict();

export const loginSchema = z
	.object({
		email: emailSchema,
		password: passwordSchema,
	})
	.strict();

export const googleLoginSchema = z
	.object({
		idToken: z.string().trim().min(20, "Google ID token is required"),
		role: z.enum([UserRole.CANDIDATE, UserRole.RECRUITER]),
		companyName: companyNameSchema.optional(),
		jobTitle: jobTitleSchema.optional(),
	})
	.strict()
	.superRefine((data, ctx) => {
		if (data.role === UserRole.RECRUITER && !data.companyName) {
			ctx.addIssue({
				code: "custom",
				path: ["companyName"],
				message: "Company name is required for recruiter Google registration",
			});
		}
	});

export const forgotPasswordSchema = z
	.object({
		email: emailSchema,
	})
	.strict();

export const resetPasswordSchema = z
	.object({
		token: z.string().trim().min(32, "Password reset token is invalid"),
		password: passwordSchema,
		confirmPassword: passwordSchema,
	})
	.strict()
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export type RegisterCandidateInput = z.infer<typeof registerCandidateSchema>;

export type RegisterRecruiterInput = z.infer<typeof registerRecruiterSchema>;

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export type LoginInput = z.infer<typeof loginSchema>;

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
