import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { useElysiaClient } from "@/providers/Eden";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const elysiaClient = useElysiaClient();
    const location = useLocation();

    const profileQuery = useQuery({
        queryKey: ["user-profile"],
        queryFn: async () => {
            const response = await elysiaClient.auth.profile.get();
            if (response.error) throw new Error("Unauthorized");
            return response.data;
        },
        retry: false,
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

    if (profileQuery.isError) {
        return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
    }

    return children;
}
