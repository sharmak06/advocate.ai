'use client';

import Navbar from '@/components/layout/Navbar';

import ServicesSection from '@/components/sections/ServicesSection';
import TestimonialsSection from '@/components/sections/TestimonialsSection';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/sections/HeroSection';


const Index = () => {
    return (
        <div className="min-h-screen">
            <Navbar />
            <HeroSection/>
            {/* <Features /> */}
            <ServicesSection />
            <TestimonialsSection />
            <Footer />
        </div>
    );
};

export default Index;
