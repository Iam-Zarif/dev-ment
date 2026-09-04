import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { assessmentController } from "../modules/assessment/assessment.controller.js";
import {
	assessmentListQuerySchema,
	assessmentQuestionParamsSchema,
	attachAssessmentQuestionSchema,
	createAssessmentSchema,
	publishedAssessmentListQuerySchema,
	reorderAssessmentQuestionsSchema,
	updateAssessmentQuestionSchema,
	updateAssessmentSchema,
} from "../modules/assessment/assessment.validation.js";

const router = Router();

router.get(
	"/published",
	validateRequest({
		query: publishedAssessmentListQuerySchema,
	}),
	assessmentController.getPublished,
);

router.get(
	"/published/:id",
	validateRequest({
		params: idParamSchema,
	}),
	assessmentController.getPublishedById,
);

router.use(auth(UserRole.RECRUITER));

router.post(
	"/",
	validateRequest({
		body: createAssessmentSchema,
	}),
	assessmentController.create,
);

router.get(
	"/",
	validateRequest({
		query: assessmentListQuerySchema,
	}),
	assessmentController.getAll,
);

router.patch(
	"/:id/questions/order",
	validateRequest({
		params: idParamSchema,
		body: reorderAssessmentQuestionsSchema,
	}),
	assessmentController.reorderQuestions,
);

router.post(
	"/:id/questions",
	validateRequest({
		params: idParamSchema,
		body: attachAssessmentQuestionSchema,
	}),
	assessmentController.addQuestion,
);

router.patch(
	"/:id/questions/:assessmentQuestionId",
	validateRequest({
		params: assessmentQuestionParamsSchema,
		body: updateAssessmentQuestionSchema,
	}),
	assessmentController.updateQuestion,
);

router.delete(
	"/:id/questions/:assessmentQuestionId",
	validateRequest({
		params: assessmentQuestionParamsSchema,
	}),
	assessmentController.removeQuestion,
);

router.post(
	"/:id/publish",
	validateRequest({
		params: idParamSchema,
	}),
	assessmentController.publish,
);

router.post(
	"/:id/close",
	validateRequest({
		params: idParamSchema,
	}),
	assessmentController.close,
);

router.get(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	assessmentController.getById,
);

router.patch(
	"/:id",
	validateRequest({
		params: idParamSchema,
		body: updateAssessmentSchema,
	}),
	assessmentController.update,
);

router.delete(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	assessmentController.remove,
);

export default router;
