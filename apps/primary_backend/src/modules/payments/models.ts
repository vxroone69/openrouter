import { t } from "elysia";

export namespace PaymentsModel {
    export const onrampResponseSchema = t.Object({
        message: t.Literal("Onramp successful"),
        credits: t.Number()
    })

    export type onrampResponseSchema = typeof onrampResponseSchema.static;

    export const onrampFailedResponseSchema = t.Object({
        message: t.Literal("Onramp failed")
    })

    export type onrampFailedResponseSchema = typeof onrampFailedResponseSchema.static;

    export const purchaseCreditsSchema = t.Object({
        packageId: t.Union([
            t.Literal("starter"),
            t.Literal("growth"),
            t.Literal("scale"),
        ])
    })

    export const upgradeResponseSchema = t.Object({
        message: t.Literal("Upgrade successful"),
        plan: t.Literal("pro"),
        credits: t.Number()
    })
}
