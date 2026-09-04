import express, { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { paymentController } from "../modules/payment/payment.controller.js";
import {
	createCheckoutSchema,
	paymentListQuerySchema,
} from "../modules/payment/payment.validation.js";

export const paymentWebhookRouter = Router();

paymentWebhookRouter.post(
	"/payments/webhook",
	express.raw({
		type: "application/json",
		limit: "1mb",
	}),
	paymentController.webhook,
);

const router = Router();

router.get("/plans", paymentController.getPlans);

router.get("/success", paymentController.success);

router.get("/cancel", paymentController.cancel);

router.use(auth(UserRole.RECRUITER));

router.post(
	"/checkout",
	validateRequest({
		body: createCheckoutSchema,
	}),
	paymentController.createCheckout,
);

router.get("/credits", paymentController.getCredits);

router.get(
	"/",
	validateRequest({
		query: paymentListQuerySchema,
	}),
	paymentController.getMine,
);

router.get(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	paymentController.getById,
);

export default router;
