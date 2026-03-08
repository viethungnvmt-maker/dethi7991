/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Upload,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Check,
  Filter,
  Loader2,
  Download,
  FileText,
  Code,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Swal from 'sweetalert2';
import { callGeminiAI, parsePPCTFile } from './services/gemini';

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

interface Lesson {
  id: string;
  name: string;
  periods: number;
  weekStart?: number;
  weekEnd?: number;
}

interface Chapter {
  id: string;
  name: string;
  totalPeriods: number;
  lessons: Lesson[];
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
  const [model, setModel] = useState(() => {
    const saved = localStorage.getItem('gemini_model');
    // Auto-migrate from deprecated model
    if (saved === 'gemini-2.0-flash') {
      localStorage.setItem('gemini_model', 'gemini-2.5-flash');
      return 'gemini-2.5-flash';
    }
    return saved || 'gemini-2.5-flash';
  });
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Step 1 state
  const [monHoc, setMonHoc] = useState('');
  const [khoiLop, setKhoiLop] = useState('');
  const [loaiKiemTra, setLoaiKiemTra] = useState('Giữa kỳ 1');
  const [thoiGian, setThoiGian] = useState(45);
  const [examStructure, setExamStructure] = useState<ExamStructureRow[]>(DEFAULT_EXAM_STRUCTURE);
  const [ppctFile, setPpctFile] = useState<File | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [matrixHtml, setMatrixHtml] = useState('');
  const [specsHtml, setSpecsHtml] = useState('');
  const [examHtml, setExamHtml] = useState('');

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleParsePPCT = async (file: File) => {
    if (!apiKey) {
      Swal.fire({
        title: 'Chưa có API Key',
        text: 'Vui lòng nhập API Key để phân tích file PPCT',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      setShowApiKeyModal(true);
      return;
    }

    setIsParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const data = await parsePPCTFile(file, base64, monHoc, khoiLop, apiKey, model);

      console.log('đăng parse PPCT data:', data);

      if (data.chapters && data.chapters.length > 0) {
        setChapters(data.chapters);
        // Auto-expand and select all
        const allChapterIds = new Set(data.chapters.map((c: Chapter) => c.id));
        setExpandedChapters(allChapterIds);
        // Auto-select based on exam type
        autoSelectByExamType(loaiKiemTra, data.chapters);
      } else {
        throw new Error('Không tìm thấy dữ liệu bài học trong file');
      }
    } catch (error: any) {
      console.error('Parse PPCT error:', error);
      const errMsg = error?.message || JSON.stringify(error) || '';
      const isQuota = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
      Swal.fire({
        title: isQuota ? 'Hết quota API' : 'Lỗi phân tích',
        html: isQuota
          ? 'API Key đã hết lượt gọi miễn phí.<br><br>💡 <b>Giải pháp:</b><br>• Đợi vài phút rồi thử lại<br>• Hoặc nâng cấp API Key lên gói trả phí'
          : (errMsg.length > 200 ? errMsg.substring(0, 200) + '...' : errMsg) || 'Không thể phân tích file PPCT',
        icon: isQuota ? 'warning' : 'error',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const autoSelectByExamType = (examType: string, chapterList: Chapter[]) => {
    const selected = new Set<string>();
    chapterList.forEach(ch => {
      ch.lessons.forEach(les => {
        const wEnd = les.weekEnd || 99;
        const wStart = les.weekStart || 0;
        let match = false;
        if (examType.includes('Giữa kỳ 1')) match = wEnd <= 10;
        else if (examType.includes('Cuối kỳ 1')) match = wEnd <= 18;
        else if (examType.includes('Giữa kỳ 2')) match = wStart >= 19 && wEnd <= 27;
        else match = true; // Cuối kỳ 2 or default = all
        if (match) selected.add(les.id);
      });
    });
    setSelectedLessons(selected);
  };

  const toggleLesson = (lessonId: string) => {
    setSelectedLessons(prev => {
      const next = new Set(prev);
      next.has(lessonId) ? next.delete(lessonId) : next.add(lessonId);
      return next;
    });
  };

  const toggleChapter = (chapterId: string, checked: boolean) => {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    setSelectedLessons(prev => {
      const next = new Set(prev);
      chapter.lessons.forEach(l => checked ? next.add(l.id) : next.delete(l.id));
      return next;
    });
  };

  const toggleChapterExpand = (chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
      return next;
    });
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
      // Build selected topics summary
      const selectedTopics: any[] = [];
      chapters.forEach(ch => {
        const selLessons = ch.lessons.filter(l => selectedLessons.has(l.id));
        if (selLessons.length > 0) {
          selectedTopics.push({
            name: ch.name,
            lessons: selLessons.map(l => ({ name: l.name, periods: l.periods }))
          });
        }
      });
      const ppctSummary = selectedTopics.length > 0
        ? selectedTopics.map(t => `${t.name}: ${t.lessons.map((l: any) => `${l.name} (${l.periods} tiết)`).join(', ')}`).join('\n')
        : `Khối ${khoiLop || '10'} - Chưa có danh sách bài cụ thể`;

      const structureSummary = examStructure
        .map(r => `${r.label}: Biết=${r.biet}, Hiểu=${r.hieu}, VD=${r.vandung}, VDcao=${r.vandungcao}`)
        .join('\n');

      const prompt = `Hãy tạo MA TRẬN ĐỀ KIỂM TRA cho môn ${monHoc}.
Loại kiểm tra: ${loaiKiemTra}, Thời gian: ${thoiGian} phút.

PPCT (các bài đã chọn):
${ppctSummary}

Cấu trúc đề thi:
${structureSummary}

Trả về Full HTML Document chứa bảng ma trận đề kiểm tra theo CV 7991.
Style CSS inline: font Times New Roman, border collapse, padding 4px 6px.
CHỈ trả về HTML thuần, KHÔNG có markdown code block.`;
      const result = await callGeminiAI(prompt, apiKey, model);

      // Clean markdown code blocks if any
      const cleanHtml = result.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
      setMatrixHtml(cleanHtml);
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

  const downloadHtml = (html: string, filename: string) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDoc = (html: string, filename: string) => {
    const htmlWithMeta = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><style>body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.5;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid black;padding:5px;vertical-align:middle;}th{font-weight:bold;}</style></head><body>${html}</body></html>`;
    const blob = new Blob(['\uFEFF', htmlWithMeta], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadMatrix = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.doc';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          setMatrixHtml(reader.result as string);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleGenerateSpecs = async () => {
    if (!matrixHtml) return;
    setIsGenerating(true);
    try {
      const prompt = `Dựa trên Ma trận đề kiểm tra (HTML) đã tạo, hãy tạo BẢNG ĐẶC TẢ ĐỀ KIỂM TRA (Full HTML Document).

MA TRẬN ĐẦU VÀO:
${matrixHtml}

YÊU CẦU:
1. Tiêu đề bảng: "ĐẶC TẢ ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} – ${monHoc.toUpperCase()}"
2. Dưới tiêu đề: "NĂM HỌC 20... - 20..."
3. CẤU TRÚC CỘT PHẢI KHỚP 100% với Ma trận, thêm cột "Yêu cầu cần đạt"
4. Mỗi bài học có 2 dòng (sub-row): dòng 1 số lượng câu, dòng 2 mã năng lực (TD/GQVĐ)
5. Footer 3 dòng: Tổng số câu, Tổng số điểm (=10), Tỉ lệ %
6. Cột "Yêu cầu cần đạt" ghi chi tiết: Nhận biết, Thông hiểu, Vận dụng

Style CSS:
body { font-family: "Times New Roman", serif; font-size: 13pt; margin: 20px; }
h2 { text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
table { width: 100%; border-collapse: collapse; margin-top: 15px; }
th, td { border: 1px solid black; padding: 4px 6px; text-align: center; vertical-align: middle; }
th { font-weight: bold; }
.left-align, .text-left { text-align: left; padding: 6px 8px; vertical-align: top; }
.bold { font-weight: bold; }

CHỈ trả về HTML thuần, KHÔNG có markdown code block.`;

      const result = await callGeminiAI(prompt, apiKey, model);
      const cleanHtml = result.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
      setSpecsHtml(cleanHtml);
      setCurrentStep(3);
    } catch (error: any) {
      Swal.fire({
        title: 'Lỗi tạo đặc tả',
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

  const handleGenerateExam = async () => {
    if (!specsHtml) return;
    setIsGenerating(true);
    try {
      const prompt = `Dựa trên Bảng đặc tả (HTML) sau, hãy soạn ĐỀ THI HOÀN CHỈNH và HƯỚNG DẪN CHẤM.

BẢNG ĐẶC TẢ:
${specsHtml}

YÊU CẦU OUTPUT:
1. Full HTML Document (<!DOCTYPE html>...)
2. Tiêu đề: ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} – ${monHoc.toUpperCase()}
3. Thời gian: ${thoiGian} phút
4. Năm học: "NĂM HỌC 20... - 20..." (để trống)
5. Trường: "TRƯỜNG THPT ..............." (để trống)
6. Có phần Họ tên, SBD
7. Nội dung câu hỏi phải phù hợp với bảng đặc tả
8. Đáp án rõ ràng ở cuối

Format câu hỏi:
- Trắc nghiệm: Câu X. Nội dung -> A. B. C. D.
- Đúng/Sai: Câu X. Đề dẫn -> a) b) c) d)
- Trả lời ngắn: Câu X. Nội dung
- Tự luận: Câu X. Nội dung (nếu có)

Style CSS:
body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.5; color: #000; margin: 20px; }
h3, h4 { text-align: center; font-weight: bold; margin-top: 20px; }
.question-number { font-weight: bold; }
.options { margin-left: 20px; }
.option-item { margin-bottom: 5px; }

CHỈ trả về HTML thuần, KHÔNG có markdown code block.`;

      const result = await callGeminiAI(prompt, apiKey, model);
      const cleanHtml = result.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
      setExamHtml(cleanHtml);
      setCurrentStep(4);
    } catch (error: any) {
      Swal.fire({
        title: 'Lỗi tạo đề thi',
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
              if (file) {
                setPpctFile(file);
                setChapters([]);
                setSelectedLessons(new Set());
                handleParsePPCT(file);
              }
            }}
          />
          {ppctFile ? (
            <div className="flex items-center justify-between px-4 py-3 border border-primary/30 rounded-xl bg-primary/5">
              <div className="flex items-center gap-2 min-w-0">
                {isParsing ? (
                  <Loader2 size={16} className="text-primary animate-spin shrink-0" />
                ) : (
                  <Check size={16} className="text-primary shrink-0" />
                )}
                <span className="text-sm text-primary truncate">{ppctFile.name}</span>
                {isParsing && <span className="text-xs text-slate-400 shrink-0">Đang phân tích...</span>}
              </div>
              <button
                onClick={() => {
                  setPpctFile(null);
                  setChapters([]);
                  setSelectedLessons(new Set());
                  (document.getElementById('ppct-upload') as HTMLInputElement).value = '';
                }}
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

      {/* Card 2: Chọn chủ đề trọng tâm (after PPCT parsed) */}
      {chapters.length > 0 && (
        <div className="glass-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="section-number">2</span>
              <h2 className="text-lg font-semibold text-primary">Chọn chủ đề trọng tâm</h2>
            </div>
            <button
              onClick={() => autoSelectByExamType(loaiKiemTra, chapters)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-slate-400 hover:text-primary transition-colors"
            >
              <Filter size={12} />
              Lọc theo kỳ
            </button>
          </div>

          <div className="space-y-1 rounded-xl overflow-hidden border border-border">
            {chapters.map((chapter) => {
              const isExpanded = expandedChapters.has(chapter.id);
              const selectedCount = chapter.lessons.filter(l => selectedLessons.has(l.id)).length;
              const allSelected = selectedCount === chapter.lessons.length;
              const someSelected = selectedCount > 0 && !allSelected;
              return (
                <div key={chapter.id} className="border-b border-border last:border-0">
                  {/* Chapter header */}
                  <div className="flex items-center py-2.5 px-3 bg-surface-light/40 hover:bg-surface-light transition-colors">
                    <button onClick={() => toggleChapterExpand(chapter.id)} className="p-1 mr-2 text-slate-400">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <input
                      type="checkbox"
                      className="w-4 h-4 mr-3 accent-primary"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={(e) => toggleChapter(chapter.id, e.target.checked)}
                    />
                    <div className="flex-1 text-sm font-semibold text-slate-200">{chapter.name}</div>
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-light text-primary border border-border ml-2">
                      {chapter.totalPeriods} tiết
                    </span>
                  </div>

                  {/* Lessons list */}
                  {isExpanded && (
                    <div className="pl-12 pr-4 py-2 space-y-0.5 bg-bg">
                      {chapter.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          onClick={() => toggleLesson(lesson.id)}
                          className={`flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors ${selectedLessons.has(lesson.id)
                            ? 'bg-primary/10'
                            : 'hover:bg-surface-light'
                            }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedLessons.has(lesson.id)
                              ? 'bg-primary border-primary'
                              : 'border-border'
                              }`}>
                              {selectedLessons.has(lesson.id) && <Check size={10} className="text-bg" />}
                            </div>
                            <span className={`text-sm truncate ${selectedLessons.has(lesson.id) ? 'text-slate-200' : 'text-slate-400'}`}>
                              {lesson.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-xs text-primary">{lesson.periods} tiết</span>
                            {lesson.weekEnd && (
                              <span className="text-xs text-slate-500">Tuần {lesson.weekStart}-{lesson.weekEnd}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center text-sm text-primary px-3 py-2 rounded-lg bg-surface-light border border-border">
            Đã chọn: <strong className="ml-1">{selectedLessons.size}</strong>&nbsp;bài học
          </div>
        </div>
      )}

      {/* Card 3: Cấu trúc đề thi */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">3</span>
          <h2 className="text-lg font-semibold text-primary">Cấu trúc đề thi (Số lượng câu hỏi)</h2>
        </div>

        <div className="space-y-5">
          {examStructure.map((row, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="sm:w-52 shrink-0">
                <span className="text-sm font-medium text-primary">{row.label}</span>
              </div>
              <div className="flex-1 grid grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs text-primary mb-1.5">Biết</label>
                  <input type="number" value={row.biet} onChange={(e) => updateStructure(idx, 'biet', parseInt(e.target.value) || 0)} className="input-field text-center" min={0} />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">Hiểu</label>
                  <input type="number" value={row.hieu} onChange={(e) => updateStructure(idx, 'hieu', parseInt(e.target.value) || 0)} className="input-field text-center" min={0} />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">Vận dụng</label>
                  <input type="number" value={row.vandung} onChange={(e) => updateStructure(idx, 'vandung', parseInt(e.target.value) || 0)} className="input-field text-center" min={0} />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">VD cao</label>
                  <input type="number" value={row.vandungcao} onChange={(e) => updateStructure(idx, 'vandungcao', parseInt(e.target.value) || 0)} className="input-field text-center" min={0} />
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
      <div className="glass-card p-6 md:p-8">
        {/* Header + buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="section-number">2</span>
            <h2 className="text-lg font-semibold text-primary">Ma trận đề thi</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleUploadMatrix} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors">
              <Upload size={13} /> Upload Ma trận
            </button>
            <button onClick={() => downloadDoc(matrixHtml, `ma_tran_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!matrixHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <FileText size={13} /> Tải Word (.doc)
            </button>
            <button onClick={() => downloadHtml(matrixHtml, `ma_tran_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!matrixHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <Download size={13} /> Tải HTML
            </button>
            <button
              onClick={handleGenerateSpecs}
              disabled={isGenerating || !matrixHtml}
              className="gradient-btn flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight size={13} />
              )}
              Tiếp theo: Bảng đặc tả
            </button>
          </div>
        </div>

        {matrixHtml ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Source code */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Code size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Source Code (HTML/Markdown)</span>
              </div>
              <div className="bg-bg border border-border rounded-xl overflow-hidden">
                <textarea
                  value={matrixHtml}
                  onChange={(e) => setMatrixHtml(e.target.value)}
                  className="w-full h-[500px] bg-transparent text-slate-300 text-xs font-mono p-4 resize-none outline-none"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Right: Preview */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Eye size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trước</span>
              </div>
              <div className="bg-white rounded-xl overflow-auto h-[500px] border border-border">
                <iframe
                  srcDoc={matrixHtml}
                  className="w-full h-full"
                  title="Matrix Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[300px] text-slate-500">
            <p>Ma trận sẽ được hiển thị sau khi tạo từ bước 1 hoặc upload file.</p>
          </div>
        )}
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
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="section-number">3</span>
            <h2 className="text-lg font-semibold text-primary">Bảng đặc tả</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => downloadDoc(specsHtml, `dac_ta_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!specsHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <FileText size={13} /> Tải Word (.doc)
            </button>
            <button onClick={() => downloadHtml(specsHtml, `dac_ta_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!specsHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <Download size={13} /> Tải HTML
            </button>
            <button
              onClick={handleGenerateExam}
              disabled={isGenerating || !specsHtml}
              className="gradient-btn flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight size={13} />
              )}
              Tiếp theo: Đề thi
            </button>
          </div>
        </div>

        {specsHtml ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Code size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Source Code (HTML/Markdown)</span>
              </div>
              <div className="bg-bg border border-border rounded-xl overflow-hidden">
                <textarea
                  value={specsHtml}
                  onChange={(e) => setSpecsHtml(e.target.value)}
                  className="w-full h-[500px] bg-transparent text-slate-300 text-xs font-mono p-4 resize-none outline-none"
                  spellCheck={false}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Eye size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trước</span>
              </div>
              <div className="bg-white rounded-xl overflow-auto h-[500px] border border-border">
                <iframe
                  srcDoc={specsHtml}
                  className="w-full h-full"
                  title="Specs Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[300px] text-slate-500">
            <p>Bảng đặc tả sẽ được hiển thị sau khi hoàn thành ma trận.</p>
          </div>
        )}
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
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="section-number">4</span>
            <h2 className="text-lg font-semibold text-primary">Đề thi hoàn chỉnh</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => downloadDoc(examHtml, `de_thi_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!examHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <FileText size={13} /> Tải Word (.doc)
            </button>
            <button onClick={() => downloadHtml(examHtml, `de_thi_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!examHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <Download size={13} /> Tải HTML
            </button>
          </div>
        </div>

        {examHtml ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Code size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Source Code (HTML/Markdown)</span>
              </div>
              <div className="bg-bg border border-border rounded-xl overflow-hidden">
                <textarea
                  value={examHtml}
                  onChange={(e) => setExamHtml(e.target.value)}
                  className="w-full h-[500px] bg-transparent text-slate-300 text-xs font-mono p-4 resize-none outline-none"
                  spellCheck={false}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Eye size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trước</span>
              </div>
              <div className="bg-white rounded-xl overflow-auto h-[500px] border border-border">
                <iframe
                  srcDoc={examHtml}
                  className="w-full h-full"
                  title="Exam Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[300px] text-slate-500">
            <p>Đề thi sẽ được tạo sau khi hoàn thành bảng đặc tả.</p>
          </div>
        )}
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
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Mới nhất)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
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
