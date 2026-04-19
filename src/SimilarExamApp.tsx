import React, { useState, useRef, useCallback } from 'react';
import { Upload, ArrowLeft, Loader2, Download, Check, Sparkles, Image, ListChecks, X, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import Swal from 'sweetalert2';
import { generateSimilarExam } from './services/gemini';
import type { ImageQuality, SolutionDetail } from './services/gemini';
import { checkAuthQuota, incrementQuota } from './services/auth';
import AuthModal from './AuthModal';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

const IMAGE_QUALITY_OPTIONS: { value: ImageQuality; label: string }[] = [
  { value: 'standard', label: 'Tiêu chuẩn (Cơ bản)' },
  { value: 'high', label: 'Cao cấp (Chi tiết & Rõ ràng)' },
  { value: 'premium', label: 'Cao cấp (Chi tiết & Chính xác)' },
];

const SOLUTION_DETAIL_OPTIONS: { value: SolutionDetail; label: string }[] = [
  { value: 'brief', label: 'Ngắn gọn (Chỉ đáp án)' },
  { value: 'standard', label: 'Tiêu chuẩn (Giải chi tiết)' },
  { value: 'deep', label: 'Chuyên sâu (Giải thích & Mẹo)' },
];

interface Props {
  onGoHome: () => void;
}

export default function SimilarExamApp({ onGoHome }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [examHtml, setExamHtml] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [imageQuality, setImageQuality] = useState<ImageQuality>('premium');
  const [solutionDetail, setSolutionDetail] = useState<SolutionDetail>('standard');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleGenerate = async () => {
    if (!checkAuthQuota()) {
      setShowAuthModal(true);
      return;
    }
    if (!file) {
      Swal.fire({
        title: 'Chưa có file',
        text: 'Vui lòng tải lên tài liệu đề thi mẫu.',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }
    setIsGenerating(true);
    setExamHtml('');
    try {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      const model = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
      if (!apiKey) {
        throw new Error('Vui lòng cài đặt API Key trong trang chủ.');
      }

      const base64 = await fileToBase64(file);
      const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/plain';
      const finalMime = file.type.startsWith('image/') ? file.type : mimeType;

      const html = await generateSimilarExam(base64, finalMime, apiKey, model, { imageQuality, solutionDetail });
      setExamHtml(html);
      incrementQuota();

      Swal.fire({
        title: 'Thành công!',
        text: 'Đề thi tương tự đã được tạo xong.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        title: 'Lỗi',
        text: err.message || 'Có lỗi xảy ra khi tạo đề tương tự.',
        icon: 'error',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadWord = () => {
    if (!examHtml) return;
    const blob = new Blob(['\ufeff' + `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.5; margin: 2cm; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #000; padding: 4px 8px; }
p { margin: 4px 0; }
</style>
</head>
<body>
${examHtml}
</body>
</html>`], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `De_Tuong_Tu_${new Date().getTime()}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0d1f17' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 backdrop-blur-lg border-b border-emerald-900/30 px-4 py-3" style={{ backgroundColor: 'rgba(13,31,23,0.9)' }}>
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={onGoHome} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 font-bold text-sm">
              AI
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 uppercase tracking-wide">Tạo Đề Tương Tự</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {!examHtml ? (
          <div className="space-y-8">
            {/* ── Hero Section ── */}
            <div className="text-center space-y-3 pt-4 pb-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Biến một đề thi thành{' '}
                <em className="not-italic bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">vô hạn</em>
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
                Tải lên đề thi mẫu (PDF/Ảnh). AI sẽ phân tích cấu trúc, độ khó và sinh ra đề tương tự chỉ trong giây lát.
              </p>
            </div>

            {/* ── Config Section ── */}
            <div className="rounded-2xl border border-emerald-900/40 p-6 space-y-5" style={{ backgroundColor: '#0f2a1e' }}>
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                <Sparkles size={16} />
                Cấu hình sinh đề
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Image Quality Dropdown */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <Image size={14} className="text-emerald-500" />
                    Chất lượng hình vẽ
                  </label>
                  <div className="relative">
                    <select
                      value={imageQuality}
                      onChange={(e) => setImageQuality(e.target.value as ImageQuality)}
                      className="w-full appearance-none rounded-xl border border-emerald-900/50 bg-[#132a1f] text-slate-200 px-4 py-3 pr-10 text-sm font-medium focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-colors cursor-pointer"
                    >
                      {IMAGE_QUALITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {/* Solution Detail Dropdown */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <ListChecks size={14} className="text-emerald-500" />
                    Chi tiết lời giải
                  </label>
                  <div className="relative">
                    <select
                      value={solutionDetail}
                      onChange={(e) => setSolutionDetail(e.target.value as SolutionDetail)}
                      className="w-full appearance-none rounded-xl border border-emerald-900/50 bg-[#132a1f] text-slate-200 px-4 py-3 pr-10 text-sm font-medium focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-colors cursor-pointer"
                    >
                      {SOLUTION_DETAIL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Upload Area ── */}
            <div
              onDrop={handleFileDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-2xl border-2 border-dashed p-10 transition-all duration-300 flex flex-col items-center justify-center gap-4 cursor-pointer
                ${isDragging
                  ? 'border-emerald-400 bg-emerald-500/5 scale-[1.01]'
                  : file
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-emerald-900/50 hover:border-emerald-500/40 bg-[#0f2a1e]'
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />

              {file ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Check size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-emerald-300 text-lg">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <Upload size={28} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-200 text-lg">Kéo thả đề thi mẫu vào đây</p>
                    <p className="text-sm text-slate-400 mt-1">Hỗ trợ PDF, JPG, PNG</p>
                    <p className="text-xs text-slate-500 mt-0.5">Hỗ trợ PDF, JPG, PNG (Max 20MB)</p>
                  </div>
                </>
              )}
            </div>

            {/* ── Generate Button ── */}
            <div className="flex justify-center pt-2 pb-4">
              <button
                onClick={handleGenerate}
                disabled={!file || isGenerating}
                className="group relative px-10 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-lg uppercase tracking-widest flex items-center justify-center gap-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin" size={22} />
                    <span>AI đang sinh đề...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={22} />
                    <span>Tạo Đề Tương Tự</span>
                    <ArrowLeft className="rotate-180 group-hover:translate-x-1 transition-transform" size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ── Result View ── */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FileText size={22} className="text-emerald-400" />
                Kết Quả Đề Thi Tương Tự
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setExamHtml('')}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-900/50 text-slate-300 hover:bg-white/5 transition-colors"
                >
                  Tạo Lại
                </button>
                <button
                  onClick={handleDownloadWord}
                  className="bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all"
                >
                  <Download size={18} />
                  Tải Xuống Word
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-900/30 bg-white p-8 overflow-auto max-h-[70vh] shadow-xl">
              <div className="exam-content text-slate-900" style={{ fontFamily: '"Times New Roman", serif', fontSize: '13pt', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: examHtml }} />
            </div>
          </div>
        )}
      </main>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}
