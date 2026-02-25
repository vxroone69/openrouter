import { t } from "elysia";

export namespace AuthModel {
    export const signinSchema = t.Object({
        email: t.String(),
        password: t.String(),
    })

    export type signinSchema = typeof signinSchema.static;

    export const signinResponseSchema = t.Object({
        token: t.String(),
    })

    export type signinResponseSchema = typeof signinResponseSchema.static;

    export const signupSchema = t.Object({
        email: t.String(),
        password: t.String(),
    })

    export type signupSchema = typeof signupSchema.static;

    export const signupResponseSchema = t.Object({
        id: t.String(),
    })

    export const signupFailureSchema = t.Object({
        message: t.Literal("Error while signing up")
    })

    export type signupResponseSchema = typeof signupResponseSchema.static;

    export type signupFailureSchema = typeof signupFailureSchema.static;

} 