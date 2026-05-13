
import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-white text-black py-16 px-8 md:px-20 border-t border-gray-100 font-opensans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
        {/* Left: Social */}
        <div className="flex flex-col md:items-end">
          <h4 className="text-xl font-semibold mb-8 tracking-wider">Социальные сети</h4>
          <div className="space-y-2 opacity-70 text-lg">
            <p>Instagram: <a href="#" className="underline">fashion store</a></p>
            <p>VK: <a href="#" className="underline">fashion store</a></p>
          </div>
        </div>

        {/* Center: Legal */}
        <div className="flex flex-col items-center">
          <h4 className="text-xl font-semibold mb-8 tracking-wider">Юридическое уведомление</h4>
          <div className="space-y-2 opacity-70 text-lg">
            <p><a href="#" className="hover:underline">Политика конфиденциальности</a></p>
            <p><a href="#" className="hover:underline">Политика использования файлов cookie</a></p>
          </div>
        </div>

        {/* Right: Contacts */}
        <div className="flex flex-col md:items-start">
          <h4 className="text-xl font-semibold mb-8 tracking-wider">Контакты</h4>
          <div className="space-y-2 opacity-70 text-lg">
            <p>Email: support@fashionstore.com</p>
            <p>Тел: +7 (900) 000-00-00</p>
          </div>
        </div>
      </div>

      <div className="mt-16 text-center pt-8 border-t border-gray-50 opacity-60 text-base">
        <p>© 2025 fashion store. Все права защищены.</p>
      </div>
    </footer>
  );
}
