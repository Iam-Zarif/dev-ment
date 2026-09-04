import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { adminController } from "../modules/admin/admin.controller.js";
import {
	adminAuditListQuerySchema,
	adminCompanyListQuerySchema,
	adminCreditGrantSchema,
	adminPaymentListQuerySchema,
	adminUserListQuerySchema,
	updateCompanyVerificationSchema,
	updatePricingPlanSchema,
	updateUserStatusSchema,
} from "../modules/admin/admin.validation.js";

const router = Router();

router.use(auth(UserRole.ADMIN));

router.get("/dashboard", adminController.getDashboard);

router.get(
	"/users",
	validateRequest({
		query: adminUserListQuerySchema,
	}),
	adminController.getUsers,
);

router.get(
	"/users/:id",
	validateRequest({
		params: idParamSchema,
	}),
	adminController.getUserById,
);

router.patch(
	"/users/:id/status",
	validateRequest({
		params: idParamSchema,
		body: updateUserStatusSchema,
	}),
	adminController.updateUserStatus,
);

router.delete(
	"/users/:id",
	validateRequest({
		params: idParamSchema,
	}),
	adminController.deleteUser,
);

router.get(
	"/companies",
	validateRequest({
		query: adminCompanyListQuerySchema,
	}),
	adminController.getCompanies,
);

router.patch(
	"/companies/:id/verification",
	validateRequest({
		params: idParamSchema,
		body: updateCompanyVerificationSchema,
	}),
	adminController.updateCompanyVerification,
);

router.get("/pricing-plans", adminController.getPricingPlans);

router.patch(
	"/pricing-plans/:id",
	validateRequest({
		params: idParamSchema,
		body: updatePricingPlanSchema,
	}),
	adminController.updatePricingPlan,
);

router.get(
	"/recruiters/:id/credits",
	validateRequest({
		params: idParamSchema,
	}),
	adminController.getRecruiterCredits,
);

router.post(
	"/recruiters/:id/credits",
	validateRequest({
		params: idParamSchema,
		body: adminCreditGrantSchema,
	}),
	adminController.grantRecruiterCredits,
);

router.get(
	"/payments",
	validateRequest({
		query: adminPaymentListQuerySchema,
	}),
	adminController.getPayments,
);

router.get(
	"/audit-logs",
	validateRequest({
		query: adminAuditListQuerySchema,
	}),
	adminController.getAuditLogs,
);

export default router;
