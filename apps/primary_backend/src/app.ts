import "dotenv/config";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import {app as authApp} from "./modules/auth"
import {app as apiKeyApp} from "./modules/apiKeys"
import {app as modelsApp} from "./modules/models"
import {app as paymentsApp} from "./modules/payments"

export const app = new Elysia()
      .use(cors({
      origin: "http://localhost:3001",
      credentials: true
      }))
      .use(authApp)
      .use(apiKeyApp)
      .use(modelsApp)
      .use(paymentsApp)


export type App = typeof app;
