
import React from 'react';
import { X, Plus, Minus, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';

export default function CartSidebar({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useAppContext();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-3xl font-playfair font-bold tracking-tight uppercase">
            Корзина ({cartCount})
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <ShoppingCart size={48} className="opacity-10" />
              <p className="text-xl font-light opacity-50 italic">Ваша корзина пуста</p>
              <button onClick={onClose} className="text-sm font-bold underline underline-offset-4 uppercase tracking-widest">
                Перейти к покупкам
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div key={`${item.id}-${item.selectedSize}`} className="flex gap-6 pb-8 border-b border-gray-50 last:border-0">
                <div className="w-24 h-32 bg-gray-100 overflow-hidden">
                  <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex justify-between items-start">
                      <h3 className="text-base font-bold uppercase tracking-tight leading-tight">{item.name}</h3>
                      <p className="text-base font-medium">{item.price.toLocaleString()} ₽</p>
                    </div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest">РАЗМЕР: {item.selectedSize}</p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center border border-gray-200">
                      <button 
                        onClick={() => updateQuantity(item.id, item.selectedSize, -1)}
                        className="px-2 py-1 hover:bg-gray-50"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="px-3 text-sm font-medium">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, item.selectedSize, 1)}
                        className="px-2 py-1 hover:bg-gray-50"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id, item.selectedSize)}
                      className="text-[10px] font-bold underline underline-offset-2 tracking-widest hover:text-red-600 transition-colors uppercase"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-8 bg-gray-50 border-t border-gray-100 space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold uppercase tracking-widest">ИТОГО:</span>
              <span className="text-2xl font-bold">{cartTotal.toLocaleString()} ₽</span>
            </div>
            <Link 
              to="/checkout" 
              onClick={onClose}
              className="block w-full bg-black text-white text-center py-5 text-sm font-bold uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors"
            >
              Оформить заказ
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
