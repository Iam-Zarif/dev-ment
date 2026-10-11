import type { Request } from "express";
import { config } from "../../../config/index.js";
import { constructStripeWebhookEvent } from "../../../lib/stripe/index.js";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { paymentService } from "./payment.service.js";
import type {
	CreateCheckoutInput,
	PaymentListQuery,
} from "./payment.validation.js";

const getUserId = (req: Request): string => {
	const userId = req.user?.userId;

	if (!userId) {
		throw new AppError(401, "Authentication required");
	}

	return userId;
};

const getPaymentId = (req: Request): string => {
	const paymentId = req.params.id;

	if (typeof paymentId !== "string" || !paymentId) {
		throw new AppError(400, "Payment ID is required");
	}

	return paymentId;
};

const getPlans = catchAsync(async (_req, res) => {
	const data = await paymentService.getPlans();

	return sendResponse(res, {
		statusCode: 200,
		message: "Pricing plans retrieved successfully",
		data,
	});
});

const createCheckout = catchAsync(async (req, res) => {
	const data = await paymentService.createCheckout(
		getUserId(req),
		req.body as CreateCheckoutInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Stripe Checkout session created successfully",
		data,
	});
});

const getMine = catchAsync(async (req, res) => {
	const data = await paymentService.getMine(
		getUserId(req),
		req.query as unknown as PaymentListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Payments retrieved successfully",
		data,
	});
});

const getById = catchAsync(async (req, res) => {
	const data = await paymentService.getById(getUserId(req), getPaymentId(req));

	return sendResponse(res, {
		statusCode: 200,
		message: "Payment retrieved successfully",
		data,
	});
});

const getByCheckoutSession = catchAsync(async (req, res) => {
	const sessionId = req.params.sessionId;

	if (typeof sessionId !== "string") {
		throw new AppError(400, "Checkout session ID is required");
	}

	const data = await paymentService.getByCheckoutSession(getUserId(req), sessionId);

	return sendResponse(res, {
		statusCode: 200,
		message: "Checkout payment status retrieved",
		data,
	});
});

const getCredits = catchAsync(async (req, res) => {
	const data = await paymentService.getCredits(getUserId(req));

	return sendResponse(res, {
		statusCode: 200,
		message: "Credit balance retrieved successfully",
		data,
	});
});

const webhook = catchAsync(async (req, res) => {
	const signature = req.headers["stripe-signature"];

	if (typeof signature !== "string") {
		throw new AppError(400, "Stripe signature is required");
	}

	if (!Buffer.isBuffer(req.body)) {
		throw new AppError(400, "Stripe webhook payload must be raw");
	}

	const event = constructStripeWebhookEvent(req.body, signature);

	const data = await paymentService.handleWebhook(event);

	return sendResponse(res, {
		statusCode: 200,
		message: "Stripe webhook processed successfully",
		data,
	});
});

const success = catchAsync(async (req, res) => {
	if (config.app.frontendUrl) {
		const destination = new URL("/payment/success", config.app.frontendUrl);
		const sessionId = req.query.session_id;

		if (typeof sessionId === "string" && sessionId.startsWith("cs_")) {
			destination.searchParams.set("session_id", sessionId);
		}

		return res.redirect(303, destination.toString());
	}

	return sendResponse(res, {
		statusCode: 200,
		message: "Checkout completed; awaiting Stripe webhook confirmation.",
		data: { creditGrantPendingWebhook: true },
	});
});

const cancel = catchAsync(async (_req, res) => {
	if (config.app.frontendUrl) {
		return res.redirect(303, new URL("/payment/cancel", config.app.frontendUrl).toString());
	}

	return sendResponse(res, {
		statusCode: 200,
		message: "Checkout was cancelled or closed",
		data: null,
	});
});

export const paymentController = {
	getPlans,
	createCheckout,
	getMine,
	getById,
	getByCheckoutSession,
	getCredits,
	webhook,
	success,
	cancel,
};
