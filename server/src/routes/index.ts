import { Router } from "express";
import gameModeRoutes from "./gameMode.routes.js";
import playerRoutes from "./player.routes.js";

const apiRouter = Router();

apiRouter.use("/game-modes", gameModeRoutes);
apiRouter.use("/players", playerRoutes);

export default apiRouter;
