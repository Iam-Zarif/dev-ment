import { Router } from "express";
import applicationRouter from "./application.routes.js";
import assessmentRouter from "./assessment.routes.js";
import attemptRouter from "./attempt.routes.js";
import authRouter from "./auth.routes.js";
import evaluationRouter from "./evaluation.routes.js";
import invitationRouter from "./invitation.routes.js";
import questionRouter from "./question.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/questions", questionRouter);
router.use("/assessments", assessmentRouter);
router.use("/applications", applicationRouter);
router.use("/invitations", invitationRouter);
router.use("/attempts", attemptRouter);
router.use("/evaluations", evaluationRouter);

export default router;
