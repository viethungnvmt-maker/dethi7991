/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, 
  BookOpen, 
  FileText, 
  LayoutDashboard, 
  Plus, 
  Trash2, 
  Save, 
  ChevronRight, 
  ChevronLeft, 
  Cpu, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Eye,
  BrainCircuit,
  ClipboardList,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marked } from 'marked';
import Swal from 'sweetalert2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Subject, PPCTItem, MatrixConfig, Exam, Question, CognitiveLevel } from './types';
import { callGeminiAI, PROMPTS } from './services/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STEPS = [
  { id: 1, title: 'Cấu hình AI', icon: Cpu },
  { id: 2, title: 'Thông tin môn học', icon: GraduationCap },
  { id: 3, title: 'Kế hoạch dạy học', icon: ClipboardList },
  { id: 4, title: 'Ma trận đề thi', icon: LayoutDashboard },
  { id: 5, title: 'Tạo đề & Preview', icon: FileText },
];

const COGNITIVE_LEVELS: CognitiveLevel[] = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [model, setModel] = useState(() => localStorage.getItem('gemini_model') || 'gemini-2.0-flash');
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Subject State
  const [subject, setSubject] = useState<Partial<Subject>>({
    name: 'Toán học',
    grade: '10',
    semester: 'Học kỳ I',
    year: '2023-2024'
  });

  // PPCT State
  const [ppct, setPpct] = useState<PPCTItem[]>([
    { id: '1', lesson: 'Bài 1', topic: 'Mệnh đề', period: 1 },
    { id: '2', lesson: 'Bài 2', topic: 'Tập hợp', period: 2 },
    { id: '3', lesson: 'Bài 3', topic: 'Các phép toán trên tập hợp', period: 3 },
  ]);

  // Matrix State
  const [matrix, setMatrix] = useState<MatrixConfig[]>([]);
  
  // Exam State
  const [generatedExam, setGeneratedExam] = useState<Exam | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('gemini_model', model);
  }, [apiKey, model]);

  const handleAddPPCT = () => {
    const newItem: PPCTItem = {
      id: Math.random().toString(36).substr(2, 9),
      lesson: '',
      topic: '',
      period: ppct.length + 1
    };
    setPpct([...ppct, newItem]);
  };

  const handleUpdatePPCT = (id: string, field: keyof PPCTItem, value: string | number) => {
    setPpct(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleRemovePPCT = (id: string) => {
    setPpct(prev => prev.filter(item => item.id !== id));
  };

  const handleGenerateMatrix = async () => {
    if (!apiKey) {
      Swal.fire('Lỗi', 'Vui lòng nhập API Key trước!', 'error');
      return;
    }
    setIsGenerating(true);
    try {
      const ppctText = ppct.map(p => `${p.lesson}: ${p.topic} (${p.period} tiết)`).join('\n');
      const prompt = PROMPTS.GENERATE_MATRIX(subject.name || '', ppctText);
      const result = await callGeminiAI(prompt, apiKey, model);
      
      // Attempt to parse JSON from markdown response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const newMatrix: MatrixConfig[] = data.matrix.map((m: any) => ({
          topicId: m.topic,
          levels: {
            'Biết': m.know || 0,
            'Hiểu': m.understand || 0,
            'Vận dụng': m.apply || 0,
            'Vận dụng cao': m.applyHigh || 0
          }
        }));
        setMatrix(newMatrix);
        Swal.fire('Thành công', 'Đã tạo ma trận đề thi dựa trên AI!', 'success');
        setCurrentStep(4);
      } else {
        throw new Error('Không thể phân tích kết quả từ AI');
      }
    } catch (error: any) {
      Swal.fire('Lỗi', error.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateExam = async () => {
    if (!apiKey) return;
    setIsGenerating(true);
    try {
      const allQuestions: Question[] = [];
      
      for (const item of matrix) {
        for (const level of COGNITIVE_LEVELS) {
          const count = item.levels[level];
          if (count > 0) {
            const prompt = PROMPTS.GENERATE_QUESTIONS(subject.name || '', item.topicId, level, count);
            const result = await callGeminiAI(prompt, apiKey, model);
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[0]);
              allQuestions.push(...data.questions.map((q: any) => ({
                ...q,
                id: Math.random().toString(36).substr(2, 9),
                topic: item.topicId
              })));
            }
          }
        }
      }

      setGeneratedExam({
        id: Date.now().toString(),
        subjectId: subject.name || '',
        title: `Đề kiểm tra ${subject.name} - ${subject.semester}`,
        duration: 45,
        matrix,
        questions: allQuestions,
        createdAt: new Date().toISOString()
      });
      
      setCurrentStep(5);
      Swal.fire('Thành công', 'Đã tạo đề thi hoàn chỉnh!', 'success');
    } catch (error: any) {
      Swal.fire('Lỗi', error.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="glass-card p-8">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Settings className="text-primary" /> Cấu hình Gemini AI
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">API Key</label>
                  <div className="relative">
                    <input 
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                      placeholder="Nhập Gemini API Key của bạn..."
                    />
                    <button 
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showApiKey ? <Eye size={20} /> : <Settings size={20} />}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    API Key được lưu trữ an toàn trong trình duyệt của bạn (LocalStorage).
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Mô hình (Model)</label>
                  <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                  >
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Nhanh nhất)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Thông minh nhất)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </select>
                </div>
              </div>
              <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-xl flex gap-3">
                <AlertCircle className="text-primary shrink-0" />
                <p className="text-sm text-slate-300">
                  Bạn cần có API Key từ <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-primary underline">Google AI Studio</a> để sử dụng các tính năng AI.
                </p>
              </div>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="glass-card p-8">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <BookOpen className="text-primary" /> Thông tin chung
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Tên môn học</label>
                  <input 
                    type="text"
                    value={subject.name}
                    onChange={(e) => setSubject({...subject, name: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Khối lớp</label>
                  <select 
                    value={subject.grade}
                    onChange={(e) => setSubject({...subject, grade: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none"
                  >
                    {[10, 11, 12].map(g => <option key={g} value={g}>Khối {g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Học kỳ</label>
                  <select 
                    value={subject.semester}
                    onChange={(e) => setSubject({...subject, semester: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option>Học kỳ I</option>
                    <option>Học kỳ II</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Năm học</label>
                  <input 
                    type="text"
                    value={subject.year}
                    onChange={(e) => setSubject({...subject, year: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="glass-card p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <ClipboardList className="text-primary" /> Kế hoạch dạy học (PPCT)
                </h3>
                <button 
                  onClick={handleAddPPCT}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-sm"
                >
                  <Plus size={18} /> Thêm bài học
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="py-4 px-2 text-sm font-medium text-slate-400">Tiết</th>
                      <th className="py-4 px-2 text-sm font-medium text-slate-400">Tên bài</th>
                      <th className="py-4 px-2 text-sm font-medium text-slate-400">Chủ đề/Chương</th>
                      <th className="py-4 px-2 text-sm font-medium text-slate-400">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ppct.map((item, idx) => (
                      <tr key={item.id} className="border-b border-slate-800/50 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-2">
                          <input 
                            type="number"
                            value={item.period}
                            onChange={(e) => handleUpdatePPCT(item.id, 'period', parseInt(e.target.value))}
                            className="w-16 bg-transparent border-none focus:ring-0 text-center"
                          />
                        </td>
                        <td className="py-3 px-2">
                          <input 
                            type="text"
                            value={item.lesson}
                            onChange={(e) => handleUpdatePPCT(item.id, 'lesson', e.target.value)}
                            placeholder="Ví dụ: Bài 1"
                            className="w-full bg-transparent border-none focus:ring-0"
                          />
                        </td>
                        <td className="py-3 px-2">
                          <input 
                            type="text"
                            value={item.topic}
                            onChange={(e) => handleUpdatePPCT(item.id, 'topic', e.target.value)}
                            placeholder="Ví dụ: Mệnh đề"
                            className="w-full bg-transparent border-none focus:ring-0"
                          />
                        </td>
                        <td className="py-3 px-2">
                          <button 
                            onClick={() => handleRemovePPCT(item.id)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-8 flex justify-center">
                <button 
                  onClick={handleGenerateMatrix}
                  disabled={isGenerating}
                  className="gradient-btn flex items-center gap-2 px-8 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <BrainCircuit size={20} />
                  )}
                  Tự động tạo ma trận bằng AI
                </button>
              </div>
            </div>
          </motion.div>
        );
      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="glass-card p-8">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <LayoutDashboard className="text-primary" /> Ma trận đề kiểm tra
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="py-4 px-2 text-sm font-medium text-slate-400">Chủ đề</th>
                      {COGNITIVE_LEVELS.map(level => (
                        <th key={level} className="py-4 px-2 text-sm font-medium text-slate-400 text-center">{level}</th>
                      ))}
                      <th className="py-4 px-2 text-sm font-medium text-slate-400 text-center">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((item, idx) => {
                      const total = Object.values(item.levels).reduce((a: number, b: number) => a + b, 0);
                      return (
                        <tr key={idx} className="border-b border-slate-800/50">
                          <td className="py-4 px-2 font-medium">{item.topicId}</td>
                          {COGNITIVE_LEVELS.map(level => (
                            <td key={level} className="py-4 px-2 text-center">
                              <input 
                                type="number"
                                value={item.levels[level]}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setMatrix(prev => prev.map((m, i) => i === idx ? {
                                    ...m,
                                    levels: { ...m.levels, [level]: val }
                                  } : m));
                                }}
                                className="w-12 bg-slate-800 rounded px-1 py-1 text-center focus:ring-1 focus:ring-primary outline-none"
                              />
                            </td>
                          ))}
                          <td className="py-4 px-2 text-center font-bold text-primary">{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-8 flex justify-center">
                <button 
                  onClick={handleGenerateExam}
                  disabled={isGenerating}
                  className="gradient-btn flex items-center gap-2 px-8 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <FileText size={20} />
                  )}
                  Tạo đề thi từ ma trận
                </button>
              </div>
            </div>
          </motion.div>
        );
      case 5:
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold gradient-text">Xem trước đề thi</h3>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                  <Download size={18} /> Tải PDF
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors">
                  <Save size={18} /> Lưu hệ thống
                </button>
              </div>
            </div>

            <div className="glass-card p-12 bg-white text-slate-900 shadow-2xl">
              {/* Exam Header */}
              <div className="text-center space-y-2 mb-12 border-b-2 border-slate-200 pb-8">
                <h1 className="text-2xl font-bold uppercase">{generatedExam?.title}</h1>
                <p className="font-medium">Môn học: {subject.name} - Khối {subject.grade}</p>
                <p className="italic">Thời gian làm bài: {generatedExam?.duration} phút (Không kể thời gian phát đề)</p>
                <div className="pt-4 flex justify-center gap-12">
                  <div className="text-left">
                    <p>Họ và tên: .................................................................</p>
                    <p>Lớp: ............................................................................</p>
                  </div>
                  <div className="text-left">
                    <p>Số báo danh: .......................................................</p>
                    <p>Mã đề: 101</p>
                  </div>
                </div>
              </div>

              {/* Questions */}
              <div className="space-y-8">
                {generatedExam?.questions.map((q, idx) => (
                  <div key={q.id} className="space-y-3">
                    <p className="font-bold">Câu {idx + 1} ({q.level}): <span className="font-normal">{q.content}</span></p>
                    {q.options && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4">
                        {q.options.map((opt, i) => (
                          <p key={i}>{opt}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Answer Key (Optional Preview) */}
              <div className="mt-16 pt-8 border-t-2 border-dashed border-slate-300">
                <h2 className="text-xl font-bold mb-4">ĐÁP ÁN & HƯỚNG DẪN GIẢI</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {generatedExam?.questions.map((q, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="font-bold">Câu {idx + 1}:</span> {q.correctAnswer}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur-lg border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 gradient-btn rounded-xl flex items-center justify-center text-white">
              <BrainCircuit size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">EduGenius</h1>
              <p className="text-xs text-slate-500 font-medium">Hệ thống Soạn đề 7991 AI</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
              apiKey ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              {apiKey ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {apiKey ? "AI Sẵn sàng" : "Chưa có API Key"}
            </div>
            <button 
              onClick={() => setCurrentStep(1)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        {/* Stepper */}
        <div className="mb-12">
          <div className="flex items-center justify-between relative">
            {/* Progress Line */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
            <div 
              className="absolute top-1/2 left-0 h-0.5 bg-primary -translate-y-1/2 z-0 transition-all duration-500" 
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />
            
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              
              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center gap-3">
                  <button 
                    onClick={() => setCurrentStep(step.id)}
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300",
                      isActive ? "step-active scale-110" : isCompleted ? "bg-primary/20 text-primary" : "step-inactive"
                    )}
                  >
                    {isCompleted ? <CheckCircle2 size={24} /> : <Icon size={24} />}
                  </button>
                  <span className={cn(
                    "text-xs font-semibold uppercase tracking-wider hidden md:block",
                    isActive ? "text-primary" : "text-slate-500"
                  )}>
                    {step.title}
                  </span>
                </div>
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

        {/* Navigation Buttons */}
        <div className="mt-12 flex justify-between items-center">
          <button 
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-slate-400 hover:text-white transition-colors disabled:opacity-0"
          >
            <ChevronLeft size={20} /> Quay lại
          </button>
          
          {currentStep < STEPS.length && (
            <button 
              onClick={() => setCurrentStep(prev => Math.min(STEPS.length, prev + 1))}
              className="gradient-btn flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white"
            >
              Tiếp tục <ChevronRight size={20} />
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5 text-center">
        <p className="text-sm text-slate-500">
          © 2024 EduGenius - Giải pháp giáo dục thông minh. Phát triển bởi AI Studio.
        </p>
      </footer>
    </div>
  );
}
