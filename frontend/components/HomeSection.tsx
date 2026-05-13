import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { productsAPI } from "../services/api";
import { Product } from "../types";

export default function HomeSection() {
  const [bestsellers, setBestsellers] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productsAPI
      .getBestsellers()
      .then(setBestsellers)
      .catch(() => setBestsellers([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="py-20 text-center font-opensans text-xl">Загрузка...</div>
    );

  return (
    <div className="pt-8 pb-20 px-4 max-w-7xl mx-auto text-center font-opensans bg-white">
      <h2 className="text-3xl font-light mb-2 whitespace-nowrap">
        Добро пожаловать в <span className="font-semibold">Fashion store!</span>
      </h2>

      <p className="text-xl font-light mb-12 opacity-80">
        Здесь собраны лучшие бренды и идеи современного стиля — от лаконичной
        классики до смелых уличных решений.
      </p>

      <h3 className="text-2xl font-normal mb-10 tracking-wide uppercase">
        Наши бестселлеры
      </h3>

      {bestsellers.length === 0 ? (
        <p className="opacity-50">Пока нет популярных товаров</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {bestsellers.map((p) => (
            <Link
              key={p.id}
              to={`/product/${p.id}`}
              className="group block text-center no-underline text-inherit"
            >
              <div className="relative aspect-[3/4] bg-gray-50 overflow-hidden mb-4">
                <img
                  src={p.images[0]}
                  alt={p.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[15px] font-semibold text-black tracking-wider">
                  {p.brand}
                </p>
                <p className="text-[17px] font-normal text-black/80">
                  {p.name}
                </p>
                <p className="text-base font-medium text-black">
                  {p.price.toLocaleString()} руб.
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
