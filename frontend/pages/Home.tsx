
import React from 'react';
import Hero from '../components/Hero';
import HomeSection from '../components/HomeSection';

export default function Home() {
  return (
    <main className="animate-in fade-in duration-700">
      <Hero />
      <HomeSection />
    </main>
  );
}
