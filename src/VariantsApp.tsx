import React, { useState, useRef, useCallback } from 'react';
import { Upload, ArrowLeft, Loader2, Download, Check, Layers, Play, X } from 'lucide-react';
import { motion } from 'motion/react';
import Swal from 'sweetalert2';
import { generateExamVariants } from './services/gemini';

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

interface Variant {
  title: string;
  content: string;
}

interface Props {
  onGoHome: () => void;
}

type StepStatus = 'idle' | 'running' | 'done';

export default function VariantsApp({ onGoHome }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(['idle', 'idle', 'idle']);
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
    if (!file) {
      Swal.fire({
        title: 'Chưa có file',
        text: 'Vui lòng tải lên tài liệu đề thi gốc.',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }
    setIsGenerating(true);
    setVariants([]);
    setStepStatuses(['running', 'idle', 'idle']);

    try {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      const model = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
      if (!apiKey) {
        throw new Error('Vui lòng cài đặt API Key trong trang chủ.');
      }

      const base64 = await fileToBase64(file);
      const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/plain';
      const finalMime = file.type.startsWith('image/') ? file.type : mimeType;

      // Simulate step progression for visual feedback
      setStepStatuses(['running', 'idle', 'idle']);
      const result = await generateExamVariants(base64, finalMime, apiKey, model);

      if (result && Array.isArray(result.variants) && result.variants.length >= 3) {
        // Animate step completion
        setStepStatuses(['done', 'running', 'idle']);
        await new Promise(r => setTimeout(r, 400));
        setStepStatuses(['done', 'done', 'running']);
        await new Promise(r => setTimeout(r, 400));
        setStepStatuses(['done', 'done', 'done']);

        setVariants(result.variants.slice(0, 3));
      } else {
        throw new Error('AI chưa sinh đủ 3 đề biến thể. Vui lòng thử lại.');
      }

      Swal.fire({
        title: 'Hoàn tất!',
        text: '3 đề biến thể đã được tạo thành công.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } catch (err: any) {
      console.error(err);
      setStepStatuses(['idle', 'idle', 'idle']);
      Swal.fire({
        title: 'Lỗi',
        text: err.message || 'Có lỗi xảy ra khi tạo đề biến thể.',
        icon: 'error',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadWord = (variant: Variant, index: number) => {
    if (!variant.content) return;
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
${variant.content}
</body>
</html>`], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `De_${index + 1}_Dap_An_${new Date().getTime()}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const STEP_LABELS = ['1 đề + đáp án', '2 đề + đáp án', '3 đề + đáp án'];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0d1f17' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 backdrop-blur-lg border-b border-emerald-900/30 px-4 py-3" style={{ backgroundColor: 'rgba(13,31,23,0.9)' }}>
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={onGoHome} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-500 font-bold text-sm">
              AI
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 uppercase tracking-wide">Sinh 3 Đề Biến Thể</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {variants.length === 0 ? (
          <div className="space-y-8">
            {/* ── Hero Section ── */}
            <div className="text-center space-y-3 pt-4 pb-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Sinh{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">3</span>
                {' '}đề biến thể từ{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">1</span>
                {' '}đề gốc
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
                Tải lên đề gốc (PDF/Ảnh). Hệ thống sẽ tự động sinh 3 đề biến thể kèm đáp án chi tiết theo quy trình 3 bước.
              </p>
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
                    <p className="font-semibold text-slate-200 text-lg">Kéo thả đề gốc vào đây</p>
                    <p className="text-sm text-slate-400 mt-1">Hỗ trợ PDF, JPG, PNG</p>
                    <p className="text-xs text-slate-500 mt-0.5">Hỗ trợ PDF, JPG, PNG (Max 20MB)</p>
                  </div>
                </>
              )}
            </div>

            {/* ── Generate Button ── */}
            <button
              onClick={handleGenerate}
              disabled={!file || isGenerating}
              className="w-full py-4 rounded-2xl bg-slate-700/80 hover:bg-slate-600/80 text-white font-extrabold text-lg uppercase tracking-widest flex items-center justify-center gap-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600/30"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" size={22} />
                  <span>AI đang sinh 3 đề...</span>
                </>
              ) : (
                <>
                  <Play size={22} fill="currentColor" />
                  <span>Bắt Đầu Quy Trình 3 Bước</span>
                </>
              )}
            </button>

            {/* ── 3 Step Cards ── */}
            <div className="grid grid-cols-3 gap-4">
              {STEP_LABELS.map((label, idx) => {
                const status = stepStatuses[idx];
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-5 flex flex-col items-center gap-3 transition-all duration-500
                      ${status === 'done'
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : status === 'running'
                          ? 'border-emerald-500/30 bg-emerald-500/5 animate-pulse'
                          : 'border-slate-700/50 bg-[#1a2332]'
                      }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors duration-500
                      ${status === 'done'
                        ? 'bg-emerald-500 text-white'
                        : status === 'running'
                          ? 'bg-emerald-500/50 text-white'
                          : 'bg-emerald-600/80 text-white'
                      }`}
                    >
                      {status === 'done' ? <Check size={20} /> : idx + 1}
                    </div>
                    <span className={`text-sm font-semibold tracking-wide transition-colors duration-500
                      ${status === 'done' ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {label}
                    </span>
                    {status === 'running' && (
                      <span className="text-xs text-emerald-400 animate-pulse">Đang tạo...</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Results View ── */
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Layers size={22} className="text-emerald-400" />
                Kết Quả — 3 Đề Biến Thể
              </h2>
              <button
                onClick={() => { setVariants([]); setStepStatuses(['idle', 'idle', 'idle']); }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-900/50 text-slate-300 hover:bg-white/5 transition-colors"
              >
                Tạo Lại
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {variants.map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.15 }}
                  className="rounded-2xl border border-emerald-900/30 overflow-hidden" style={{ backgroundColor: '#0f2a1e' }}
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-center px-6 py-4 border-b border-emerald-900/30" style={{ backgroundColor: '#132a1f' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm">
                        {i + 1}
                      </div>
                      <h3 className="text-lg font-bold text-emerald-300">{i + 1} đề + đáp án</h3>
                    </div>
                    <button
                      onClick={() => handleDownloadWord(v, i)}
                      className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all"
                    >
                      <Download size={16} />
                      Tải Word
                    </button>
                  </div>
                  {/* Card Body */}
                  <div className="bg-white p-6 overflow-auto max-h-[400px]">
                    <div className="exam-content text-slate-900" style={{ fontFamily: '"Times New Roman", serif', fontSize: '13pt', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: v.content }} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
