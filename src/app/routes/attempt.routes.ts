import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import {
	auth,
	validateRequest,
} from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { attemptController } from "../modules/attempt/attempt.controller.js";
import {
	attemptAnswerParamsSchema,
	proctorEventSchema,
	saveAnswerSchema,
	startAttemptSchema,
} from "../modules/attempt/attempt.validation.js";

const router = Router();

router.use(
	auth(UserRole.CANDIDATE),
);

router.post(
	"/start",
	validateRequest({
		body: startAttemptSchema,
	}),
	attemptController.start,
);

router.get(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	attemptController.getById,
);

router.put(
	"/:id/answers/:assessmentQuestionId",
	validateRequest({
		params:
			attemptAnswerParamsSchema,
		body: saveAnswerSchema,
	}),
	attemptController.saveAnswer,
);

router.post(
	"/:id/proctor-events",
	validateRequest({
		params: idParamSchema,
		body: proctorEventSchema,
	}),
	attemptController.recordProctorEvent,
);

router.post(
	"/:id/submit",
	validateRequest({
		params: idParamSchema,
	}),
	attemptController.submit,
);

export default router;