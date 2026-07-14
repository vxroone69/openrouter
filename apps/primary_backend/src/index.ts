import "dotenv/config";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { app as authApp } from "./modules/auth";
import { app as apiKeyApp } from "./modules/apiKeys";
import { app as modelsApp } from "./modules/models";
import { app as memoryApp } from "./modules/memory";
import { app as analyticsApp } from "./modules/analytics";
import { app as paymentsApp } from "./modules/payments";
import { prisma } from "db";

const port = Number(process.env.PORT ?? 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3001";

export const app = new Elysia()
    .use(
        cors({
            origin: frontendOrigin,
            credentials: true,
        })
    )
    .get("/", () => ({
        service: "synapse-primary-backend",
        status: "ok",
        frontend: frontendOrigin,
        routes: ["/auth", "/api-keys", "/models", "/memory", "/api/v1/analytics", "/payments"],
    }))
    .get("/health/db", async ({ status }) => {
        try {
            await prisma.$queryRaw`SELECT 1`;
            return {
                service: "synapse-primary-backend",
                database: "ok",
            };
        } catch (error) {
            console.error("DATABASE HEALTH CHECK FAILED:", error);
            return status(503, {
                service: "synapse-primary-backend",
                database: "unreachable",
            });
        }
    })
    .use(authApp)
    .use(apiKeyApp)
    .use(modelsApp)
    .use(memoryApp)
    .use(analyticsApp)
    .use(paymentsApp)
    .listen(port);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
