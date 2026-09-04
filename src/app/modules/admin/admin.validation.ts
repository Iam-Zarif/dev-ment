import { z } from "zod";
import {
	PaymentStatus,
	UserRole,
	UserStatus,
} from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import { ADMIN_CONSTANTS } from "./admin.constant.js";

const pageSchema = z.coerce
	.number()
	.int()
	.positive()
	.default(APP_CONSTANTS.DEFAULT_PAGE);

const limitSchema = z.coerce
	.number()
	.int()
	.positive()
	.max(APP_CONSTANTS.MAX_LIMIT)
	.default(APP_CONSTANTS.DEFAULT_LIMIT);

const searchSchema = z
	.string()
	.trim()
	.min(1)
	.max(ADMIN_CONSTANTS.SEARCH_MAX_LENGTH)
	.optional();

export const adminUserListQuerySchema = z
	.object({
		page: pageSchema,
		limit: limitSchema,
		role: z
			.enum([UserRole.ADMIN, UserRole.RECRUITER, UserRole.CANDIDATE])
			.optional(),
		status: z
			.enum([UserStatus.ACTIVE, UserStatus.BLOCKED, UserStatus.DELETED])
			.optional(),
		search: searchSchema,
	})
	.strict();

export const updateUserStatusSchema = z
	.object({
		status: z.enum([UserStatus.ACTIVE, UserStatus.BLOCKED]),
	})
	.strict();

export const adminCompanyListQuerySchema = z
	.object({
		page: pageSchema,
		limit: limitSchema,
		isVerified: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		search: searchSchema,
	})
	.strict();

export const updateCompanyVerificationSchema = z
	.object({
		isVerified: z.boolean(),
	})
	.strict();

export const updatePricingPlanSchema = z
	.object({
		name: z.string().trim().min(1).max(80).optional(),
		price: z.number().min(0).max(ADMIN_CONSTANTS.MAX_PLAN_PRICE).optional(),
		assessmentCredits: z
			.number()
			.int()
			.min(0)
			.max(ADMIN_CONSTANTS.MAX_PLAN_CREDITS)
			.optional(),
		validityDays: z
			.number()
			.int()
			.min(0)
			.max(ADMIN_CONSTANTS.MAX_PLAN_VALIDITY_DAYS)
			.optional(),
		isActive: z.boolean().optional(),
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export const adminCreditGrantSchema = z
	.object({
		credits: z
			.number()
			.int()
			.positive()
			.max(ADMIN_CONSTANTS.MAX_ADMIN_GRANT_CREDITS),
		validityDays: z
			.number()
			.int()
			.positive()
			.max(ADMIN_CONSTANTS.MAX_CREDIT_VALIDITY_DAYS)
			.optional(),
		reason: z
			.string()
			.trim()
			.min(1)
			.max(ADMIN_CONSTANTS.MAX_REASON_LENGTH)
			.optional(),
	})
	.strict();

export const adminPaymentListQuerySchema = z
	.object({
		page: pageSchema,
		limit: limitSchema,
		status: z
			.enum([
				PaymentStatus.PENDING,
				PaymentStatus.PAID,
				PaymentStatus.FAILED,
				PaymentStatus.CANCELLED,
				PaymentStatus.REFUNDED,
			])
			.optional(),
		recruiterId: z.uuid().optional(),
		planCode: z
			.string()
			.trim()
			.min(1)
			.max(30)
			.transform((value) => value.toUpperCase())
			.optional(),
		search: searchSchema,
	})
	.strict();

export const adminAuditListQuerySchema = z
	.object({
		page: pageSchema,
		limit: limitSchema,
		actorUserId: z.uuid().optional(),
		action: z.string().trim().min(1).max(120).optional(),
		entityType: z.string().trim().min(1).max(80).optional(),
	})
	.strict();

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export type AdminCompanyListQuery = z.infer<typeof adminCompanyListQuerySchema>;

export type UpdateCompanyVerificationInput = z.infer<
	typeof updateCompanyVerificationSchema
>;

export type UpdatePricingPlanInput = z.infer<typeof updatePricingPlanSchema>;

export type AdminCreditGrantInput = z.infer<typeof adminCreditGrantSchema>;

export type AdminPaymentListQuery = z.infer<typeof adminPaymentListQuerySchema>;

export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>;
