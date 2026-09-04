import Stripe from "stripe";
import { config } from "../../config/index.js";
import { AppError } from "../../shared/errors/index.js";

let stripeClient: Stripe | null = null;

const getStripeClient = (): Stripe => {
	if (!config.stripe.secretKey) {
		throw new AppError(503, "Stripe is not configured");
	}

	if (!stripeClient) {
		stripeClient = new Stripe(config.stripe.secretKey);
	}

	return stripeClient;
};

type CreateCheckoutSessionInput = {
	paymentId: string;
	idempotencyKey: string;
	recruiterId: string;
	customerEmail: string;
	planId: string;
	planCode: string;
	planName: string;
	assessmentCredits: number;
	validityDays: number;
	amountMinor: number;
	currency: string;
};

const appendCheckoutSessionId = (url: string): string => {
	const separator = url.includes("?") ? "&" : "?";

	return `${url}${separator}session_id={CHECKOUT_SESSION_ID}`;
};

export const createStripeCheckoutSession = async (
	input: CreateCheckoutSessionInput,
) => {
	const stripe = getStripeClient();

	const description =
		input.validityDays > 0
			? `${input.assessmentCredits} assessment credit(s), valid for ${input.validityDays} days`
			: `${input.assessmentCredits} assessment credit(s)`;

	return stripe.checkout.sessions.create(
		{
			mode: "payment",
			customer_email: input.customerEmail,
			client_reference_id: input.paymentId,
			success_url: appendCheckoutSessionId(config.stripe.successUrl),
			cancel_url: config.stripe.cancelUrl,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: input.currency.toLowerCase(),
						unit_amount: input.amountMinor,
						product_data: {
							name: `${input.planName} - Dev-ment`,
							description,
						},
					},
				},
			],
			metadata: {
				paymentId: input.paymentId,
				recruiterId: input.recruiterId,
				planId: input.planId,
				planCode: input.planCode,
			},
			payment_intent_data: {
				metadata: {
					paymentId: input.paymentId,
					recruiterId: input.recruiterId,
					planId: input.planId,
					planCode: input.planCode,
				},
			},
		},
		{
			idempotencyKey: input.idempotencyKey,
		},
	);
};

export const constructStripeWebhookEvent = (
	payload: Buffer,
	signature: string,
): Stripe.Event => {
	if (!config.stripe.webhookSecret) {
		throw new AppError(503, "Stripe webhook is not configured");
	}

	try {
		return getStripeClient().webhooks.constructEvent(
			payload,
			signature,
			config.stripe.webhookSecret,
		);
	} catch {
		throw new AppError(400, "Invalid Stripe webhook signature");
	}
};

export type { Stripe };
