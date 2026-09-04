import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { applicationController } from "../modules/application/application.controller.js";
import {
	applicationListQuerySchema,
	applyAssessmentSchema,
	rejectApplicationSchema,
} from "../modules/application/application.validation.js";

const router = Router();

router.post(
	"/",
	auth(UserRole.CANDIDATE),
	validateRequest({
		body: applyAssessmentSchema,
	}),
	applicationController.apply,
);

router.get(
	"/me",
	auth(UserRole.CANDIDATE),
	validateRequest({
		query: applicationListQuerySchema,
	}),
	applicationController.getMine,
);

router.get(
	"/me/:id",
	auth(UserRole.CANDIDATE),
	validateRequest({
		params: idParamSchema,
	}),
	applicationController.getMineById,
);

router.get(
	"/recruiter",
	auth(UserRole.RECRUITER),
	validateRequest({
		query: applicationListQuerySchema,
	}),
	applicationController.getRecruiterApplications,
);

router.get(
	"/recruiter/:id",
	auth(UserRole.RECRUITER),
	validateRequest({
		params: idParamSchema,
	}),
	applicationController.getRecruiterApplicationById,
);

router.post(
	"/:id/shortlist",
	auth(UserRole.RECRUITER),
	validateRequest({
		params: idParamSchema,
	}),
	applicationController.shortlist,
);

router.post(
	"/:id/reject",
	auth(UserRole.RECRUITER),
	validateRequest({
		params: idParamSchema,
		body: rejectApplicationSchema,
	}),
	applicationController.reject,
);

export default router;
