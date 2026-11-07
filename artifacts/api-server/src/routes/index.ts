import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import rosterRouter from "./roster";
import sessionsRouter from "./sessions";
import statsRouter from "./stats";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(rosterRouter);
router.use(sessionsRouter);
router.use(statsRouter);
router.use(voiceRouter);

export default router;
