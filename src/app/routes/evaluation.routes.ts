import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { evaluationController } from "../modules/evaluation/evaluation.controller.js";
import {
	evaluationListQuerySchema,
	evaluationQuestionParamsSchema,
	finalizeEvaluationSchema,
	manualEvaluationSchema,
} from "../modules/evaluation/evaluation.validation.js";

const router = Router();

router.get(
	"/results/me/:id",
	auth(UserRole.CANDIDATE),
	validateRequest({
		params: idParamSchema,
	}),
	evaluationController.getCandidateResult,
);

router.use(auth(UserRole.RECRUITER));

router.get(
	"/",
	validateRequest({
		query: evaluationListQuerySchema,
	}),
	evaluationController.getAll,
);

router.get(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	evaluationController.getById,
);

router.patch(
	"/:id/questions/:assessmentQuestionId",
	validateRequest({
		params: evaluationQuestionParamsSchema,
		body: manualEvaluationSchema,
	}),
	evaluationController.reviewAnswer,
);

router.post(
	"/:id/evaluate",
	validateRequest({
		params: idParamSchema,
	}),
	evaluationController.evaluate,
);

router.post(
	"/:id/finalize",
	validateRequest({
		params: idParamSchema,
		body: finalizeEvaluationSchema,
	}),
	evaluationController.finalize,
);

router.post(
	"/:id/release",
	validateRequest({
		params: idParamSchema,
	}),
	evaluationController.release,
);

export default router;
