import React from 'react';
import { FileText, Copy, Layers, Settings } from 'lucide-react';
import { motion } from 'motion/react';

interface HomeProps {
  onSelectMode: (mode: 'cv7991' | 'similar' | 'variants') => void;
  onOpenSettings: () => void;
}

export default function Home({ onSelectMode, onOpenSettings }: HomeProps) {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="sticky top-0 z-50 bg-bg/90 backdrop-blur-lg border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">AI</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight uppercase">
                AI Tạo Đề Thi Thông Minh
              </h1>
            </div>
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-primary transition-colors"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Cài đặt API Key</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 flex items-center justify-center">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectMode('cv7991')}
            className="card p-6 flex flex-col items-center text-center gap-4 hover:border-primary/50 transition-colors group bg-bgLight"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <FileText size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">Tạo Đề Theo CV 7991</h2>
              <p className="text-sm text-slate-400">Tạo ma trận, bảng đặc tả và đề thi chuẩn cấu trúc từ phân phối chương trình.</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectMode('similar')}
            className="card p-6 flex flex-col items-center text-center gap-4 hover:border-blue-500/50 transition-colors group bg-bgLight"
          >
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors duration-300">
              <Copy size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">Tạo Đề Tương Tự</h2>
              <p className="text-sm text-slate-400">Tải lên một đề thi mẫu để AI phân tích và sinh ra một đề mới với cấu trúc tương đương.</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectMode('variants')}
            className="card p-6 flex flex-col items-center text-center gap-4 hover:border-purple-500/50 transition-colors group bg-bgLight"
          >
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors duration-300">
              <Layers size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">Sinh 3 Đề Biến Thể</h2>
              <p className="text-sm text-slate-400">Từ một đề gốc, tự động sinh thêm 3 phiên bản đề thi khác nhau hoàn toàn độc lập.</p>
            </div>
          </motion.button>
        </div>
      </main>
    </div>
  );
}
