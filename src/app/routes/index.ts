import { Router } from "express";
import assessmentRouter from "./assessment.routes.js";
import authRouter from "./auth.routes.js";
import questionRouter from "./question.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/questions", questionRouter);
router.use("/assessments", assessmentRouter);

export default router;
