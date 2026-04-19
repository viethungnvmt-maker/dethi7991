import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, LogIn, User } from 'lucide-react';
import Swal from 'sweetalert2';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const VALID_ACCOUNTS: Record<string, string> = {
      'VIETHUNG': '123456',
      'ADMIN': 'admin'
    };

    if (VALID_ACCOUNTS[username] && VALID_ACCOUNTS[username] === password) {
      localStorage.setItem('is_logged_in', 'true');
      Swal.fire({
        title: 'Đăng nhập thành công!',
        icon: 'success',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      onSuccess();
    } else {
      Swal.fire({
        title: 'Lỗi đăng nhập',
        text: 'Tài khoản hoặc mật khẩu không chính xác!',
        icon: 'error',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-card p-6 md:p-8 w-full max-w-sm relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
        <div className="flex flex-col items-center mb-6 mt-2">
          <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-3">
            <Lock size={24} />
          </div>
          <h3 className="text-xl font-bold text-white text-center">ĐĂNG NHẬP</h3>
          <p className="text-xs text-slate-400 text-center mt-2 leading-relaxed">Bạn đã sử dụng hết 1 lượt miễn phí. Vui lòng đăng nhập tài khoản để tiếp tục sử dụng.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-2">
              <User size={14} /> Tên đăng nhập
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toUpperCase())}
              className="input-field"
              placeholder="Nhập tên đăng nhập..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-2">
              <Lock size={14} /> Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Nhập mật khẩu..."
              required
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white transition-colors border border-border hover:border-border-light font-medium"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex-1 gradient-btn py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            >
              <LogIn size={16} /> Đăng nhập
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
