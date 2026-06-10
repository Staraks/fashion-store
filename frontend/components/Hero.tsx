import React from "react";
import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative w-full overflow-hidden block m-0">
      {/* Background Image — как тебе нравилось */}
      <img
        src="images/hero.jpg"
        alt="Banner"
        className="block w-full h-auto object-contain"
      />

      {/* Gradient Overlay — мягкий, как во втором варианте */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t 
                      from-black/50 via-black/20 via-25% to-transparent"
      />

      {/* Text Block */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[10%] z-10 text-center text-white px-5 max-w-[1100px] w-full">
        <h2 className="font-inter font-semibold text-lg md:text-xl mb-2 tracking-wider">
          Новые поступления
        </h2>
        <h1 className="font-playfair text-3xl md:text-5xl font-medium mb-4 tracking-wide">
          Maison Margiela 2026
        </h1>
        <div className="flex items-center justify-center gap-8 font-inter font-semibold text-lg md:text-xl">
          <Link
            to="/catalog?category=women&brand=Maison+Margiela"
            className="underline underline-offset-[3px] decoration-white hover:text-gray-200 hover:decoration-gray-200"
          >
            Женщинам
          </Link>
          <Link
            to="/catalog?category=men&brand=Maison+Margiela"
            className="underline underline-offset-[3px] decoration-white hover:text-gray-200 hover:decoration-gray-200"
          >
            Мужчинам
          </Link>
        </div>
      </div>
    </section>
  );
}
