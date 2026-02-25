import { Router } from "express";
import { liveness, readiness } from "../controllers/health.controller.js";

const healthRouter = Router();

healthRouter.get("/liveness", liveness);
healthRouter.get("/readiness", readiness);

export default healthRouter;
