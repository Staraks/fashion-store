import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart, Minus, Plus } from 'lucide-react';

import { productsAPI } from '../services/api';
import { useAppContext } from '../store/AppContext';
import { Product } from '../types';
import { getCategoryLabel } from '../utils/categoryLabels';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [openSection, setOpenSection] = useState<string | null>('description');

  const { addToCart, toggleFavorite, isFavorite } = useAppContext();

  useEffect(() => {
    if (!id) {
      setProduct(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    productsAPI
      .getById(id)
      .then((result) => setProduct(result ?? null))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-40 text-center">Загрузка...</div>;
  if (!product) return <div className="py-40 text-center">Товар не найден.</div>;

  const handleAddToCart = () => {
    if (!selectedSize) {
      alert('Пожалуйста, выберите размер');
      return;
    }

    addToCart(product, selectedSize);
  };

  const Accordion = ({
    title,
    id,
    children,
  }: {
    title: string;
    id: string;
    children?: React.ReactNode;
  }) => (
    <div className="border-b border-gray-200 py-4">
      <button
        className="w-full flex justify-between items-center text-sm font-bold uppercase tracking-widest"
        onClick={() => setOpenSection(openSection === id ? null : id)}
      >
        {title}
        {openSection === id ? <Minus size={16} /> : <Plus size={16} />}
      </button>
      {openSection === id && (
        <div className="mt-4 text-sm leading-relaxed opacity-70 uppercase">{children}</div>
      )}
    </div>
  );

  return (
    <main className="max-w-7xl mx-auto py-8 md:py-16 px-4">
      <nav className="text-[10px] md:text-xs font-bold tracking-widest uppercase opacity-40 mb-12 flex gap-2">
        <Link to="/catalog">Каталог</Link> /
        <Link to={`/catalog?category=${product.category}`}>{getCategoryLabel(product.category)}</Link> /
        <span className="text-black">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="hidden lg:flex lg:col-span-1 flex-col gap-4">
          {product.images.map((img, idx) => (
            <button
              key={idx}
              className={`aspect-[3/4] border ${activeImage === idx ? 'border-black' : 'border-transparent'}`}
              onClick={() => setActiveImage(idx)}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        <div className="lg:hidden">
          <h1 className="text-4xl font-playfair font-bold text-red-600 uppercase tracking-tighter leading-none mb-4">
            {product.name}
          </h1>
        </div>

        <div className="lg:col-span-6 space-y-6">
          <img src={product.images[activeImage]} alt={product.name} className="w-full h-auto" />
          {product.images.slice(1).map((img, idx) => (
            <img key={idx} src={img} alt="" className="w-full h-auto hidden lg:block" />
          ))}
        </div>

        <div className="lg:col-span-5 lg:sticky lg:top-32 flex flex-col gap-8">
          <div className="hidden lg:block">
            <h1 className="text-6xl font-playfair font-bold text-red-600 uppercase tracking-tighter leading-[0.8] mb-8 break-words">
              {product.name}
            </h1>
          </div>

          <div className="flex items-end gap-4">
            <span className="text-4xl font-bold">{product.price.toLocaleString()} ₽</span>
            {product.oldPrice && (
              <span className="text-xl text-gray-400 line-through mb-1">
                {product.oldPrice.toLocaleString()} ₽
              </span>
            )}
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              Размер: <span className="opacity-40">{selectedSize || 'выберите размер'}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  className={`px-6 py-2 border text-sm font-medium transition-all ${
                    selectedSize === size ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-black'
                  }`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              className="flex-1 bg-black text-white py-5 text-sm font-bold uppercase tracking-widest hover:bg-zinc-800 transition-colors"
              onClick={handleAddToCart}
            >
              В корзину
            </button>
            <button
              className={`p-5 border transition-colors ${isFavorite(product.id) ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-black'}`}
              onClick={() => toggleFavorite(product)}
            >
              <Heart size={20} fill={isFavorite(product.id) ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="mt-8">
            <Accordion title="Описание" id="description">
              {product.description}
              <ul className="mt-4 list-disc pl-4 space-y-1">
                <li>Сделано в России</li>
                <li>100% хлопок</li>
              </ul>
            </Accordion>
            <Accordion title="Доставка" id="delivery">
              Осуществляем доставку по всей России и миру. Срок доставки от 3 до 7 рабочих дней.
            </Accordion>
            <Accordion title="Возврат" id="returns">
              Вы можете вернуть товар в течение 14 дней с момента получения при условии сохранения товарного вида.
            </Accordion>
          </div>
        </div>
      </div>
    </main>
  );
}
