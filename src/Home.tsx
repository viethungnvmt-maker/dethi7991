import React from 'react';
import { FileText, Copy, Layers, Settings, Zap, ArrowRight, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AuthModal from './AuthModal';

interface HomeProps {
  onSelectMode: (mode: 'cv7991' | 'similar' | 'variants') => void;
  onOpenSettings: () => void;
}

export default function Home({ onSelectMode, onOpenSettings }: HomeProps) {
  const cards = [
    {
      id: 'cv7991' as const,
      title: 'Tạo đề theo CV 7991',
      subtitle: 'Pipeline 4 bước chuẩn: Nhập liệu → Ma trận → Đặc tả → Đề thi hoàn chỉnh',
      features: [
        'Upload PPCT tự động nhận diện',
        '4 dạng câu hỏi chuẩn CV 7991',
        'Lối tắt nhanh nếu có sẵn Ma trận',
        'Xuất Word / HTML'
      ],
      icon: <FileText size={28} />,
      baseColorClass: 'text-emerald-500',
      bgIconClass: 'bg-emerald-500',
      borderClass: 'border-emerald-500',
      glowHoverBorder: 'hover:border-emerald-500/50',
      glowShadow: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]',
      iconGlow: 'shadow-emerald-500/20',
      btnHover: 'hover:bg-emerald-400',
      containerBg: 'bg-[#0f2c23]'
    },
    {
      id: 'similar' as const,
      title: 'Tạo đề tương tự',
      subtitle: 'Upload 1 đề mẫu → AI phân tích cấu trúc & sinh đề mới giữ nguyên format',
      features: [
        'Phân tích ma trận tự động',
        'Giữ cấu trúc, thay số liệu',
        'Lời giải chi tiết kèm theo',
        'Hỗ trợ PDF & ảnh chụp'
      ],
      icon: <Copy size={28} />,
      baseColorClass: 'text-blue-500',
      bgIconClass: 'bg-blue-500',
      borderClass: 'border-blue-500',
      glowHoverBorder: 'hover:border-blue-500/50',
      glowShadow: 'shadow-[0_0_30px_rgba(59,130,246,0.15)]',
      iconGlow: 'shadow-blue-500/20',
      btnHover: 'hover:bg-blue-400',
      containerBg: 'bg-[#1e222b]'
    },
    {
      id: 'variants' as const,
      title: 'Sinh 3 đề biến thể',
      subtitle: 'Upload 1 đề gốc → AI tự động sinh 3 đề khác nhau kèm đáp án chi tiết',
      features: [
        '3 đề biến thể từ 1 gốc',
        'Streaming thời gian thực',
        'Đáp án chi tiết cho câu khó',
        'Xuất 1 file Word gộp 3 đề'
      ],
      icon: <Layers size={28} />,
      baseColorClass: 'text-purple-500',
      bgIconClass: 'bg-purple-500',
      borderClass: 'border-purple-500',
      glowHoverBorder: 'hover:border-purple-500/50',
      glowShadow: 'shadow-[0_0_30px_rgba(168,85,247,0.15)]',
      iconGlow: 'shadow-purple-500/20',
      btnHover: 'hover:bg-purple-400',
      containerBg: 'bg-[#1f1a2e]'
    }
  ];

  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
  const hasUsedFreeTrial = parseInt(localStorage.getItem('free_usage_count') || '0', 10) >= 1;

  return (
    <div className="min-h-screen flex flex-col bg-[#12141a]">
      <header className="sticky top-0 z-50 bg-[#12141a]/90 backdrop-blur-lg border-b border-white/5 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-sm tracking-widest">AI</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold border-transparent bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">
                Hệ Sinh Thái AI Giáo Dục
              </h1>
            </div>
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-all shadow-sm"
          >
            <Settings size={16} />
            <span className="hidden sm:inline font-medium">Cài đặt API Key</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 flex flex-col items-center">
        {/* NEW HERO SECTION WITH BADGE */}
        <div className="flex flex-col items-center justify-center mb-16 text-center w-full">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-6">
            <Zap size={14} className="text-emerald-400" /> Powered by Google Gemini AI
          </div>
          
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-8">
            Chọn chế độ <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">tạo đề thi</span>
          </h2>

          <button 
            onClick={() => {
              if (!isLoggedIn) setShowAuthModal(true);
            }}
            className={`inline-flex items-center gap-3 px-10 py-4 rounded-full border border-emerald-500/50 bg-[#0d2118] hover:bg-[#143224] transition-all text-emerald-400 text-2xl md:text-3xl font-extrabold shadow-[0_0_20px_rgba(16,185,129,0.25)] cursor-pointer ${isLoggedIn ? 'cursor-default border-blue-500/50 bg-blue-900/30 text-blue-400 hover:bg-blue-900/30 shadow-[0_0_20px_rgba(59,130,246,0.25)]' : ''}`}
          >
            {!isLoggedIn && <LogIn size={32} className="text-emerald-400" />}
            {isLoggedIn 
              ? '🌟 Premium đang hoạt động' 
              : (hasUsedFreeTrial ? '🔒 Hết lượt miễn phí · Đăng nhập' : '🎁 1 lượt thử miễn phí · Đăng nhập')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 w-full">
          {cards.map((card) => (
            <motion.div
              key={card.id}
              whileHover={{ y: -8 }}
              className={`relative flex flex-col h-[520px] rounded-3xl border border-white/5 overflow-hidden transition-all duration-300 ${card.glowShadow} ${card.containerBg} group ${card.glowHoverBorder}`}
            >
              <div className="p-8 flex-1 flex flex-col relative z-10">
                {/* Floating dots decoration */}
                <div className={`absolute top-12 right-12 w-2 h-2 rounded-full ${card.bgIconClass} opacity-20 blur-[1px]`}></div>
                <div className={`absolute bottom-24 right-20 w-1.5 h-1.5 rounded-full ${card.bgIconClass} opacity-30`}></div>
                
                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl ${card.bgIconClass} flex items-center justify-center text-white mb-6 shadow-lg ${card.iconGlow}`}>
                  {card.icon}
                </div>

                {/* Text Content */}
                <h2 className={`text-2xl font-bold text-white mb-3 tracking-tight`}>
                  {card.title}
                </h2>
                <p className={`text-sm ${card.baseColorClass} opacity-80 mb-6 font-medium leading-relaxed min-h-[40px]`}>
                  {card.subtitle}
                </p>

                {/* Features List */}
                <ul className="space-y-4 mb-auto">
                  {card.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-slate-300 text-sm font-medium">
                      <span className={`w-1.5 h-1.5 mt-1.5 rounded-full ${card.bgIconClass} flex-shrink-0`}></span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                {/* Action Button */}
                <button
                  onClick={() => onSelectMode(card.id)}
                  className={`mt-8 w-full sm:w-auto self-start px-6 py-3 rounded-xl ${card.bgIconClass} text-white font-bold flex items-center justify-center gap-2 transition-all ${card.btnHover} shadow-md`}
                >
                  <Zap size={18} className="drop-shadow-sm" />
                  Bắt đầu
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            window.location.reload(); // Refresh to update isLoggedIn checks 
          }}
        />
      )}
    </div>
  );
}
