import { prisma } from "../lib/prisma/index.js";

const plans = [
	{
		code: "FREE",
		name: "Free",
		price: 0,
		currency: "USD",
		assessmentCredits: 2,
		validityDays: 0,
	},
	{
		code: "PLUS",
		name: "Plus",
		price: 2,
		currency: "USD",
		assessmentCredits: 1,
		validityDays: 30,
	},
	{
		code: "PRO",
		name: "Pro",
		price: 5,
		currency: "USD",
		assessmentCredits: 4,
		validityDays: 45,
	},
	{
		code: "PREMIUM",
		name: "Premium",
		price: 12,
		currency: "USD",
		assessmentCredits: 15,
		validityDays: 60,
	},
] as const;

export const seedPlans = async () => {
	for (const plan of plans) {
		await prisma.pricingPlan.upsert({
			where: {
				code: plan.code,
			},
			update: {
				name: plan.name,
				price: plan.price,
				currency: plan.currency,
				assessmentCredits: plan.assessmentCredits,
				validityDays: plan.validityDays,
				isActive: true,
			},
			create: {
				code: plan.code,
				name: plan.name,
				price: plan.price,
				currency: plan.currency,
				assessmentCredits: plan.assessmentCredits,
				validityDays: plan.validityDays,
				isActive: true,
			},
		});
	}
};