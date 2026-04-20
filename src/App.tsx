import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings } from 'lucide-react';
import Home from './Home';
import CV7991App from './CV7991App';
import SimilarExamApp from './SimilarExamApp';
import VariantsApp from './VariantsApp';

export default function App() {
  const [currentMode, setCurrentMode] = useState<'home' | 'cv7991' | 'similar' | 'variants'>('home');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem('gemini_model');
    if (saved === 'gemini-2.0-flash') {
      localStorage.setItem('gemini_model', 'gemini-2.5-flash');
      return 'gemini-2.5-flash';
    }
    return saved || 'gemini-2.5-flash';
  });

  const handleSaveSettings = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('gemini_model', model);
    setShowApiKeyModal(false);
  };

  const handleGoHome = () => setCurrentMode('home');

  return (
    <div className="flex flex-col min-h-screen bg-[#12141a]">
      <div className="flex-1 w-full flex flex-col">
        {currentMode === 'home' && (
          <Home 
            onSelectMode={setCurrentMode} 
            onOpenSettings={() => setShowApiKeyModal(true)} 
          />
        )}
        {currentMode === 'cv7991' && <CV7991App onGoHome={handleGoHome} />}
        {currentMode === 'similar' && <SimilarExamApp onGoHome={handleGoHome} />}
        {currentMode === 'variants' && <VariantsApp onGoHome={handleGoHome} />}
      </div>

      <footer className="w-full text-center py-6 border-t border-white/5 bg-[#0d1f17] mt-auto">
        <p className="text-slate-400 text-sm mb-1">
          Tạo Đề Thi Theo CV 7991 © 2026 | Powered by Google Gemini AI
        </p>
        <p className="text-slate-400 text-sm">
          Mọi tool AI và khóa học tạo app dành cho giáo viên có tại:{' '}
          <a href="https://thayhungedu.vercel.app" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
            thayhungedu.vercel.app
          </a>
        </p>
      </footer>

      {/* Global API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 md:p-8 w-full max-w-lg"
          >
            <h3 className="text-lg font-semibold text-primary mb-6 flex items-center gap-2">
              <Settings size={20} /> Cài đặt API Key
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-field"
                  placeholder="Nhập API Key..."
                />
                <p className="mt-2 text-xs text-slate-500">
                  Lấy API Key tại{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary underline">
                    Google AI Studio
                  </a>
                </p>
              </div>

              {/* Hướng dẫn lấy API Key */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
                <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-red-400 ml-0.5">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <a
                    href="https://youtu.be/KWkV1AwbjfY"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:text-emerald-300 transition-colors"
                  >
                    📺 Hướng dẫn lấy API Key (Video)
                  </a>
                  <p className="text-[11px] text-slate-500 mt-0.5">Xem video hướng dẫn chi tiết từng bước trên YouTube</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Model AI</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input-field"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Nên dùng <span className="text-primary font-medium">Gemini 2.5 Flash</span>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-5 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white transition-colors border border-border hover:border-border-light"
              >
                Đóng
              </button>
              <button
                onClick={handleSaveSettings}
                className="gradient-btn px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              >
                Lưu
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </div>
  );
}
