import { prisma } from "db";
import Stripe from "stripe";

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is missing");
    }

    return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function appUrl() {
    return process.env.APP_URL ?? "http://localhost:3001";
}

const CREDIT_PACKAGES = {
    starter: { credits: 10_000, amountUsd: 5 },
    growth: { credits: 50_000, amountUsd: 20 },
    scale: { credits: 200_000, amountUsd: 60 },
} as const;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;

export abstract class PaymentsService {
    static async createCreditCheckout(userId: number, packageId: CreditPackageId) {
        const pack = CREDIT_PACKAGES[packageId];
        const stripe = getStripe();

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `${pack.credits.toLocaleString()} Synapse Credits`,
                        },
                        unit_amount: pack.amountUsd * 100,
                    },
                    quantity: 1,
                },
            ],
            success_url: `${appUrl()}/credits?checkout=success`,
            cancel_url: `${appUrl()}/credits?checkout=cancelled`,
            metadata: {
                userId: String(userId),
                type: "credits",
                packageId,
                credits: String(pack.credits),
            },
        });

        await prisma.onrampTransaction.create({
            data: {
                userId,
                amount: pack.credits,
                status: "pending",
                provider: "stripe",
                providerSessionId: session.id,
                packageId,
                type: "credits",
                metadata: {
                    stripeCheckoutUrl: session.url,
                    amountUsd: pack.amountUsd,
                },
            },
        });

        return {
            url: session.url!,
        };
    }

    static async createProCheckout(userId: number) {
        const stripe = getStripe();

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: "Synapse Pro Upgrade",
                        },
                        unit_amount: 1900,
                    },
                    quantity: 1,
                },
            ],
            success_url: `${appUrl()}/credits?upgrade=success`,
            cancel_url: `${appUrl()}/credits?upgrade=cancelled`,
            metadata: {
                userId: String(userId),
                type: "pro_upgrade",
            },
        });

        await prisma.onrampTransaction.create({
            data: {
                userId,
                amount: 0,
                status: "pending",
                provider: "stripe",
                providerSessionId: session.id,
                packageId: "pro",
                type: "pro_upgrade",
                metadata: {
                    stripeCheckoutUrl: session.url,
                    amountUsd: 19,
                },
            },
        });

        return {
            url: session.url!,
        };
    }

    static async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
        const userId = Number(session.metadata?.userId);
        const type = session.metadata?.type;

        if (!userId || !type) {
            throw new Error("Missing checkout metadata");
        }

        const existing = await prisma.onrampTransaction.findUnique({
            where: {
                providerSessionId: session.id,
            },
        });

        if (existing?.status === "completed") {
            return;
        }

        if (type === "credits") {
            const credits = Number(session.metadata?.credits);
            const packageId = session.metadata?.packageId ?? "unknown";

            await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        credits: {
                            increment: credits,
                        },
                    },
                }),
                prisma.onrampTransaction.upsert({
                    where: {
                        providerSessionId: session.id,
                    },
                    update: {
                        status: "completed",
                        providerPaymentIntentId:
                            typeof session.payment_intent === "string"
                                ? session.payment_intent
                                : session.payment_intent?.id,
                        amount: credits,
                        packageId,
                    },
                    create: {
                        userId,
                        amount: credits,
                        status: "completed",
                        provider: "stripe",
                        providerSessionId: session.id,
                        providerPaymentIntentId:
                            typeof session.payment_intent === "string"
                                ? session.payment_intent
                                : session.payment_intent?.id,
                        packageId,
                        type: "credits",
                        metadata: session.metadata ?? {},
                    },
                }),
            ]);
        }

        if (type === "pro_upgrade") {
            await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        plan: "pro",
                    },
                }),
                prisma.onrampTransaction.upsert({
                    where: {
                        providerSessionId: session.id,
                    },
                    update: {
                        status: "completed",
                        providerPaymentIntentId:
                            typeof session.payment_intent === "string"
                                ? session.payment_intent
                                : session.payment_intent?.id,
                    },
                    create: {
                        userId,
                        amount: 0,
                        status: "completed",
                        provider: "stripe",
                        providerSessionId: session.id,
                        providerPaymentIntentId:
                            typeof session.payment_intent === "string"
                                ? session.payment_intent
                                : session.payment_intent?.id,
                        packageId: "pro",
                        type: "pro_upgrade",
                        metadata: session.metadata ?? {},
                    },
                }),
            ]);
        }
    }

    static async constructWebhookEvent(rawBody: string, signature: string) {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error("STRIPE_WEBHOOK_SECRET is missing");
        }

        return getStripe().webhooks.constructEventAsync(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    }
}
