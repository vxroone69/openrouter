import { Elysia } from "elysia";
import { AuthModel } from "./models"; 

export const app = new Elysia({ prefix: "/auth" })
    .post("/sign-up", ({body}) => {

    }, {
        body: AuthModel.signupSchema
    })
    .post("/sign-in", () => {

    })
