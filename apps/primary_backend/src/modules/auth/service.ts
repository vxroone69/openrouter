import { prisma } from "db";
import { jwt } from "@elysiajs/jwt"

export abstract class AuthService {
    static async signup(email: string, password: string): Promise<string>{
            const user = await prisma.user.create({
                data: {
                email,
                password: await Bun.password.hash(password)
                }
            })
            return user.id
    }
    static async signin(email: string, password: string): Promise<boolean>{
            const user = await prisma.user.findUnique({
                where: {
                        email
                }
            })
            if (!user) {
                return false
            }

            if (user) {
                const matched = await Bun.password.verify(password, user.password)
                if (matched) {
                        //sign jwt for user
                        return true

                } else {
                        return false
                }

            }
    }
}