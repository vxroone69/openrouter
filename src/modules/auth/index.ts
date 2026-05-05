import { Cookie, Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { AuthModel } from "./models"; 
import { AuthService } from "./service";

export const app = new Elysia({ prefix: "auth" })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!
        })
    )
    .post("/sign-up", async ({body, status}) => {
        // Generate a simple UUID for demo purposes
        try{
        const userId = await AuthService.signup(body.email, body.password)
        
        return {
            id: userId,
            //email: body.email,
            //message: "User created successfully"
        }
    } catch (error) {
        return status(400,{
            message: "Error while signing up"
        })
    }
    }, {
        body: AuthModel.signupSchema,
        response: {
            200: AuthModel.signupResponseSchema,
            400: AuthModel.signupFailureSchema
        }
    })
    .post("/sign-in", async({jwt, body, status, cookie}) => {
        const {correctCredentials, userId} = await AuthService.signin(body.email, body.password);
        if (correctCredentials && userId) {
            const token = await jwt.sign({userId})

            cookie.auth.set({
                value: token,
                httpOnly: true,
                maxAge:  7 * 86400 // 7 days in seconds 
            })

            return{
                message : "signed in correctly"
            }
            
        } else {
            return status(403,
                { message : "Error while signing in"}
            )
        }
    }, {
        body: AuthModel.signinSchema,
        response: {
            200: AuthModel.signinResponseSchema,
            403: AuthModel.signinFailureSchema
        }
    })
