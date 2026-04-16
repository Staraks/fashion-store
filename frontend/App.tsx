
import React, { useState } from 'react';
import { HashRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import CartSidebar from './components/CartSidebar';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductList from './pages/ProductList';
import ProductDetail from './pages/ProductDetail';
import FavoritesPage from './pages/FavoritesPage';
import Checkout from './pages/Checkout';
import AuthPage from './pages/AuthPage';
import AdminPage from './pages/AdminPage';
import { AppProvider } from './store/AppContext';

export default function App() {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <AppProvider>
      <Router>
        <div className="flex flex-col min-h-screen bg-white">
          <Header onCartOpen={() => setIsCartOpen(true)} />
          
          <div className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/products" element={<ProductList />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/admin" element={<AdminPage />} />
              {/* Alias for provided snippet links */}
              <Route path="/women" element={<Navigate to="/catalog?category=women" replace />} />
              <Route path="/men" element={<Navigate to="/catalog?category=men" replace />} />
            </Routes>
          </div>

          <Footer />
          <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
        </div>
      </Router>
    </AppProvider>
  );
}
