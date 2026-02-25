export abstract class AuthService {
    static async signup(username: string, password: string): Promise<string>{
            return "123"
    }
    static async signin(username: string, password: string): Promise<string>{
            return "token-123"
    }
}