import { t } from "elysia";

export namespace AuthModel {

    //sign-in handlers
    
    export const signinSchema = t.Object({
        email: t.String(),
        password: t.String(),
    })

    export type signinSchema = typeof signinSchema.static;

    export const signinResponseSchema = t.Object({
        token: t.String(),
    })

    export type signinResponseSchema = typeof signinResponseSchema.static;

    export const signinFailureSchema = t.Object({
        message: t.Literal("Error while signing in")
    })

    export type signinFailureSchema = typeof signinFailureSchema.static;
   
   
    //sign-up handlers

    export const signupSchema = t.Object({
        email: t.String(),
        password: t.String(),
    })

    export type signupSchema = typeof signupSchema.static;

    export const signupResponseSchema = t.Object({
        id: t.String(),
    })

    export type signupResponseSchema = typeof signupResponseSchema.static;

    export const signupFailureSchema = t.Object({
        message: t.Literal("Error while signing up")
    })

    export type signupFailureSchema = typeof signupFailureSchema.static;

} 