import { z } from "zod";
import { PaymentStatus } from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import { PAYMENT_CONSTANTS } from "./payment.constant.js";

export const createCheckoutSchema = z
	.object({
		planCode: z.enum(PAYMENT_CONSTANTS.PURCHASABLE_PLAN_CODES),
	})
	.strict();

export const paymentListQuerySchema = z
	.object({
		page: z.coerce
			.number()
			.int()
			.positive()
			.default(APP_CONSTANTS.DEFAULT_PAGE),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(APP_CONSTANTS.MAX_LIMIT)
			.default(APP_CONSTANTS.DEFAULT_LIMIT),
		status: z
			.enum([
				PaymentStatus.PENDING,
				PaymentStatus.PAID,
				PaymentStatus.FAILED,
				PaymentStatus.CANCELLED,
				PaymentStatus.REFUNDED,
			])
			.optional(),
	})
	.strict();

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
