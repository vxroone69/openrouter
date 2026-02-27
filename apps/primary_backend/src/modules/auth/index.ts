import { Elysia } from "elysia";
import { AuthModel } from "./models"; 
import { AuthService } from "./service";

export const app = new Elysia({ prefix: "auth" })
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
    .post("/sign-in", async({body}) => {
        const token = await AuthService.signin(body.email, body.password);
        return {
            token
        }
    }, {
        body: AuthModel.signinSchema,
        response: {
            200: AuthModel.signinResponseSchema,
            403: AuthModel.signinFailureSchema
        }
    })
