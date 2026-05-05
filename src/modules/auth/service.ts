import { prisma } from "db";
import { jwt } from "@elysiajs/jwt"

export abstract class AuthService {
    static async signup(email: string, password: string): Promise<string>{
            const user = await prisma.user.create({
                data: {
                email,
                password: await Bun.password.hash(password) //hash the password before storing it in the database
                }
            })
            return user.id
    }
    static async signin(email: string, password: string): Promise<{correctCredentials: boolean, userId?: string}>{
            const user = await prisma.user.findUnique({
                where: {
                        email
                }
            })
            if (!user) {
                return {correctCredentials: false}
            }

            if (! Bun.password.verify(password, user.password)) {
                return {correctCredentials: false}

            } 
            return {correctCredentials: true, userId : user.id.toString()}
                }

            }