import { Link, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { primaryBackendUrl } from "@/config/api";
import {
    LayoutDashboard,
    Key,
    Coins,
    MessageSquareText,
    Zap,
    LogOut,
    BarChart3,
    Brain,
    Plug,
} from "lucide-react";

const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Playground", href: "/playground", icon: MessageSquareText },
    { label: "Memory", href: "/memory", icon: Brain },
    { label: "MCP", href: "/mcp", icon: Plug },
    { label: "API Keys", href: "/api-keys", icon: Key },
    { label: "Credits", href: "/credits", icon: Coins },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const queryClient = useQueryClient();
    const signOut = async () => {
        try {
            await fetch(new URL("/auth/sign-out", primaryBackendUrl), {
                method: "POST",
                credentials: "include",
            });
        } finally {
            queryClient.clear();
            window.location.assign("/?public=1");
        }
    };

    return (
        <div className="dark min-h-screen bg-background lg:flex">
            <header className="lg:hidden sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
                <div className="px-4 h-14 flex items-center justify-between">
                    <Link to="/dashboard" className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 border border-primary/20">
                            <Zap className="size-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-semibold tracking-tight text-foreground">
                            synapse
                        </span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => void signOut()}
                        className="inline-flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                        aria-label="Sign out"
                    >
                        <LogOut className="size-4" />
                    </button>
                </div>
                <nav className="px-2 pb-2 flex gap-1 overflow-x-auto">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    "flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                )}
                            >
                                <item.icon className="size-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </header>

            <aside className="hidden lg:flex w-64 border-r border-border/50 flex-col bg-card/30">
                <div className="px-5 h-16 flex items-center gap-2.5 border-b border-border/50">
                    <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 border border-primary/20">
                        <Zap className="size-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-semibold tracking-tight text-foreground">
                        synapse
                    </span>
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                )}
                            >
                                <item.icon className="size-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="px-3 py-4 border-t border-border/50">
                    <button
                        type="button"
                        onClick={() => void signOut()}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                        <LogOut className="size-4" />
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-auto">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
