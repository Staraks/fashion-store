import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, ShoppingBag, User, X } from 'lucide-react';

import { useAppContext } from '../store/AppContext';
import { canAccessAdmin } from '../utils/adminAccess';

export default function Header({ onCartOpen }: { onCartOpen: () => void }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { cartCount, favorites, logout, user } = useAppContext();
  const location = useLocation();
  const activeCategory = new URLSearchParams(location.search).get('category');
  const canManageAdmin = canAccessAdmin(user);

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
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4 font-inter text-sm tracking-widest md:px-8">
      <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <nav className="hidden items-center space-x-8 md:flex">
        {navLinks.map((link) => (
          <Link
            key={link.name}
            to={link.path}
            className={`flex items-center gap-1 transition-opacity hover:opacity-60 ${link.isActive ? 'font-bold' : ''}`}
          >
            {link.name}
            {link.count !== undefined && link.count > 0 ? (
              <span className="rounded-full bg-black px-1.5 text-[10px] text-white">{link.count}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <Link
        to="/"
        className="absolute left-1/2 -translate-x-1/2 font-libre-barcode text-3xl lowercase tracking-[0.08em] md:text-4xl"
      >
        fashion store
      </Link>

      <div className="flex items-center space-x-4 md:space-x-6">
        {user ? <span className="hidden text-xs opacity-60 md:block">{user.username || user.email}</span> : null}
        <button className="relative transition-opacity hover:opacity-60" onClick={onCartOpen}>
          <ShoppingBag size={20} />
          {cartCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] text-white">
              {cartCount}
            </span>
          ) : null}
        </button>
        {canManageAdmin ? (
          <Link to="/admin" className="transition-opacity hover:opacity-60" title="Админка">
            <LayoutDashboard size={20} />
          </Link>
        ) : null}
        <Link to={user ? '/profile' : '/auth'} className="transition-opacity hover:opacity-60">
          <User size={20} />
        </Link>
        {user ? (
          <button onClick={logout} className="transition-opacity hover:opacity-60" title="Выйти">
            <LogOut size={18} />
          </button>
        ) : null}
      </div>

      {isMenuOpen ? (
        <div className="fixed inset-0 top-[65px] z-40 flex flex-col space-y-6 bg-white p-8 md:hidden">
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
          <Link
            to={user ? '/profile' : '/auth'}
            className="text-xl font-medium tracking-widest"
            onClick={() => setIsMenuOpen(false)}
          >
            {user ? 'ПРОФИЛЬ' : 'ВОЙТИ'}
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
        </div>
      ) : null}
    </header>
  );
}
