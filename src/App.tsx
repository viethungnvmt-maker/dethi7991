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
  biet: {
    count: number;
    score: number;
  };
  hieu: {
    count: number;
    score: number;
  };
  vandung: {
    count: number;
    score: number;
  };
  vandungcao: {
    count: number;
    score: number;
  };
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

interface SelectedLessonSummary {
  chapterName: string;
  lessonName: string;
}

const STRUCTURE_LEVELS = [
  { key: 'biet', label: 'Biết' },
  { key: 'hieu', label: 'Hiểu' },
  { key: 'vandung', label: 'Vận dụng' },
  { key: 'vandungcao', label: 'Vận dụng cao' },
] as const;

type StructureLevelKey = typeof STRUCTURE_LEVELS[number]['key'];
type StructureMetricKey = 'count' | 'score';

const createStructureCell = () => ({ count: 0, score: 0 });

const DEFAULT_EXAM_STRUCTURE: ExamStructureRow[] = [
  {
    label: 'Dạng I (1 lựa chọn)',
    biet: createStructureCell(),
    hieu: createStructureCell(),
    vandung: createStructureCell(),
    vandungcao: createStructureCell(),
  },
  {
    label: 'Dạng II (Đúng/Sai)',
    biet: createStructureCell(),
    hieu: createStructureCell(),
    vandung: createStructureCell(),
    vandungcao: createStructureCell(),
  },
  {
    label: 'Dạng III (Trả lời ngắn)',
    biet: createStructureCell(),
    hieu: createStructureCell(),
    vandung: createStructureCell(),
    vandungcao: createStructureCell(),
  },
  {
    label: 'Tự luận',
    biet: createStructureCell(),
    hieu: createStructureCell(),
    vandung: createStructureCell(),
    vandungcao: createStructureCell(),
  },
];

const formatScore = (value: number) => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/\.?0+$/, '');
};

const parseCountInputValue = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  const parsed = digitsOnly === '' ? 0 : Number(digitsOnly);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatScoreInputValue = (value: number) => formatScore(value).replace('.', ',');

const parseScoreInputValue = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [integerPart = '', ...decimalParts] = normalized.split('.');
  const sanitized = decimalParts.length > 0
    ? `${integerPart}.${decimalParts.join('')}`
    : integerPart;
  const parsed = sanitized === '' ? 0 : Number(sanitized);

  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
};

const snapScoreValue = (value: number) => Math.max(0, Math.round((value + Number.EPSILON) * 4) / 4);

const calculateTotalQuestions = (rows: ExamStructureRow[]) =>
  rows.reduce(
    (sum, row) => sum + STRUCTURE_LEVELS.reduce((rowSum, level) => rowSum + row[level.key].count, 0),
    0,
  );

const calculateTotalPoints = (rows: ExamStructureRow[]) =>
  rows.reduce(
    (sum, row) =>
      sum + STRUCTURE_LEVELS.reduce((rowSum, level) => rowSum + row[level.key].count * row[level.key].score, 0),
    0,
  );

const calculateRowTotals = (row: ExamStructureRow) => ({
  count: STRUCTURE_LEVELS.reduce((sum, level) => sum + row[level.key].count, 0),
  score: STRUCTURE_LEVELS.reduce((sum, level) => sum + row[level.key].count * row[level.key].score, 0),
});

const compactHtmlForPrompt = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildExamQuestionRanges = (rows: ExamStructureRow[]) => {
  let currentQuestion = 1;

  return rows.map((row) => {
    const total = calculateRowTotals(row).count;
    if (total === 0) {
      return { label: row.label, total, start: 0, end: 0 };
    }

    const range = {
      label: row.label,
      total,
      start: currentQuestion,
      end: currentQuestion + total - 1,
    };

    currentQuestion += total;
    return range;
  });
};

const htmlToPlainText = (html: string) => {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const countQuestionsInGeneratedExam = (html: string) => {
  const plainText = htmlToPlainText(html);
  const matches = [...plainText.matchAll(/\bCâu\s*(\d+)\b/gi)];
  return new Set(matches.map((match) => Number(match[1]))).size;
};

const isQuarterStep = (value: number) => Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;

const describeRowConfig = (row: ExamStructureRow) =>
  STRUCTURE_LEVELS.map(
    ({ key, label }) => `${label} ${row[key].count} câu x ${formatScore(row[key].score)} điểm/câu`,
  ).join(', ');

const sanitizeGeneratedHtml = (html: string) =>
  html.replace(/```html\n?/gi, '').replace(/```\n?/g, '').trim();

const buildExamTypeRequirements = (rows: ExamStructureRow[]) => {
  const ranges = buildExamQuestionRanges(rows);

  return rows.map((row, index) => {
    const range = ranges[index];
    const total = calculateRowTotals(row).count;

    if (total === 0) {
      return `- ${row.label}: 0 câu, phải bỏ hoàn toàn dạng này khỏi đề.`;
    }

    return `- ${row.label}: ${total} câu, đánh số từ Câu ${range.start} đến Câu ${range.end}. Chi tiết mức độ: ${describeRowConfig(row)}.`;
  }).join('\n');
};

const buildQuestionChecklist = (totalQuestions: number) =>
  Array.from({ length: totalQuestions }, (_, index) => `Câu ${index + 1}`).join(', ');

const EXAM_PROMPT_TYPE_LABELS = [
  'Trac nghiem 1 dap an dung',
  'Trac nghiem dung/sai',
  'Tra loi ngan',
  'Tu luan',
] as const;

const EXAM_PROMPT_LEVEL_LABELS = [
  'biet',
  'hieu',
  'van dung',
  'van dung cao',
] as const;

const normalizeTextForMatch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const extractIntegerFromCell = (value: string) => {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
};

const buildLessonBreakdownFromMatrix = (
  matrixHtml: string,
  selectedLessonItems: SelectedLessonSummary[],
  includeEssay: boolean,
) => {
  if (!matrixHtml || selectedLessonItems.length === 0 || typeof DOMParser === 'undefined') {
    return '';
  }

  const doc = new DOMParser().parseFromString(matrixHtml, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr'));
  const groupLabels = includeEssay ? EXAM_PROMPT_TYPE_LABELS : EXAM_PROMPT_TYPE_LABELS.slice(0, 3);
  const requiredValueCells = groupLabels.length * STRUCTURE_LEVELS.length;
  const lessonLines: string[] = [];
  let lessonCursor = 0;

  rows.forEach((row) => {
    if (lessonCursor >= selectedLessonItems.length) return;

    const cellTexts = Array.from(row.querySelectorAll('td,th'))
      .map((cell) => (cell.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (cellTexts.length === 0) return;

    const rowText = normalizeTextForMatch(cellTexts.join(' '));
    const currentLesson = selectedLessonItems[lessonCursor];
    const normalizedLessonName = normalizeTextForMatch(currentLesson.lessonName);

    if (!rowText.includes(normalizedLessonName)) return;

    const lessonCellIndex = cellTexts.findIndex((cellText) =>
      normalizeTextForMatch(cellText).includes(normalizedLessonName),
    );

    if (lessonCellIndex === -1) return;

    const valueCells = cellTexts.slice(lessonCellIndex + 1, lessonCellIndex + 1 + requiredValueCells);
    if (valueCells.length < requiredValueCells) return;

    const summaryParts = groupLabels.map((groupLabel, groupIndex) => {
      const levelCells = valueCells.slice(
        groupIndex * STRUCTURE_LEVELS.length,
        (groupIndex + 1) * STRUCTURE_LEVELS.length,
      );

      const levelParts = EXAM_PROMPT_LEVEL_LABELS.map((levelLabel, levelIndex) => {
        const count = extractIntegerFromCell(levelCells[levelIndex] || '');
        return count > 0 ? `${count} cau ${levelLabel}` : '';
      }).filter(Boolean);

      return levelParts.length > 0 ? `${groupLabel}: ${levelParts.join(', ')}` : '';
    }).filter(Boolean);

    if (summaryParts.length > 0) {
      lessonLines.push(`- ${currentLesson.lessonName}: ${summaryParts.join('; ')}.`);
    }

    lessonCursor += 1;
  });

  return lessonLines.join('\n');
};

const renderStructureLabel = (label: string) => {
  const match = label.match(/^(.*?)(\s*\(.+\))$/);

  if (!match) {
    return <span className="block max-w-full text-sm font-medium text-primary leading-6 break-words [overflow-wrap:anywhere]">{label}</span>;
  }

  const parenthesized = match[2].trim();
  const innerText = parenthesized.slice(1, -1);
  const slashParts = innerText.split('/').map((part) => part.trim()).filter(Boolean);

  return (
    <span className="block max-w-full text-sm font-medium text-primary leading-6 break-words [overflow-wrap:anywhere]">
      <span className="block">{match[1].trim()}</span>
      {slashParts.length > 1 ? (
        <span className="block">
          {slashParts.map((part, index) => (
            <span key={`${label}-${part}-${index}`} className="block">
              {index === 0 ? `(${part}/` : index === slashParts.length - 1 ? `${part})` : `${part}/`}
            </span>
          ))}
        </span>
      ) : (
        <span className="block">{parenthesized}</span>
      )}
    </span>
  );
};

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
  const totalConfiguredQuestions = calculateTotalQuestions(examStructure);
  const totalConfiguredPoints = calculateTotalPoints(examStructure);

  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('gemini_model', model);
  }, [apiKey, model]);

  // ─── Handlers ───────────────────────────────────────────────────
  const updateStructure = (
    index: number,
    field: StructureLevelKey,
    metric: StructureMetricKey,
    value: number,
  ) => {
    const normalizedValue = Math.max(0, metric === 'count' ? Math.floor(value) : value);

    setExamStructure(prev => prev.map((row, i) =>
      i === index
        ? { ...row, [field]: { ...row[field], [metric]: normalizedValue } }
        : row
    ));
  };

  const handleScoreKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    field: StructureLevelKey,
    currentValue: number,
  ) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? 0.25 : -0.25;
    updateStructure(index, field, 'score', snapScoreValue(currentValue + delta));
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
    if (selectedLessons.size === 0) {
      Swal.fire({
        title: 'Chưa chọn bài học',
        text: 'Vui lòng chọn ít nhất 1 bài học/chủ đề!',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }
    const hasInvalidScoreStep = examStructure.some((row) =>
      STRUCTURE_LEVELS.some(({ key }) => !isQuarterStep(row[key].score)),
    );
    if (hasInvalidScoreStep) {
      Swal.fire({
        title: 'Điểm chưa hợp lệ',
        text: 'Điểm mỗi câu phải là bội số của 0.25.',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }
    if (Math.abs(totalConfiguredPoints - 10) > 1e-9) {
      Swal.fire({
        title: 'Tổng điểm chưa đúng',
        text: `Tổng điểm hiện tại là ${formatScore(totalConfiguredPoints)}. Vui lòng chỉnh về đúng 10 điểm trước khi tạo ma trận.`,
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }
    setIsGenerating(true);
    try {
      // Build selected topics data
      const selectedTopics: any[] = [];
      let totalPeriods = 0;
      chapters.forEach(ch => {
        const selLessons = ch.lessons.filter(l => selectedLessons.has(l.id));
        if (selLessons.length > 0) {
          selectedTopics.push({
            name: ch.name,
            lessons: selLessons.map(l => ({ name: l.name, periods: l.periods }))
          });
          totalPeriods += selLessons.reduce((s, l) => s + (l.periods || 1), 0);
        }
      });

      const qc = examStructure;
      // qc[0] = Dạng I (1 lựa chọn), qc[1] = Dạng II (Đúng/Sai), qc[2] = Dạng III (Trả lời ngắn), qc[3] = Tự luận
      const hasEssay = qc[3] && (
        qc[3].biet.count +
        qc[3].hieu.count +
        qc[3].vandung.count +
        qc[3].vandungcao.count
      ) > 0;

      const prompt = `Hãy tạo **MA TRẬN ĐỀ KIỂM TRA** (HTML Table) cho môn **${monHoc}**, khối **${khoiLop}**.

**CẤU HÌNH ĐỀ THI:**
- Loại đề: ${loaiKiemTra}
- Thời gian: ${thoiGian} phút
- Tổng số tiết trọng tâm: ${totalPeriods} tiết
- Tổng số câu: ${totalConfiguredQuestions}
- Tổng điểm theo cấu hình: ${formatScore(totalConfiguredPoints)}

**CẤU TRÚC CÂU HỎI VÀ ĐIỂM/CÂU (Bắt buộc tuân thủ):**
- 1 lựa chọn (Dạng I): ${describeRowConfig(qc[0])}
- Đúng - Sai (Dạng II): ${describeRowConfig(qc[1])}
- Trả lời ngắn (Dạng III): ${describeRowConfig(qc[2])}
- Tự luận: ${describeRowConfig(qc[3])}

**===== ĐỊNH DẠNG BẢNG BẮT BUỘC =====**
Tiêu đề bảng (in đậm, căn giữa): **MA TRẬN ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} - ${monHoc.toUpperCase()} ${khoiLop}**
Dưới tiêu đề: **NĂM HỌC 20... - 20...** (để trống)

**HEADER BẢNG (4 dòng merge cells):**
- Dòng 1: TT(rowspan=4) | Chương/chủ đề(rowspan=4) | Nội dung/ĐVKT(rowspan=4) | Mức độ đánh giá(colspan=...) | Tổng số câu(colspan=4,rowspan=2) | Tỉ lệ % điểm(rowspan=4)
- Dòng 2: TNKQ(colspan=...)
- Dòng 3: 1 lựa chọn(colspan=4) | Đúng-Sai(colspan=4) | Trả lời ngắn(colspan=4) ${hasEssay ? '| Tự luận(colspan=4)' : ''} | Biết | Hiểu | VD | VDC
- Dòng 4: Biết | Hiểu | VD | VDC | Biết | Hiểu | VD | VDC | Biết | Hiểu | VD | VDC ${hasEssay ? '| Biết | Hiểu | VD | VDC' : ''}

${!hasEssay ? 'KHÔNG CÓ tự luận => KHÔNG tạo cột Tự luận.' : 'CÓ tự luận => thêm cột Tự luận (colspan=4).'}

**NỘI DUNG BẢNG - MỖI BÀI HỌC CÓ 2 DÒNG (sub-row):**
- Dòng 1: Số lượng câu hỏi. Ô "Nội dung" ghi tên bài + (X tiết), dùng rowspan=2
- Dòng 2: Ô Biết/Hiểu ghi "TD", ô VD ghi "GQVĐ", ô VDC ghi "GQVĐ cao". Nếu 0 câu thì để trống.
- Merge cells STT & Chương: nếu 1 chương có nhiều bài => rowspan = (số bài × 2)

**FOOTER 3 DÒNG:**
1. Tổng số câu theo từng cột + tổng cuối
2. Tổng số điểm theo từng cột + tổng = 10
3. Tỉ lệ % điểm: cuối = 100%

**QUY TẮC ĐIỂM:**
- Mọi điểm phải là bội số của 0.25
- Tổng điểm = 10
- Phân bổ câu hỏi theo tỷ lệ số tiết
- Phải dùng đúng số câu và đúng điểm/câu theo cấu hình người dùng đã nhập ở trên, không tự chia lại điểm.
- Nếu một ô có 0 câu thì để trống ở cả số câu, năng lực và điểm.

**DỮ LIỆU ĐẦU VÀO:**
${JSON.stringify(selectedTopics, null, 2)}

**YÊU CẦU OUTPUT:**
1. Xuất Full HTML Document (<!DOCTYPE html>...)
2. Bao gồm <style> với CSS:
body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.3; margin: 20px; }
h2 { text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
th, td { border: 1px solid black; padding: 4px 6px; text-align: center; vertical-align: middle; }
th { font-weight: bold; }
.left-align { text-align: left; padding-left: 8px; }
.bold { font-weight: bold; }
3. CHỈ trả về HTML thuần, KHÔNG có markdown code block.`;

      const result = await callGeminiAI(prompt, apiKey, model);
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

  const downloadDoc = (html: string, filename: string, landscape: boolean = false) => {
    // A4: width=11906 twips (210mm), height=16838 twips (297mm)
    // Landscape: swap w/h and add orient
    const pgW = landscape ? 16838 : 11906;
    const pgH = landscape ? 11906 : 16838;
    const wordSetup = `
      <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>
        <w:Body><w:SectPr>
          <w:pgSz w:w="${pgW}" w:h="${pgH}" ${landscape ? 'w:orient="landscape"' : ''}/>
          <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
        </w:SectPr></w:Body>
      </w:WordDocument></xml>
      <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>
        <w:Body><w:SectPr>
          <w:pgSz w:w="${pgW}" w:h="${pgH}" ${landscape ? 'w:orient="landscape"' : ''}/>
          <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
        </w:SectPr></w:Body>
      </w:WordDocument></xml><![endif]-->`;
    const pageStyle = landscape
      ? `@page { size: A4 landscape; margin: 2cm; } @page Section1 { size: 29.7cm 21cm; mso-page-orientation: landscape; margin: 2cm; }`
      : `@page { size: A4; margin: 2cm; } @page Section1 { size: 21cm 29.7cm; margin: 2cm; }`;
    const htmlWithMeta = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'>${wordSetup}<style>${pageStyle} body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.5;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid black;padding:5px;vertical-align:middle;}th{font-weight:bold;}</style></head><body>${html}</body></html>`;
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

  const handleUploadSpecs = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.doc';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          setSpecsHtml(reader.result as string);
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
4. Mỗi bài học có 2 dòng (sub-row): dòng 1 số lượng câu, dòng 2 mã năng lực (TD/GQVĐ/GQVĐ cao)
5. Footer 3 dòng: Tổng số câu, Tổng số điểm (=10), Tỉ lệ %
6. Cột "Yêu cầu cần đạt" ghi chi tiết: Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao
7. **QUAN TRỌNG - Cách tính điểm Đúng/Sai (Dạng II):** Mỗi câu Đúng/Sai có 4 mệnh đề (a, b, c, d). Mỗi mệnh đề đúng được 0.25 điểm → 1 câu Đúng/Sai = 1.0 điểm. Khi tính điểm trong bảng, 1 câu Đúng/Sai = 1.0 điểm.

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
      const examQuestionRanges = buildExamQuestionRanges(examStructure);
      const compactSpecsHtml = compactHtmlForPrompt(specsHtml);
      const activeQuestionTypes = examQuestionRanges.filter((item) => item.total > 0);
      const selectedLessonItems: SelectedLessonSummary[] = chapters.flatMap((chapter) =>
        chapter.lessons
          .filter((lesson) => selectedLessons.has(lesson.id))
          .map((lesson) => ({ chapterName: chapter.name, lessonName: lesson.name })),
      );
      const includeEssay = calculateRowTotals(examStructure[3]).count > 0;
      const examTypeRequirements = buildExamTypeRequirements(examStructure);
      const questionChecklist = buildQuestionChecklist(totalConfiguredQuestions);
      const lessonBreakdownPrompt = buildLessonBreakdownFromMatrix(matrixHtml, selectedLessonItems, includeEssay);

      const basePrompt = `Dựa trên Bảng đặc tả (HTML) sau, hãy soạn ĐỀ THI HOÀN CHỈNH và HƯỚNG DẪN CHẤM.

BẢNG ĐẶC TẢ:
${compactSpecsHtml}

CẤU TRÚC SỐ CÂU BẮT BUỘC PHẢI KHỚP 100%:
- Tổng số câu toàn đề: ${totalConfiguredQuestions}
${activeQuestionTypes.map((item) => `- ${item.label}: ${item.total} câu, đánh số từ Câu ${item.start} đến Câu ${item.end}`).join('\n')}

PHÂN BỔ CHI TIẾT TỪNG DẠNG:
${examTypeRequirements}

${lessonBreakdownPrompt ? `LESSON-BY-LESSON REQUIREMENTS:
${lessonBreakdownPrompt}

If a lesson is not listed above, do not create any question from that lesson.
` : ''}

${lessonBreakdownPrompt ? `PHÃ‚N Bá»” CHI TIáº¾T THEO Tá»ªNG BÃ€I (pháº£i bÃ¡m sÃ¡t tá»«ng dÃ²ng):
${lessonBreakdownPrompt}

Náº¿u má»™t bÃ i khÃ´ng xuáº¥t hiá»‡n trong danh sÃ¡ch trÃªn thÃ¬ KHÃ”NG Ä‘Æ°á»£c táº¡o cÃ¢u há»i tá»« bÃ i Ä‘Ã³.
` : ''}

QUY TẮC BẮT BUỘC:
- Phải tạo ĐÚNG ${totalConfiguredQuestions} câu, không nhiều hơn, không ít hơn.
- Đánh số câu liên tục từ 1 đến ${totalConfiguredQuestions}.
- Nếu một dạng có 0 câu thì KHÔNG được tạo dạng đó.
- Bảng đáp án cuối bài phải đủ đúng ${totalConfiguredQuestions} câu.
- Chỉ có các trường thông tin đầu đề sau: Trường, Năm học, Thời gian làm bài, Họ và tên, SBD. KHÔNG thêm trường khác như "SĐK".
- KHÔNG được chỉ viết vài câu mẫu, KHÔNG được bỏ dở giữa chừng, KHÔNG được dùng dấu "..." để thay cho câu hỏi còn thiếu.
- Phải viết đầy đủ nội dung cho toàn bộ ${totalConfiguredQuestions} câu trong cùng một tài liệu HTML.

YÊU CẦU OUTPUT:
1. Full HTML Document (<!DOCTYPE html>...)
2. Tiêu đề: ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} – ${monHoc.toUpperCase()}
3. Thời gian: ${thoiGian} phút
4. Năm học: "NĂM HỌC 20... - 20..." (để trống)
5. Trường: "TRƯỜNG THPT ..............." (để trống)
6. Có phần Họ tên, SBD
7. Nội dung câu hỏi phải phù hợp với bảng đặc tả
8. Đáp án ở cuối PHẢI trình bày dạng BẢNG, mỗi bảng 10 câu, gồm 2 dòng:
   - Dòng 1: "Câu" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
   - Dòng 2: "Đáp án" | A | B | C | D | ... (đáp án tương ứng)
   - Bảng tiếp theo: Câu 11-20, 21-30, 31-40... cho đến hết
   - Mỗi bảng cách nhau 1 dòng trống
   - Style bảng: border 1px solid black, padding 5px, text-align center

Format câu hỏi:
- Trắc nghiệm: Câu X. Nội dung -> A. B. C. D.
- Đúng/Sai: Câu X. Đề dẫn -> a) Mệnh đề 1 b) Mệnh đề 2 c) Mệnh đề 3 d) Mệnh đề 4. Mỗi câu có 4 mệnh đề, mỗi mệnh đề Đúng hoặc Sai, mỗi mệnh đề đúng được 0.25 điểm (tổng 1 câu = 1.0 điểm).
- Trả lời ngắn: Câu X. Nội dung
- Tự luận: Câu X. Nội dung (nếu có)

Style CSS:
body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.5; color: #000; margin: 20px; }
h3, h4 { text-align: center; font-weight: bold; margin-top: 20px; }
.question-number { font-weight: bold; }
.options { margin-left: 20px; }
.option-item { margin-bottom: 5px; }

CHỈ trả về HTML thuần, KHÔNG có markdown code block.
Trước khi kết thúc, hãy tự kiểm tra rằng trong phần đề có đủ chuỗi số câu sau: ${questionChecklist}.`;

      let cleanHtml = '';
      let generatedQuestionCount = 0;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const retryPrompt = attempt === 1
          ? basePrompt
          : `${basePrompt}

LẦN THỬ ${attempt}:
- Ở lần trước bạn mới tạo được ${generatedQuestionCount}/${totalConfiguredQuestions} câu.
- Hãy tạo lại TOÀN BỘ đề từ đầu, không sửa chắp vá.
- Chỉ dừng khi đã có đủ từ Câu 1 đến Câu ${totalConfiguredQuestions}.
- Nếu thiếu bất kỳ câu nào, hãy tiếp tục viết cho đến khi đủ.`;

        const result = await callGeminiAI(retryPrompt, apiKey, model, {
          temperature: attempt === 1 ? 0.1 : 0,
          maxOutputTokens: 65536,
        });

        cleanHtml = sanitizeGeneratedHtml(result);
        generatedQuestionCount = countQuestionsInGeneratedExam(cleanHtml);

        if (generatedQuestionCount === totalConfiguredQuestions) {
          setExamHtml(cleanHtml);
          setCurrentStep(4);
          return;
        }
      }

      throw new Error(`Đề thi AI tạo ra ${generatedQuestionCount} câu, nhưng ma trận yêu cầu ${totalConfiguredQuestions} câu sau 3 lần thử. Vui lòng bấm tạo lại.`);
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
          <h2 className="text-lg font-semibold text-primary">Cấu trúc đề thi (Số câu và điểm/câu)</h2>
        </div>

        <div className="space-y-5">
          {examStructure.map((row, idx) => {
            const rowTotals = calculateRowTotals(row);

            return (
            <div key={idx} className="flex flex-col xl:grid xl:grid-cols-[4.35rem_minmax(0,1fr)] xl:items-start gap-3 xl:gap-1.5">
              <div className="min-w-0 shrink-0 pt-1">
                {renderStructureLabel(row.label)}
              </div>
              <div className="grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.18fr)] gap-3 xl:gap-1.5">
                {STRUCTURE_LEVELS.map(({ key, label }) => (
                  <div key={key} className="rounded-xl border border-border bg-surface-light/30 p-3.5 overflow-hidden">
                    <label className="block text-sm font-semibold text-primary mb-2.5">{label}</label>
                    <div className="grid grid-cols-[minmax(3rem,0.84fr)_minmax(3.8rem,1.16fr)] gap-1.5">
                      <div className="min-w-0">
                        <span className="metric-caption">Số câu</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={String(row[key].count)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateStructure(idx, key, 'count', parseCountInputValue(e.target.value))}
                          className="input-field metric-input metric-input-count number-cell min-h-12"
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="metric-caption">Điểm/câu</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatScoreInputValue(row[key].score)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateStructure(idx, key, 'score', parseScoreInputValue(e.target.value))}
                          onBlur={() => updateStructure(idx, key, 'score', snapScoreValue(row[key].score))}
                          onKeyDown={(e) => handleScoreKeyDown(e, idx, key, row[key].score)}
                          className="input-field metric-input metric-input-score number-cell min-h-12"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-primary/30 bg-primary/8 p-3.5 overflow-hidden">
                  <label className="block text-sm font-semibold text-primary mb-2.5">Tổng</label>
                  <div className="grid grid-cols-[minmax(3rem,0.84fr)_minmax(3.8rem,1.16fr)] gap-1.5">
                    <div className="min-w-0">
                      <span className="metric-caption">Tổng câu</span>
                      <div className="input-field metric-box metric-box-count number-cell min-h-12 bg-surface-light/70 text-primary overflow-hidden whitespace-nowrap">
                        {rowTotals.count}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="metric-caption">Tổng điểm</span>
                      <div className="input-field metric-box metric-box-score number-cell min-h-12 bg-surface-light/70 text-primary overflow-hidden whitespace-nowrap">
                        {formatScore(rowTotals.score)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )})}
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-4 py-3 rounded-xl border border-border bg-surface-light/40 text-sm">
          <span className="text-slate-300">
            Tổng câu: <strong className="text-primary">{totalConfiguredQuestions}</strong>
          </span>
          <span className={Math.abs(totalConfiguredPoints - 10) < 1e-9 ? 'text-slate-300' : 'text-amber-300'}>
            Tổng điểm: <strong className="text-primary">{formatScore(totalConfiguredPoints)}/10</strong>
          </span>
          <span className="text-slate-500 text-xs">Điểm/câu nên nhập theo bước 0.25.</span>
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
            <button onClick={() => downloadDoc(matrixHtml, `ma_tran_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`, true)} disabled={!matrixHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
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
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trước</span>
            </div>
            <div className="bg-white rounded-xl overflow-auto h-[650px] border border-border">
              <iframe
                srcDoc={matrixHtml}
                className="w-full h-full"
                title="Matrix Preview"
                sandbox="allow-same-origin"
              />
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
            <button onClick={handleUploadSpecs} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors">
              <Upload size={13} /> Upload Đặc tả
            </button>
            <button onClick={() => downloadDoc(specsHtml, `dac_ta_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`, true)} disabled={!specsHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
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
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trước</span>
            </div>
            <div className="bg-white rounded-xl overflow-auto h-[650px] border border-border">
              <iframe
                srcDoc={specsHtml}
                className="w-full h-full"
                title="Specs Preview"
                sandbox="allow-same-origin"
              />
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
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trước</span>
            </div>
            <div className="bg-white rounded-xl overflow-auto h-[650px] border border-border">
              <iframe
                srcDoc={examHtml}
                className="w-full h-full"
                title="Exam Preview"
                sandbox="allow-same-origin"
              />
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
                  <option value="gemini-3-flash-preview">Gemini 3 Flash (Preview)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
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
