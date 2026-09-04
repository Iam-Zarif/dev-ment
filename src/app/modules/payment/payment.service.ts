import type Stripe from "stripe";
import type { Prisma } from "../../../generated/prisma/client.js";
import {
	CreditSource,
	PaymentStatus,
	StripeWebhookStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { createStripeCheckoutSession } from "../../../lib/stripe/index.js";
import { AppError } from "../../../shared/errors/index.js";
import {
	calculatePagination,
	createPaginationMeta,
} from "../../../shared/utils/index.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constant.js";
import { auditService } from "../audit/audit.service.js";
import { getRecruiterContext } from "../recruiter/recruiter.context.js";
import { PAYMENT_CONSTANTS } from "./payment.constant.js";
import type {
	CreateCheckoutInput,
	PaymentListQuery,
} from "./payment.validation.js";

type LockedPayment = {
	id: string;
	status: PaymentStatus;
};

type PaymentPlanSnapshot = {
	planCode: string;
	assessmentCredits: number;
	validityDays: number;
};

const toMinorUnits = (amount: { toString(): string }): number => {
	const numericAmount = Number(amount.toString());

	if (!Number.isFinite(numericAmount) || numericAmount < 0) {
		throw new AppError(500, "Invalid payment amount");
	}

	return Math.round(numericAmount * 100);
};

const getPaymentPlanSnapshot = (metadata: unknown): PaymentPlanSnapshot => {
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		Array.isArray(metadata)
	) {
		throw new AppError(500, "Payment plan snapshot is missing");
	}

	const record = metadata as Record<string, unknown>;

	const planCode = record.planCode;

	const assessmentCredits = record.assessmentCredits;

	const validityDays = record.validityDays;

	if (
		typeof planCode !== "string" ||
		!planCode.trim() ||
		typeof assessmentCredits !== "number" ||
		!Number.isInteger(assessmentCredits) ||
		assessmentCredits <= 0 ||
		typeof validityDays !== "number" ||
		!Number.isInteger(validityDays) ||
		validityDays < 0
	) {
		throw new AppError(500, "Payment plan snapshot is invalid");
	}

	return {
		planCode,
		assessmentCredits,
		validityDays,
	};
};

const getStripeObjectId = (
	value:
		| string
		| {
				id: string;
		  }
		| null
		| undefined,
): string | null => {
	if (typeof value === "string") {
		return value;
	}

	return value?.id ?? null;
};

const getEventObjectId = (event: Stripe.Event): string | null => {
	const object = event.data.object as {
		id?: unknown;
	};

	return typeof object.id === "string" ? object.id : null;
};

const getPaymentIdFromEvent = (event: Stripe.Event): string | null => {
	if (event.type.startsWith("checkout.session.")) {
		const session = event.data.object as Stripe.Checkout.Session;

		return session.metadata?.paymentId ?? session.client_reference_id ?? null;
	}

	if (event.type.startsWith("payment_intent.")) {
		const intent = event.data.object as Stripe.PaymentIntent;

		return intent.metadata?.paymentId ?? null;
	}

	return null;
};

const lockPayment = async (
	tx: Prisma.TransactionClient,
	paymentId: string,
): Promise<LockedPayment> => {
	const [payment] = await tx.$queryRaw<LockedPayment[]>`
			SELECT
				"id",
				"status"
			FROM "payments"
			WHERE
				"id" = ${paymentId}::uuid
			FOR UPDATE
		`;

	if (!payment) {
		throw new AppError(500, "Payment record not found for Stripe event");
	}

	return payment;
};

const grantPurchasedCredits = async (
	tx: Prisma.TransactionClient,
	paymentId: string,
	paidAt: Date,
	stripeData: {
		checkoutSessionId?: string | null;
		paymentIntentId?: string | null;
		customerId?: string | null;
	},
) => {
	const locked = await lockPayment(tx, paymentId);

	const payment = await tx.payment.findUnique({
		where: {
			id: paymentId,
		},
		select: {
			id: true,
			recruiterId: true,
			planId: true,
			amount: true,
			currency: true,
			status: true,
			paidAt: true,
			metadata: true,
			recruiter: {
				select: {
					userId: true,
				},
			},
			creditGrant: {
				select: {
					id: true,
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(500, "Payment record not found");
	}

	if (locked.status === PaymentStatus.REFUNDED) {
		throw new AppError(409, "Refunded payment cannot be fulfilled");
	}

	const snapshot = getPaymentPlanSnapshot(payment.metadata);

	const effectivePaidAt = payment.paidAt ?? paidAt;

	const expiresAt =
		snapshot.validityDays > 0
			? new Date(
					effectivePaidAt.getTime() +
						snapshot.validityDays * 24 * 60 * 60 * 1000,
				)
			: null;

	const paymentWasPaid = locked.status === PaymentStatus.PAID;

	await tx.payment.update({
		where: {
			id: payment.id,
		},
		data: {
			status: PaymentStatus.PAID,
			paidAt: effectivePaidAt,
			failedAt: null,
			cancelledAt: null,
			...(stripeData.checkoutSessionId
				? {
						stripeCheckoutSessionId: stripeData.checkoutSessionId,
					}
				: {}),
			...(stripeData.paymentIntentId
				? {
						stripePaymentIntentId: stripeData.paymentIntentId,
					}
				: {}),
			...(stripeData.customerId
				? {
						stripeCustomerId: stripeData.customerId,
					}
				: {}),
		},
	});

	const creditGrant = await tx.creditGrant.upsert({
		where: {
			paymentId: payment.id,
		},
		update: {},
		create: {
			recruiterId: payment.recruiterId,
			planId: payment.planId,
			paymentId: payment.id,
			source: CreditSource.PURCHASE,
			totalCredits: snapshot.assessmentCredits,
			remainingCredits: snapshot.assessmentCredits,
			expiresAt,
		},
		select: {
			id: true,
			totalCredits: true,
			remainingCredits: true,
			expiresAt: true,
		},
	});

	if (!paymentWasPaid) {
		await auditService.create(
			{
				actorUserId: payment.recruiter.userId,
				action: AUDIT_ACTIONS.PAYMENT_PAID,
				entityType: AUDIT_ENTITY_TYPES.PAYMENT,
				entityId: payment.id,
				metadata: {
					planCode: snapshot.planCode,
					amount: payment.amount.toString(),
					currency: payment.currency,
					assessmentCredits: snapshot.assessmentCredits,
					validityDays: snapshot.validityDays,
				},
			},
			tx,
		);

		await auditService.create(
			{
				actorUserId: payment.recruiter.userId,
				action: AUDIT_ACTIONS.CREDIT_GRANTED,
				entityType: AUDIT_ENTITY_TYPES.CREDIT_GRANT,
				entityId: creditGrant.id,
				metadata: {
					paymentId: payment.id,
					planCode: snapshot.planCode,
					totalCredits: creditGrant.totalCredits,
					expiresAt: creditGrant.expiresAt?.toISOString() ?? null,
				},
			},
			tx,
		);
	}

	return creditGrant;
};

const markPaymentFailed = async (
	tx: Prisma.TransactionClient,
	paymentId: string,
	stripeData: {
		checkoutSessionId?: string | null;
		paymentIntentId?: string | null;
		customerId?: string | null;
	},
) => {
	const locked = await lockPayment(tx, paymentId);

	if (locked.status !== PaymentStatus.PENDING) {
		return;
	}

	const payment = await tx.payment.update({
		where: {
			id: paymentId,
		},
		data: {
			status: PaymentStatus.FAILED,
			failedAt: new Date(),
			...(stripeData.checkoutSessionId
				? {
						stripeCheckoutSessionId: stripeData.checkoutSessionId,
					}
				: {}),
			...(stripeData.paymentIntentId
				? {
						stripePaymentIntentId: stripeData.paymentIntentId,
					}
				: {}),
			...(stripeData.customerId
				? {
						stripeCustomerId: stripeData.customerId,
					}
				: {}),
		},
		select: {
			id: true,
			recruiter: {
				select: {
					userId: true,
				},
			},
		},
	});

	await auditService.create(
		{
			actorUserId: payment.recruiter.userId,
			action: AUDIT_ACTIONS.PAYMENT_FAILED,
			entityType: AUDIT_ENTITY_TYPES.PAYMENT,
			entityId: payment.id,
		},
		tx,
	);
};

const markPaymentCancelled = async (
	tx: Prisma.TransactionClient,
	paymentId: string,
	checkoutSessionId: string | null,
) => {
	const locked = await lockPayment(tx, paymentId);

	if (locked.status !== PaymentStatus.PENDING) {
		return;
	}

	const payment = await tx.payment.update({
		where: {
			id: paymentId,
		},
		data: {
			status: PaymentStatus.CANCELLED,
			cancelledAt: new Date(),
			...(checkoutSessionId
				? {
						stripeCheckoutSessionId: checkoutSessionId,
					}
				: {}),
		},
		select: {
			id: true,
			recruiter: {
				select: {
					userId: true,
				},
			},
		},
	});

	await auditService.create(
		{
			actorUserId: payment.recruiter.userId,
			action: AUDIT_ACTIONS.PAYMENT_CANCELLED,
			entityType: AUDIT_ENTITY_TYPES.PAYMENT,
			entityId: payment.id,
		},
		tx,
	);
};

const verifyCheckoutAmount = async (
	tx: Prisma.TransactionClient,
	paymentId: string,
	amountTotal: number | null,
	currency: string | null,
) => {
	const payment = await tx.payment.findUnique({
		where: {
			id: paymentId,
		},
		select: {
			amount: true,
			currency: true,
		},
	});

	if (!payment) {
		throw new AppError(500, "Payment record not found");
	}

	const expectedAmount = toMinorUnits(payment.amount);

	if (
		amountTotal !== expectedAmount ||
		currency?.toUpperCase() !== payment.currency.toUpperCase()
	) {
		throw new AppError(409, "Stripe payment amount or currency mismatch");
	}
};

const verifyPaymentIntentAmount = async (
	tx: Prisma.TransactionClient,
	paymentId: string,
	intent: Stripe.PaymentIntent,
) => {
	await verifyCheckoutAmount(tx, paymentId, intent.amount, intent.currency);
};

const getPlans = async () => {
	return prisma.pricingPlan.findMany({
		where: {
			isActive: true,
		},
		orderBy: {
			price: "asc",
		},
		select: {
			id: true,
			code: true,
			name: true,
			price: true,
			currency: true,
			assessmentCredits: true,
			validityDays: true,
		},
	});
};

const createCheckout = async (
	userId: string,
	input: CreateCheckoutInput,
	ipAddress?: string,
) => {
	const recruiter = await getRecruiterContext(userId);

	const plan = await prisma.pricingPlan.findFirst({
		where: {
			code: input.planCode,
			isActive: true,
		},
		select: {
			id: true,
			code: true,
			name: true,
			price: true,
			currency: true,
			assessmentCredits: true,
			validityDays: true,
		},
	});

	if (!plan) {
		throw new AppError(404, "Pricing plan not found");
	}

	if (
		!PAYMENT_CONSTANTS.PURCHASABLE_PLAN_CODES.includes(
			plan.code as (typeof PAYMENT_CONSTANTS.PURCHASABLE_PLAN_CODES)[number],
		)
	) {
		throw new AppError(400, "This pricing plan cannot be purchased");
	}

	const amountMinor = toMinorUnits(plan.price);

	if (
		amountMinor <= 0 ||
		plan.assessmentCredits <= 0 ||
		plan.validityDays <= 0
	) {
		throw new AppError(409, "Pricing plan configuration is invalid");
	}

	const recruiterProfile = await prisma.recruiterProfile.findUnique({
		where: {
			id: recruiter.recruiterId,
		},
		select: {
			user: {
				select: {
					email: true,
				},
			},
		},
	});

	if (!recruiterProfile) {
		throw new AppError(404, "Recruiter profile not found");
	}

	const payment = await prisma.payment.create({
		data: {
			recruiterId: recruiter.recruiterId,
			planId: plan.id,
			amount: plan.price,
			currency: plan.currency,
			status: PaymentStatus.PENDING,
			metadata: {
				planCode: plan.code,
				assessmentCredits: plan.assessmentCredits,
				validityDays: plan.validityDays,
			},
		},
		select: {
			id: true,
			idempotencyKey: true,
			status: true,
			createdAt: true,
		},
	});

	try {
		const session = await createStripeCheckoutSession({
			paymentId: payment.id,
			idempotencyKey: payment.idempotencyKey,
			recruiterId: recruiter.recruiterId,
			customerEmail: recruiterProfile.user.email,
			planId: plan.id,
			planCode: plan.code,
			planName: plan.name,
			assessmentCredits: plan.assessmentCredits,
			validityDays: plan.validityDays,
			amountMinor,
			currency: plan.currency,
		});

		if (!session.url) {
			throw new AppError(502, "Stripe Checkout URL was not returned");
		}

		await prisma.payment.update({
			where: {
				id: payment.id,
			},
			data: {
				stripeCheckoutSessionId: session.id,
			},
		});

		await auditService.create({
			actorUserId: userId,
			action: AUDIT_ACTIONS.PAYMENT_CHECKOUT_CREATED,
			entityType: AUDIT_ENTITY_TYPES.PAYMENT,
			entityId: payment.id,
			metadata: {
				planCode: plan.code,
				assessmentCredits: plan.assessmentCredits,
				validityDays: plan.validityDays,
				checkoutSessionId: session.id,
			},
			...(ipAddress
				? {
						ipAddress,
					}
				: {}),
		});

		return {
			paymentId: payment.id,
			status: PaymentStatus.PENDING,
			plan,
			checkoutSessionId: session.id,
			checkoutUrl: session.url,
		};
	} catch (error) {
		await prisma.payment.updateMany({
			where: {
				id: payment.id,
				status: PaymentStatus.PENDING,
			},
			data: {
				status: PaymentStatus.FAILED,
				failedAt: new Date(),
			},
		});

		if (error instanceof AppError) {
			throw error;
		}

		throw new AppError(502, "Unable to create Stripe Checkout session");
	}
};

const getMine = async (userId: string, query: PaymentListQuery) => {
	const recruiter = await getRecruiterContext(userId);

	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "createdAt",
		sortOrder: "desc",
	});

	const where: Prisma.PaymentWhereInput = {
		recruiterId: recruiter.recruiterId,
		...(query.status
			? {
					status: query.status,
				}
			: {}),
	};

	const [payments, total] = await prisma.$transaction([
		prisma.payment.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				createdAt: "desc",
			},
			select: {
				id: true,
				amount: true,
				currency: true,
				status: true,
				paidAt: true,
				failedAt: true,
				cancelledAt: true,
				refundedAt: true,
				createdAt: true,
				metadata: true,
				plan: {
					select: {
						code: true,
						name: true,
					},
				},
				creditGrant: {
					select: {
						id: true,
						totalCredits: true,
						remainingCredits: true,
						expiresAt: true,
					},
				},
			},
		}),
		prisma.payment.count({
			where,
		}),
	]);

	const items = payments.map((payment) => {
		let snapshot: PaymentPlanSnapshot | null = null;

		try {
			snapshot = getPaymentPlanSnapshot(payment.metadata);
		} catch {
			snapshot = null;
		}

		return {
			id: payment.id,
			amount: payment.amount,
			currency: payment.currency,
			status: payment.status,
			paidAt: payment.paidAt,
			failedAt: payment.failedAt,
			cancelledAt: payment.cancelledAt,
			refundedAt: payment.refundedAt,
			createdAt: payment.createdAt,
			plan: {
				code: snapshot?.planCode ?? payment.plan.code,
				name: payment.plan.name,
				assessmentCredits: snapshot?.assessmentCredits ?? null,
				validityDays: snapshot?.validityDays ?? null,
			},
			creditGrant: payment.creditGrant,
		};
	});

	return {
		items,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getById = async (userId: string, paymentId: string) => {
	const recruiter = await getRecruiterContext(userId);

	const payment = await prisma.payment.findFirst({
		where: {
			id: paymentId,
			recruiterId: recruiter.recruiterId,
		},
		select: {
			id: true,
			amount: true,
			currency: true,
			status: true,
			stripeCheckoutSessionId: true,
			stripePaymentIntentId: true,
			paidAt: true,
			failedAt: true,
			cancelledAt: true,
			refundedAt: true,
			createdAt: true,
			updatedAt: true,
			metadata: true,
			plan: {
				select: {
					id: true,
					code: true,
					name: true,
				},
			},
			creditGrant: {
				select: {
					id: true,
					source: true,
					totalCredits: true,
					remainingCredits: true,
					expiresAt: true,
					createdAt: true,
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(404, "Payment not found");
	}

	let snapshot: PaymentPlanSnapshot | null = null;

	try {
		snapshot = getPaymentPlanSnapshot(payment.metadata);
	} catch {
		snapshot = null;
	}

	return {
		id: payment.id,
		amount: payment.amount,
		currency: payment.currency,
		status: payment.status,
		stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
		stripePaymentIntentId: payment.stripePaymentIntentId,
		paidAt: payment.paidAt,
		failedAt: payment.failedAt,
		cancelledAt: payment.cancelledAt,
		refundedAt: payment.refundedAt,
		createdAt: payment.createdAt,
		updatedAt: payment.updatedAt,
		plan: {
			id: payment.plan.id,
			code: snapshot?.planCode ?? payment.plan.code,
			name: payment.plan.name,
			assessmentCredits: snapshot?.assessmentCredits ?? null,
			validityDays: snapshot?.validityDays ?? null,
		},
		creditGrant: payment.creditGrant,
	};
};

const getCredits = async (userId: string) => {
	const recruiter = await getRecruiterContext(userId);

	const now = new Date();

	const grants = await prisma.creditGrant.findMany({
		where: {
			recruiterId: recruiter.recruiterId,
		},
		orderBy: [
			{
				expiresAt: "asc",
			},
			{
				createdAt: "asc",
			},
		],
		select: {
			id: true,
			source: true,
			totalCredits: true,
			remainingCredits: true,
			expiresAt: true,
			createdAt: true,
			plan: {
				select: {
					code: true,
					name: true,
				},
			},
		},
	});

	const available = grants.filter(
		(grant) =>
			grant.remainingCredits > 0 && (!grant.expiresAt || grant.expiresAt > now),
	);

	const availableCredits = available.reduce(
		(total, grant) => total + grant.remainingCredits,
		0,
	);

	const freeCredits = available
		.filter((grant) => grant.source === CreditSource.FREE)
		.reduce((total, grant) => total + grant.remainingCredits, 0);

	const purchasedCredits = available
		.filter((grant) => grant.source === CreditSource.PURCHASE)
		.reduce((total, grant) => total + grant.remainingCredits, 0);

	return {
		availableCredits,
		freeCredits,
		purchasedCredits,
		grants: grants.map((grant) => ({
			...grant,
			isExpired: Boolean(grant.expiresAt && grant.expiresAt <= now),
			isUsable:
				grant.remainingCredits > 0 &&
				(!grant.expiresAt || grant.expiresAt > now),
		})),
	};
};

const handleWebhook = async (event: Stripe.Event) => {
	const objectId = getEventObjectId(event);

	const webhook = await prisma.stripeWebhookEvent.upsert({
		where: {
			stripeEventId: event.id,
		},
		update: {},
		create: {
			stripeEventId: event.id,
			eventType: event.type,
			objectId,
			status: StripeWebhookStatus.RECEIVED,
		},
		select: {
			id: true,
			status: true,
			processedAt: true,
		},
	});

	if (webhook.status === StripeWebhookStatus.PROCESSED && webhook.processedAt) {
		return {
			duplicate: true,
			eventId: event.id,
		};
	}

	const isSupported = PAYMENT_CONSTANTS.SUPPORTED_WEBHOOK_EVENTS.includes(
		event.type as (typeof PAYMENT_CONSTANTS.SUPPORTED_WEBHOOK_EVENTS)[number],
	);

	if (!isSupported) {
		await prisma.stripeWebhookEvent.update({
			where: {
				stripeEventId: event.id,
			},
			data: {
				status: StripeWebhookStatus.PROCESSED,
				processedAt: new Date(),
				errorMessage: null,
			},
		});

		return {
			duplicate: false,
			eventId: event.id,
			ignored: true,
		};
	}

	const paymentId = getPaymentIdFromEvent(event);

	if (!paymentId) {
		await prisma.stripeWebhookEvent.update({
			where: {
				stripeEventId: event.id,
			},
			data: {
				status: StripeWebhookStatus.FAILED,
				errorMessage: "Stripe event does not contain paymentId",
			},
		});

		throw new AppError(500, "Stripe event does not contain paymentId");
	}

	try {
		await prisma.$transaction(async (tx) => {
			await tx.stripeWebhookEvent.update({
				where: {
					stripeEventId: event.id,
				},
				data: {
					paymentId,
					status: StripeWebhookStatus.RECEIVED,
					errorMessage: null,
				},
			});

			if (
				event.type === "checkout.session.completed" ||
				event.type === "checkout.session.async_payment_succeeded"
			) {
				const session = event.data.object as Stripe.Checkout.Session;

				await verifyCheckoutAmount(
					tx,
					paymentId,
					session.amount_total,
					session.currency,
				);

				const stripeData = {
					checkoutSessionId: session.id,
					paymentIntentId: getStripeObjectId(session.payment_intent),
					customerId: getStripeObjectId(session.customer),
				};

				if (
					event.type === "checkout.session.async_payment_succeeded" ||
					session.payment_status === "paid"
				) {
					await grantPurchasedCredits(
						tx,
						paymentId,
						new Date(event.created * 1000),
						stripeData,
					);
				} else {
					await tx.payment.update({
						where: {
							id: paymentId,
						},
						data: {
							stripeCheckoutSessionId: session.id,
							...(stripeData.paymentIntentId
								? {
										stripePaymentIntentId: stripeData.paymentIntentId,
									}
								: {}),
							...(stripeData.customerId
								? {
										stripeCustomerId: stripeData.customerId,
									}
								: {}),
						},
					});
				}
			}

			if (event.type === "payment_intent.succeeded") {
				const intent = event.data.object as Stripe.PaymentIntent;

				await verifyPaymentIntentAmount(tx, paymentId, intent);

				await grantPurchasedCredits(
					tx,
					paymentId,
					new Date(event.created * 1000),
					{
						paymentIntentId: intent.id,
						customerId: getStripeObjectId(intent.customer),
					},
				);
			}

			if (event.type === "checkout.session.async_payment_failed") {
				const session = event.data.object as Stripe.Checkout.Session;

				await markPaymentFailed(tx, paymentId, {
					checkoutSessionId: session.id,
					paymentIntentId: getStripeObjectId(session.payment_intent),
					customerId: getStripeObjectId(session.customer),
				});
			}

			if (event.type === "payment_intent.payment_failed") {
				const intent = event.data.object as Stripe.PaymentIntent;

				await markPaymentFailed(tx, paymentId, {
					paymentIntentId: intent.id,
					customerId: getStripeObjectId(intent.customer),
				});
			}

			if (event.type === "checkout.session.expired") {
				const session = event.data.object as Stripe.Checkout.Session;

				await markPaymentCancelled(tx, paymentId, session.id);
			}

			await tx.stripeWebhookEvent.update({
				where: {
					stripeEventId: event.id,
				},
				data: {
					status: StripeWebhookStatus.PROCESSED,
					processedAt: new Date(),
					errorMessage: null,
				},
			});
		});

		return {
			duplicate: false,
			eventId: event.id,
			processed: true,
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message.slice(0, 2000)
				: "Stripe webhook processing failed";

		await prisma.stripeWebhookEvent.update({
			where: {
				stripeEventId: event.id,
			},
			data: {
				status: StripeWebhookStatus.FAILED,
				errorMessage: message,
			},
		});

		throw error;
	}
};

export const paymentService = {
	getPlans,
	createCheckout,
	getMine,
	getById,
	getCredits,
	handleWebhook,
};
