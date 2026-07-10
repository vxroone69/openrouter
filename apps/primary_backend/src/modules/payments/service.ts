import { prisma } from "db"

const ONRAMP_AMOUNT = 1000;
const CREDIT_PACKAGES = {
    starter: 10_000,
    growth: 50_000,
    scale: 200_000,
} as const;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;

export abstract class PaymentsService {

    static async onramp(userId: number) {
        const [user] = await prisma.$transaction([
            prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    credits: {
                        increment: ONRAMP_AMOUNT
                    }
                }
            }),
            prisma.onrampTransaction.create({
                data: {
                    userId,
                    amount: ONRAMP_AMOUNT,
                    status: "completed"
                }
            })
        ])

        return user.credits;
    }

    static async purchaseCredits(userId: number, packageId: CreditPackageId) {
        const amount = CREDIT_PACKAGES[packageId];

        const [user] = await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: {
                    credits: {
                        increment: amount,
                    },
                },
            }),
            prisma.onrampTransaction.create({
                data: {
                    userId,
                    amount,
                    status: `mock_${packageId}`,
                },
            }),
        ]);

        return user.credits;
    }

    static async upgradeToPro(userId: number) {
        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                plan: "pro",
            },
            select: {
                credits: true,
                plan: true,
            },
        });

        return user;
    }
}
