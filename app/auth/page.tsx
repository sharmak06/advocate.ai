import { Suspense } from "react";
import Auth from "@/app/main/AuthPage";

export default function AuthPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-sky-50">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="animate-spin rounded-full h-20 w-20 border-b-2 border-sky-500"></div>
                        <p className="text-slate-600">Loading...</p>
                    </div>
                </div>
            }
        >
            <Auth />
        </Suspense>
    );
}