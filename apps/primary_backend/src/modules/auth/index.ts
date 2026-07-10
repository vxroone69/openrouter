import { Elysia } from "elysia";
import { AuthModel } from "./models";
import { AuthService } from "./service";
import jwt from "@elysiajs/jwt";

export const app = new Elysia({ prefix: "auth" })
    .use(
        jwt({
            name: 'jwt',
            secret: process.env.JWT_SECRET!
        })
    )
    .post("/sign-up", async ({ body, status }) => {
        try {
            const userId = await AuthService.signup(body.email, body.password);
            return {
                id: userId
            }
        } catch(e) {
            console.error("SIGNUP ERROR:", e);

            return status(400, {
                message: "Error while signing up"
            })
        }
    }, {
        body: AuthModel.signupSchema,
        response: {
            200: AuthModel.signupResponseSchema,
            400: AuthModel.signupFailureSchema,
        }
    })
    .post("/sign-in", async ({ jwt, body, status, set }) => {
        const { correctCredentials, userId } = await AuthService.signin(body.email, body.password);

        if (!correctCredentials || !userId) {
            return status(403, {
                message: "Incorrect credentials",
            });
        }

        const token = await jwt.sign({ userId });

        set.cookie = {
            auth: {
                value: token,
                httpOnly: true,
                maxAge: 7 * 86400,
                path: "/",
                sameSite: "lax",
            },
        };

        return {
            message: "Signed in successfully",
        };
    }, {
        body: AuthModel.signinSchema,
        response: {
            200: AuthModel.signinResponseSchema,
            403: AuthModel.signinFailureSchema
        }
    })
    .resolve(async ({ cookie: { auth }, status, jwt}) => {
        if (!auth) {
            return status(401)
        }

        const decoded = await jwt.verify(auth.value as string);

        if (!decoded || !decoded.userId) {
            return status(401)
        }

        return {
            userId: decoded.userId as string
        }
    })
    .get("/profile", async({ userId, status }) => {
        const userData = await AuthService.getUserDetails(Number(userId));
        if (!userData) {
            return status(400, {
                message: "Error while fetching user details"
            })
        }
        return userData
    }, {
        response: {
            200: AuthModel.profileResponseSchema,
            400: AuthModel.profileResponseErrorSchema
        }
    })
