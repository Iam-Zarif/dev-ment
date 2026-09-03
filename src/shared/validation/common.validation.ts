import { z } from "zod";
import { APP_CONSTANTS } from "../constants/index.js";

export const uuidSchema = z.uuid();

export const idParamSchema = z.object({
	id: uuidSchema,
});

export const paginationQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(APP_CONSTANTS.DEFAULT_PAGE),

	limit: z.coerce
		.number()
		.int()
		.positive()
		.max(APP_CONSTANTS.MAX_LIMIT)
		.default(APP_CONSTANTS.DEFAULT_LIMIT),

	search: z.string().trim().min(1).optional(),

	sortBy: z.string().trim().min(1).optional(),

	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const emailSchema = z.email().trim().toLowerCase();

export const passwordSchema = z.string().min(8).max(72);

export const otpSchema = z.string().regex(/^\d{6}$/);
