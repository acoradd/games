import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Liveness probe - checks if the application is running
 * Returns 200 OK if the process is alive
 */
export async function liveness(req: Request, res: Response) {
    res.status(200).json({ status: "ok" });
}

/**
 * Readiness probe - checks if the application is ready to serve traffic
 * Verifies database connectivity and other critical services
 */
export async function readiness(req: Request, res: Response) {
    try {
        // Check database connectivity with a simple query
        await prisma.$queryRaw`SELECT 1`;

        res.status(200).json({
            status: "ready",
            checks: {
                database: "ok"
            }
        });
    } catch (err) {
        console.error("Readiness check failed:", err);
        res.status(503).json({
            status: "not ready",
            checks: {
                database: "error"
            }
        });
    }
}
