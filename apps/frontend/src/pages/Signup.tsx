import { useElysiaClient } from "@/providers/Eden";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Mail, Lock, Loader2, AlertCircle, CheckCircle2, Zap } from "lucide-react";

export function Signup() {
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const elysiaClient = useElysiaClient();
    const navigate = useNavigate();

    const profileQuery = useQuery({
        queryKey: ["user-profile"],
        queryFn: async () => {
            const response = await elysiaClient.auth.profile.get();
            if (response.error) throw new Error("Unauthorized");
            return response.data;
        },
        retry: false,
    });

    const mutation = useMutation({
        mutationFn: async ({
            email,
            password,
        }: {
            email: string;
            password: string;
        }) => {
            const response = await elysiaClient.auth["sign-up"].post({
                email,
                password,
            });
            if (response.error) {
                const errValue = response.error.value as { message?: string } | undefined;
                throw new Error(errValue?.message || "Failed to create account");
            }
            return response.data;
        },
        onSuccess: () => {
            setTimeout(() => navigate("/signin"), 1500);
        },
    });

    if (profileQuery.isLoading) {
        return (
            <div className="dark min-h-screen bg-background flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading...
                </div>
            </div>
        );
    }

    if (profileQuery.isSuccess) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="dark min-h-screen relative flex items-center justify-center bg-background overflow-hidden px-4 py-10">
            <div
                className="absolute inset-0 opacity-[0.4]"
                style={{
                    backgroundImage: "linear-gradient(oklch(1 0 0 / 0.05) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.05) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                }}
            />

            <Button
                variant="ghost"
                size="sm"
                asChild
                className="absolute left-4 top-4 z-20 text-muted-foreground hover:text-foreground sm:left-6 sm:top-6"
            >
                <Link to="/?public=1">
                    <ArrowLeft className="size-4" />
                    Back
                </Link>
            </Button>

            <div className="relative z-10 w-full max-w-[420px] px-6">
                <div className="flex items-center justify-center gap-2.5 mb-10">
                    <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 border border-primary/20">
                        <Zap className="size-4 text-primary" />
                    </div>
                    <span className="text-lg font-semibold tracking-tight text-foreground">
                        synapse
                    </span>
                </div>

                <Card className="border-border/60 bg-card/85 backdrop-blur-xl shadow-2xl shadow-black/20">
                    <CardHeader className="text-center pb-2">
                        <CardTitle className="text-xl tracking-tight">
                            Create your account
                        </CardTitle>
                        <CardDescription className="text-muted-foreground/80">
                            Create keys, manage credits, and test model routing
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                mutation.mutate({
                                    email: emailRef.current!.value,
                                    password: passwordRef.current!.value,
                                });
                            }}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
                                    <Input
                                        id="email"
                                        ref={emailRef}
                                        type="email"
                                        placeholder="you@example.com"
                                        className="pl-10 h-10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
                                    <Input
                                        id="password"
                                        ref={passwordRef}
                                        type="password"
                                        placeholder="Min. 8 characters"
                                        className="pl-10 h-10"
                                        required
                                    />
                                </div>
                            </div>

                            {mutation.isError && (
                                <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-3">
                                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                                    <span>
                                        {mutation.error?.message ||
                                            "Something went wrong. Please try again."}
                                    </span>
                                </div>
                            )}

                            {mutation.isSuccess && (
                                <div className="flex items-start gap-2.5 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3.5 py-3">
                                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                                    <span>Account created! Redirecting to sign in...</span>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full h-10 mt-2"
                                disabled={mutation.isPending || mutation.isSuccess}
                            >
                                {mutation.isPending ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" />
                                        Creating account...
                                    </>
                                ) : (
                                    <>
                                        Create account
                                        <ArrowRight className="size-4" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>

                    <CardFooter className="justify-center">
                        <p className="text-sm text-muted-foreground">
                            Already have an account?{" "}
                            <Link
                                to="/signin"
                                className="text-foreground hover:underline underline-offset-4 font-medium transition-colors"
                            >
                                Sign in
                            </Link>
                        </p>
                    </CardFooter>
                </Card>

                <p className="text-center text-xs text-muted-foreground/60 mt-8 leading-relaxed">
                    By creating an account, you agree to our{" "}
                    <a
                        href="#"
                        className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
                    >
                        Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                        href="#"
                        className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
                    >
                        Privacy Policy
                    </a>
                </p>
            </div>
        </div>
    );
}
