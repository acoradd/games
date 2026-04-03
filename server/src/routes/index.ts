import { Router } from "express";
import gameModeRoutes from "./gameMode.routes.js";
import playerRoutes from "./player.routes.js";
import profileRoutes from "./profile.routes.js";

const apiRouter = Router();

apiRouter.use("/game-modes", gameModeRoutes);
apiRouter.use("/players", playerRoutes);
apiRouter.use("/profile", profileRoutes);

export default apiRouter;
