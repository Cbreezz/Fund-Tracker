import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fundTrackerRouter from "./fund-tracker";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fundTrackerRouter);

export default router;
