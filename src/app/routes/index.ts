import { Router } from "express";
import adminRouter from "./admin.routes.js";
import applicationRouter from "./application.routes.js";
import assessmentRouter from "./assessment.routes.js";
import attemptRouter from "./attempt.routes.js";
import authRouter from "./auth.routes.js";
import evaluationRouter from "./evaluation.routes.js";
import invitationRouter from "./invitation.routes.js";
import paymentRouter from "./payment.routes.js";
import questionRouter from "./question.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/questions", questionRouter);
router.use("/assessments", assessmentRouter);
router.use("/applications", applicationRouter);
router.use("/invitations", invitationRouter);
router.use("/attempts", attemptRouter);
router.use("/evaluations", evaluationRouter);
router.use("/payments", paymentRouter);
router.use("/admin", adminRouter);

export default router;
