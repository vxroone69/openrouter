import { Elysia } from "elysia";
import { AuthModel } from "./models";
import { AuthService } from "./service";
import jwt from "@elysiajs/jwt";

const isProduction = process.env.NODE_ENV === "production";

export const app = new Elysia({ prefix: "auth" })
    .use(
        jwt({
            name: 'jwt',
            secret: process.env.JWT_SECRET!
        })
    )
    .post("/sign-up", async ({ body, status }) => {
        try {
            const email = body.email.trim().toLowerCase();
            const password = body.password;

            if (!email.includes("@") || !email.includes(".")) {
                return status(400, {
                    message: "Enter a valid email address"
                })
            }

            if (password.length < 8) {
                return status(400, {
                    message: "Password must be at least 8 characters"
                })
            }

            const userId = await AuthService.signup(email, password);
            return {
                id: userId
            }
        } catch(e) {
            if (e instanceof Error && e.message === "EMAIL_ALREADY_EXISTS") {
                return status(409, {
                    message: "An account with this email already exists"
                })
            }

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
            409: AuthModel.signupFailureSchema,
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
                sameSite: isProduction ? "none" : "lax",
                secure: isProduction,
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
    .post("/sign-out", async ({ set }) => {
        set.cookie = {
            auth: {
                value: "",
                httpOnly: true,
                maxAge: 0,
                path: "/",
                sameSite: isProduction ? "none" : "lax",
                secure: isProduction,
            },
        };

        return {
            message: "Signed out successfully",
        };
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
