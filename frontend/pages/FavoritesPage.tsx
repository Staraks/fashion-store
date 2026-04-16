
import React from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { Trash2, ShoppingBag } from 'lucide-react';

export default function FavoritesPage() {
  const { favorites, toggleFavorite } = useAppContext();

  return (
    <main className="max-w-7xl mx-auto py-16 px-4">
      <h1 className="text-6xl font-playfair font-bold uppercase tracking-tighter mb-12">Избранное</h1>
      
      {favorites.length === 0 ? (
        <div className="py-20 text-center space-y-8">
          <p className="text-2xl font-light opacity-50 italic">Здесь пока ничего нет</p>
          <Link to="/catalog" className="inline-block bg-black text-white px-12 py-5 font-bold uppercase tracking-widest">
            В КАТАЛОГ
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {favorites.map((p) => (
            <div key={p.id} className="group relative">
              <Link to={`/product/${p.id}`} className="block aspect-[3/4] bg-gray-50 overflow-hidden mb-4">
                <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              </Link>
              <button 
                onClick={() => toggleFavorite(p)}
                className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur rounded-full hover:bg-white transition-colors"
              >
                <Trash2 size={18} />
              </button>
              <div className="space-y-1">
                <p className="text-[12px] font-bold uppercase tracking-widest opacity-40">{p.brand}</p>
                <h3 className="text-lg font-medium">{p.name}</h3>
                <p className="text-base font-bold">{p.price.toLocaleString()} ₽</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
