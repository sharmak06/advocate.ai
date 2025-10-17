import ProtectedRoute from "@/components/shared/ProtectedRoute";
import Link from 'next/link';

export default function ConsultPage() {
    return (
        <ProtectedRoute requireVKYC={true}>
            <div className="min-h-screen flex flex-col items-center justify-center p-8">
                <h1 className="text-2xl font-bold mb-4">Video Consultation</h1>
                <p className="text-muted-foreground mb-6 text-center max-w-xl">
                    The video consultation page component is not available right now.
                    If you intended to use a video consult feature, please add
                    <code className="mx-1">app/main/VideoConsultPage.tsx</code>
                    or update this page to point to the correct component.
                </p>
                <Link href="/" className="inline-block bg-primary text-white px-4 py-2 rounded-none">Go to Home</Link>
            </div>
        </ProtectedRoute>
    );
}