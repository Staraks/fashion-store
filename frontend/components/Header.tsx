import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, Search, ShoppingBag, User, X } from 'lucide-react';

import { useAppContext } from '../store/AppContext';

export default function Header({ onCartOpen }: { onCartOpen: () => void }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { cartCount, favorites, logout, user } = useAppContext();
  const location = useLocation();
  const activeCategory = new URLSearchParams(location.search).get('category');
  const canManageAdmin = Boolean(
    user && (user.isStaff || user.isSuperuser || ['admin', 'manager', 'content_manager', 'staff'].includes(user.role))
  );

  const navLinks = [
    {
      name: 'ЖЕНЩИНАМ',
      path: '/catalog?category=women',
      isActive: location.pathname === '/catalog' && activeCategory === 'women',
    },
    {
      name: 'МУЖЧИНАМ',
      path: '/catalog?category=men',
      isActive: location.pathname === '/catalog' && activeCategory === 'men',
    },
    {
      name: 'ИЗБРАННОЕ',
      path: '/favorites',
      isActive: location.pathname === '/favorites',
      count: favorites.length,
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 md:px-8 py-4 flex items-center justify-between font-inter text-sm tracking-widest">
      <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <nav className="hidden md:flex items-center space-x-8">
        {navLinks.map((link) => (
          <Link
            key={link.name}
            to={link.path}
            className={`hover:opacity-60 transition-opacity flex items-center gap-1 ${link.isActive ? 'font-bold' : ''}`}
          >
            {link.name}
            {link.count !== undefined && link.count > 0 && (
              <span className="text-[10px] bg-black text-white px-1.5 rounded-full">{link.count}</span>
            )}
          </Link>
        ))}
      </nav>

      <Link to="/" className="absolute left-1/2 -translate-x-1/2 font-playfair text-2xl font-bold tracking-[0.2em]">
        VOID.
      </Link>

      <div className="flex items-center space-x-4 md:space-x-6">
        {user ? <span className="hidden md:block text-xs opacity-60">{user.name || user.email}</span> : null}
        <button className="hover:opacity-60 transition-opacity">
          <Search size={20} />
        </button>
        <button className="relative hover:opacity-60 transition-opacity" onClick={onCartOpen}>
          <ShoppingBag size={20} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-black text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full">
              {cartCount}
            </span>
          )}
        </button>
        {canManageAdmin ? (
          <Link to="/admin" className="hover:opacity-60 transition-opacity" title="Админка">
            <LayoutDashboard size={20} />
          </Link>
        ) : null}
        <Link to="/auth" className="hover:opacity-60 transition-opacity">
          <User size={20} />
        </Link>
        {user ? (
          <button onClick={logout} className="hover:opacity-60 transition-opacity" title="Выйти">
            <LogOut size={18} />
          </button>
        ) : null}
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 top-[65px] bg-white z-40 md:hidden p-8 flex flex-col space-y-6">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className="text-xl font-medium tracking-widest"
              onClick={() => setIsMenuOpen(false)}
            >
              {link.name} {link.count !== undefined && link.count > 0 ? `(${link.count})` : ''}
            </Link>
          ))}
          <Link to="/auth" className="text-xl font-medium tracking-widest" onClick={() => setIsMenuOpen(false)}>
            {user ? 'АККАУНТ' : 'ВОЙТИ'}
          </Link>
          {canManageAdmin ? (
            <Link to="/admin" className="text-xl font-medium tracking-widest" onClick={() => setIsMenuOpen(false)}>
              АДМИНКА
            </Link>
          ) : null}
          {user ? (
            <button
              onClick={async () => {
                await logout();
                setIsMenuOpen(false);
              }}
              className="text-left text-xl font-medium tracking-widest"
            >
              ВЫЙТИ
            </button>
          ) : null}
          <div className="pt-8 border-t border-gray-100 space-y-4">
            <p className="text-sm opacity-50">ПОИСК</p>
          </div>
        </div>
      )}
    </header>
  );
}
