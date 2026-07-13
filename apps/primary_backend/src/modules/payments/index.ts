import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";
import Stripe from "stripe";
import { PaymentsModel } from "./models";
import { PaymentsService } from "./service";

export const app = new Elysia({ prefix: "payments" })
    .post("/webhook", async ({ request, headers, status }) => {
        const signature = headers["stripe-signature"];

        if (!signature) {
            return status(400, { message: "Missing Stripe signature" });
        }

        const rawBody = await request.text();

        try {
            const event = await PaymentsService.constructWebhookEvent(rawBody, signature);

            if (event.type === "checkout.session.completed") {
                await PaymentsService.handleCheckoutCompleted(
                    event.data.object as Stripe.Checkout.Session
                );
            }

            return { received: true };
        } catch (error) {
            console.error("STRIPE WEBHOOK ERROR:", error);
            return status(400, { message: "Invalid webhook" });
        }
    }, {
        response: {
            200: t.Object({ received: t.Boolean() }),
            400: t.Object({
                message: t.Union([
                    t.Literal("Missing Stripe signature"),
                    t.Literal("Invalid webhook"),
                ]),
            }),
        },
    })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
        })
    )
    .resolve(async ({ cookie: { auth }, status, jwt }) => {
        if (!auth) {
            return status(401);
        }

        const decoded = await jwt.verify(auth.value as string);

        if (!decoded || !decoded.userId) {
            return status(401);
        }

        return {
            userId: decoded.userId as string,
        };
    })
    .post("/checkout", async ({ userId, body, status }) => {
        try {
            if (body.kind === "credits") {
                if (!body.packageId) {
                    return status(400, { message: "Missing packageId" });
                }

                return await PaymentsService.createCreditCheckout(
                    Number(userId),
                    body.packageId
                );
            }

            return await PaymentsService.createProCheckout(Number(userId));
        } catch (error) {
            console.error("CHECKOUT ERROR:", error);
            return status(500, { message: "Checkout failed" });
        }
    }, {
        body: PaymentsModel.checkoutSchema,
        response: {
            200: PaymentsModel.checkoutResponseSchema,
            400: t.Object({ message: t.Literal("Missing packageId") }),
            500: t.Object({ message: t.Literal("Checkout failed") }),
        },
    });
