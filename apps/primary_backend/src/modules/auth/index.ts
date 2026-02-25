import { Elysia } from "elysia";
import { AuthModel } from "./models"; 
import { AuthService } from "./service";

export const app = new Elysia({ prefix: "auth" })
    .post("/sign-up", ({body}) => {
        // Generate a simple UUID for demo purposes
        const userId = crypto.randomUUID();
        
        return {
            id: userId,
            email: body.email,
            message: "User created successfully"
        };
    }, {
        body: AuthModel.signupSchema,
        response: {
            200: AuthModel.signupResponseSchema,
            400: AuthModel.signupResponseSchema
        }
    })
    .post("/sign-in", async({body}) => {
        const token = await AuthService.signin(body.email, body.password);
        return {
            token
        }
    }, {
        body: AuthModel.signinSchema,
        response: {
            200: AuthModel.signinResponseSchema,
            403: AuthModel.signupFailureSchema
        }
    })
