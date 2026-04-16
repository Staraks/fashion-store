
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productsAPI } from '../services/api';
import { Product } from '../types';
import { Link } from 'react-router-dom';

export default function ProductList() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const category = searchParams.get('category');
  const brand = searchParams.get('brand');

  useEffect(() => {
    setLoading(true);
    productsAPI
      .getAll({ category, brand })
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [category, brand]);

  return (
    <main className="max-w-7xl mx-auto py-12 px-4">
      <div className="flex justify-between items-end mb-12 border-b border-gray-100 pb-8">
        <div>
          <h1 className="text-5xl font-playfair font-bold uppercase tracking-widest mb-4">
            {brand || category || 'Все товары'}
          </h1>
          <p className="text-gray-400 font-inter text-sm tracking-widest uppercase">
            Найдено товаров: {products.length}
          </p>
        </div>
        
        <div className="flex gap-4 text-sm font-bold uppercase tracking-widest">
          <button className="underline underline-offset-4">Фильтры</button>
          <button className="opacity-50 hover:opacity-100">Сортировка</button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center font-opensans text-xl italic opacity-50">
          Загружаем коллекцию...
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-16">
          {products.map((p) => (
            <Link key={p.id} to={`/product/${p.id}`} className="group block no-underline text-inherit">
              <div className="relative aspect-[3/4] overflow-hidden bg-gray-50 mb-6">
                <img 
                  src={p.images[0]} 
                  alt={p.name} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-widest opacity-60">{p.brand}</h3>
                <h4 className="text-lg font-medium leading-tight">{p.name}</h4>
                <p className="text-base font-bold">{p.price.toLocaleString()} ₽</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
