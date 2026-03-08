/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Upload,
  ChevronRight,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Swal from 'sweetalert2';
import { callGeminiAI, PROMPTS } from './services/gemini';

// ─── Constants ──────────────────────────────────────────────────────
const STEPS = [
  { id: 1, title: 'Thông tin' },
  { id: 2, title: 'Ma trận' },
  { id: 3, title: 'Bảng đặc tả' },
  { id: 4, title: 'Đề thi' },
];

const MON_HOC_LIST = [
  'Toán', 'Ngữ văn', 'Vật lí', 'Hóa học', 'Sinh học',
  'Lịch sử', 'Địa lí', 'GDCD', 'Tiếng Anh', 'Tin học',
  'Công nghệ', 'GDTC', 'Âm nhạc', 'Mĩ thuật',
];

const KHOI_LOP_LIST = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const LOAI_KIEM_TRA = [
  'Giữa kỳ 1', 'Cuối kỳ 1', 'Giữa kỳ 2', 'Cuối kỳ 2',
];

interface ExamStructureRow {
  label: string;
  biet: number;
  hieu: number;
  vandung: number;
  vandungcao: number;
}

const DEFAULT_EXAM_STRUCTURE: ExamStructureRow[] = [
  { label: 'Dạng I (4 lựa chọn)', biet: 8, hieu: 4, vandung: 0, vandungcao: 0 },
  { label: 'Dạng II (Đúng/Sai)', biet: 1, hieu: 1, vandung: 0, vandungcao: 0 },
  { label: 'Dạng III (Trả lời ngắn)', biet: 1, hieu: 1, vandung: 2, vandungcao: 0 },
  { label: 'Tự luận', biet: 0, hieu: 1, vandung: 2, vandungcao: 0 },
];

// ─── App ────────────────────────────────────────────────────────────
export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [model, setModel] = useState(() => localStorage.getItem('gemini_model') || 'gemini-2.0-flash');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Step 1 state
  const [monHoc, setMonHoc] = useState('');
  const [khoiLop, setKhoiLop] = useState('');
  const [loaiKiemTra, setLoaiKiemTra] = useState('Giữa kỳ 1');
  const [thoiGian, setThoiGian] = useState(45);
  const [examStructure, setExamStructure] = useState<ExamStructureRow[]>(DEFAULT_EXAM_STRUCTURE);
  const [ppctFile, setPpctFile] = useState<File | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('gemini_model', model);
  }, [apiKey, model]);

  // ─── Handlers ───────────────────────────────────────────────────
  const updateStructure = (index: number, field: 'biet' | 'hieu' | 'vandung' | 'vandungcao', value: number) => {
    setExamStructure(prev => prev.map((row, i) =>
      i === index ? { ...row, [field]: Math.max(0, value) } : row
    ));
  };

  const handleGenerateMatrix = async () => {
    if (!apiKey) {
      Swal.fire({
        title: 'Chưa có API Key',
        text: 'Vui lòng nhập API Key trong phần "Cài đặt API Key"',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      setShowApiKeyModal(true);
      return;
    }
    if (!monHoc) {
      Swal.fire({
        title: 'Thiếu thông tin',
        text: 'Vui lòng chọn môn học',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }
    setIsGenerating(true);
    try {
      // Build summary from structure
      const structureSummary = examStructure
        .map(r => `${r.label}: Biết=${r.biet}, Hiểu=${r.hieu}, Vận dụng=${r.vandung}`)
        .join('\n');

      const prompt = PROMPTS.GENERATE_MATRIX(
        monHoc,
        `Khối ${khoiLop || '10'}, ${loaiKiemTra}, ${thoiGian} phút\nCấu trúc:\n${structureSummary}`
      );
      const result = await callGeminiAI(prompt, apiKey, model);

      Swal.fire({
        title: 'Thành công!',
        text: 'Đã tạo ma trận đề thi.',
        icon: 'success',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      setCurrentStep(2);
    } catch (error: any) {
      Swal.fire({
        title: 'Lỗi',
        text: error.message,
        icon: 'error',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Step 1: Thông tin ──────────────────────────────────────────
  const renderStep1 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Card 1: Thông tin chung & Upload PPCT */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">1</span>
          <h2 className="text-lg font-semibold text-primary">Thông tin chung & Upload PPCT</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          {/* Môn học */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Môn học</label>
            <select
              value={monHoc}
              onChange={(e) => setMonHoc(e.target.value)}
              className="input-field"
            >
              <option value="">-- Chọn môn học --</option>
              {MON_HOC_LIST.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Khối lớp */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Khối lớp</label>
            <select
              value={khoiLop}
              onChange={(e) => setKhoiLop(e.target.value)}
              className="input-field"
            >
              <option value="">-- Chọn khối lớp --</option>
              {KHOI_LOP_LIST.map(k => <option key={k} value={k}>Khối {k}</option>)}
            </select>
          </div>

          {/* Loại kiểm tra */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Loại kiểm tra (Auto Filter)</label>
            <select
              value={loaiKiemTra}
              onChange={(e) => setLoaiKiemTra(e.target.value)}
              className="input-field"
            >
              {LOAI_KIEM_TRA.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Thời gian */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Thời gian (phút)</label>
            <div className="relative flex items-center gap-2">
              <Clock size={16} className="text-slate-400 shrink-0" />
              <input
                type="number"
                value={thoiGian}
                onChange={(e) => setThoiGian(parseInt(e.target.value) || 0)}
                className="input-field"
                min={1}
              />
            </div>
          </div>
        </div>

        {/* Upload PPCT */}
        <div className="mt-6">
          <input
            type="file"
            id="ppct-upload"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPpctFile(file);
            }}
          />
          {ppctFile ? (
            <div className="flex items-center justify-between px-4 py-3 border border-primary/30 rounded-xl bg-primary/5">
              <span className="text-sm text-primary truncate">{ppctFile.name}</span>
              <button
                onClick={() => { setPpctFile(null); (document.getElementById('ppct-upload') as HTMLInputElement).value = ''; }}
                className="text-xs text-slate-400 hover:text-red-400 ml-3 shrink-0"
              >
                Xóa
              </button>
            </div>
          ) : (
            <label htmlFor="ppct-upload" className="upload-btn cursor-pointer">
              <Upload size={18} />
              Upload File PPCT (.pdf, .docx)
            </label>
          )}
        </div>
      </div>

      {/* Card 2: Cấu trúc đề thi */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">3</span>
          <h2 className="text-lg font-semibold text-primary">Cấu trúc đề thi (Số lượng câu hỏi)</h2>
        </div>

        <div className="space-y-5">
          {examStructure.map((row, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              {/* Row label */}
              <div className="sm:w-52 shrink-0">
                <span className="text-sm font-medium text-primary">{row.label}</span>
              </div>

              {/* Inputs */}
              <div className="flex-1 grid grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs text-primary mb-1.5">Biết</label>
                  <input
                    type="number"
                    value={row.biet}
                    onChange={(e) => updateStructure(idx, 'biet', parseInt(e.target.value) || 0)}
                    className="input-field text-center"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">Hiểu</label>
                  <input
                    type="number"
                    value={row.hieu}
                    onChange={(e) => updateStructure(idx, 'hieu', parseInt(e.target.value) || 0)}
                    className="input-field text-center"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">Vận dụng</label>
                  <input
                    type="number"
                    value={row.vandung}
                    onChange={(e) => updateStructure(idx, 'vandung', parseInt(e.target.value) || 0)}
                    className="input-field text-center"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">VD cao</label>
                  <input
                    type="number"
                    value={row.vandungcao}
                    onChange={(e) => updateStructure(idx, 'vandungcao', parseInt(e.target.value) || 0)}
                    className="input-field text-center"
                    min={0}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Button: Tạo Ma trận */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleGenerateMatrix}
          disabled={isGenerating}
          className="gradient-btn flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        >
          {isGenerating ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <ArrowRight size={18} />
          )}
          Tạo Ma trận đề thi
        </button>
      </div>
    </motion.div>
  );

  // ─── Step 2: Ma trận ────────────────────────────────────────────
  const renderStep2 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">2</span>
          <h2 className="text-lg font-semibold text-primary">Ma trận đề kiểm tra</h2>
        </div>
        <div className="flex items-center justify-center min-h-[300px] text-slate-500">
          <p>Ma trận sẽ được hiển thị sau khi tạo từ bước 1.</p>
        </div>
      </div>
    </motion.div>
  );

  // ─── Step 3: Bảng đặc tả ──────────────────────────────────────
  const renderStep3 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">3</span>
          <h2 className="text-lg font-semibold text-primary">Bảng đặc tả</h2>
        </div>
        <div className="flex items-center justify-center min-h-[300px] text-slate-500">
          <p>Bảng đặc tả sẽ được hiển thị sau khi hoàn thành ma trận.</p>
        </div>
      </div>
    </motion.div>
  );

  // ─── Step 4: Đề thi ────────────────────────────────────────────
  const renderStep4 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">4</span>
          <h2 className="text-lg font-semibold text-primary">Đề thi</h2>
        </div>
        <div className="flex items-center justify-center min-h-[300px] text-slate-500">
          <p>Đề thi sẽ được tạo sau khi hoàn thành bảng đặc tả.</p>
        </div>
      </div>
    </motion.div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return null;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-bg/90 backdrop-blur-lg border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">AI</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight uppercase">
              Tạo Đề Thi Theo CV 7991
            </h1>
          </div>

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-primary transition-colors"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Cài đặt API Key</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Stepper */}
        <div className="mb-10">
          <div className="flex items-center justify-center gap-0">
            {STEPS.map((step, idx) => {
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex items-center gap-2 px-1 transition-colors ${isActive ? 'step-active' : 'step-inactive'
                      }`}
                  >
                    <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${isActive
                      ? 'bg-primary text-bg'
                      : isCompleted
                        ? 'bg-primary/30 text-primary'
                        : 'bg-surface-light border border-border text-slate-500'
                      }`}>
                      {step.id}
                    </span>
                    <span className="text-sm hidden sm:inline">{step.title}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-16 sm:w-28 h-px mx-1 sm:mx-2 ${currentStep > step.id ? 'bg-primary/50' : 'bg-border'
                      }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[500px]">
          <AnimatePresence mode="wait">
            {renderStepContent()}
          </AnimatePresence>
        </div>
      </main>

      {/* ── API Key Modal ── */}
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
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-primary underline">
                    Google AI Studio
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input-field"
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (Nhanh)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Thông minh)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
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
                onClick={() => setShowApiKeyModal(false)}
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
