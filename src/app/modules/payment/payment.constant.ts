export const PAYMENT_CONSTANTS = {
	PURCHASABLE_PLAN_CODES: ["PLUS", "PRO", "PREMIUM"],
	SUPPORTED_WEBHOOK_EVENTS: [
		"checkout.session.completed",
		"checkout.session.async_payment_succeeded",
		"checkout.session.async_payment_failed",
		"checkout.session.expired",
		"payment_intent.succeeded",
		"payment_intent.payment_failed",
	],
} as const;
