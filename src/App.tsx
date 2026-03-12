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

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STEPS = [
  { id: 1, title: 'ThÃ´ng tin' },
  { id: 2, title: 'Ma tráº­n' },
  { id: 3, title: 'Báº£ng Ä‘áº·c táº£' },
  { id: 4, title: 'Äá» thi' },
];

const MON_HOC_LIST = [
  'ToÃ¡n', 'Ngá»¯ vÄƒn', 'Váº­t lÃ­', 'HÃ³a há»c', 'Sinh há»c',
  'Lá»‹ch sá»­', 'Äá»‹a lÃ­', 'GDCD', 'Tiáº¿ng Anh', 'Tin há»c',
  'CÃ´ng nghá»‡', 'GDTC', 'Ã‚m nháº¡c', 'MÄ© thuáº­t',
];

const KHOI_LOP_LIST = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const LOAI_KIEM_TRA = [
  'Giá»¯a ká»³ 1', 'Cuá»‘i ká»³ 1', 'Giá»¯a ká»³ 2', 'Cuá»‘i ká»³ 2',
];

interface ExamStructureRow {
  label: string;
  biet: number;
  hieu: number;
  vandung: number;
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
  { label: 'Dáº¡ng I (1 lá»±a chá»n)', biet: 0, hieu: 0, vandung: 0 },
  { label: 'Dáº¡ng II (ÄÃºng/Sai)', biet: 0, hieu: 0, vandung: 0 },
  { label: 'Dáº¡ng III (Tráº£ lá»i ngáº¯n)', biet: 0, hieu: 0, vandung: 0 },
  { label: 'Tá»± luáº­n', biet: 0, hieu: 0, vandung: 0 },
];

// â”€â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const [loaiKiemTra, setLoaiKiemTra] = useState('Giá»¯a ká»³ 1');
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

  // â”€â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const updateStructure = (index: number, field: 'biet' | 'hieu' | 'vandung', value: number) => {
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

      if (data.chapters && data.chapters.length > 0) {
        setChapters(data.chapters);
        const allChapterIds = new Set(data.chapters.map((c: Chapter) => c.id));
        setExpandedChapters(allChapterIds);
        autoSelectByExamType(loaiKiemTra, data.chapters);
      } else {
        throw new Error('Không tìm thấy dữ liệu bài học trong file');
      }
    } catch (error: any) {
      const errMsg = error?.message || JSON.stringify(error) || '';
      Swal.fire({
        title: 'Lỗi phân tích',
        text: (errMsg.length > 220 ? `${errMsg.substring(0, 220)}...` : errMsg) || 'Không thể phân tích file PPCT',
        icon: 'error',
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
        else match = true;
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
      chapter.lessons.forEach(l => (checked ? next.add(l.id) : next.delete(l.id)));
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

  const stripMarkdownFences = (rawHtml: string) =>
    rawHtml
      .replace(/```html\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

  const isFullHtmlDocument = (rawHtml: string) => /<html[\s>]/i.test(rawHtml);

  const extractBodyContent = (rawHtml: string) => {
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch?.[1]?.trim() || rawHtml;
  };

  const sanitizeFilename = (filename: string) =>
    filename
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'tai_lieu';

  const triggerFileDownload = (blob: Blob, fullFilename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadHtml = (html: string, filename: string) => {
    const cleanFilename = sanitizeFilename(filename);
    const cleanHtml = stripMarkdownFences(html);
    const htmlForDownload = isFullHtmlDocument(cleanHtml)
      ? cleanHtml
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${cleanFilename}</title></head><body>${cleanHtml}</body></html>`;

    const blob = new Blob([htmlForDownload], { type: 'text/html;charset=utf-8' });
    triggerFileDownload(blob, `${cleanFilename}.html`);
  };

  const downloadDoc = (html: string, filename: string, landscape: boolean = false) => {
    const pgW = landscape ? 16838 : 11906;
    const pgH = landscape ? 11906 : 16838;
    const wordSetup = `
      <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>
        <w:Body><w:SectPr>
          <w:pgSz w:w="${pgW}" w:h="${pgH}" ${landscape ? 'w:orient="landscape"' : ''}/>
          <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
        </w:SectPr></w:Body>
      </w:WordDocument></xml>`;
    const pageStyle = landscape
      ? `@page { size: A4 landscape; margin: 2cm; } @page Section1 { size: 29.7cm 21cm; mso-page-orientation: landscape; margin: 2cm; }`
      : `@page { size: A4; margin: 2cm; } @page Section1 { size: 21cm 29.7cm; margin: 2cm; }`;

    const cleanFilename = sanitizeFilename(filename);
    const cleanHtml = stripMarkdownFences(html);
    const bodyContent = extractBodyContent(cleanHtml);
    const htmlWithMeta = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'>${wordSetup}<style>${pageStyle} body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.5;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid black;padding:5px;vertical-align:middle;}th{font-weight:bold;}</style></head><body><div class="Section1">${bodyContent}</div></body></html>`;
    const blob = new Blob(['\uFEFF', htmlWithMeta], { type: 'application/msword' });
    triggerFileDownload(blob, `${cleanFilename}.doc`);
  };

  const handleUploadMatrix = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.doc';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['html', 'htm', 'doc'].includes(ext)) {
        Swal.fire({
          title: 'Định dạng chưa hỗ trợ',
          text: 'Vui lòng chọn file .html, .htm hoặc .doc (xuất từ ứng dụng này).',
          icon: 'warning',
          confirmButtonColor: '#2dd4a8',
          background: '#132a1f',
          color: '#e2e8f0',
        });
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        Swal.fire({
          title: 'Lỗi đọc file',
          text: 'Không thể đọc file đã chọn. Vui lòng thử lại với file khác.',
          icon: 'error',
          confirmButtonColor: '#2dd4a8',
          background: '#132a1f',
          color: '#e2e8f0',
        });
      };
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);
        const tryDecode = (encoding: string) => {
          try {
            return new TextDecoder(encoding).decode(bytes);
          } catch {
            return '';
          }
        };

        const validContent = [
          tryDecode('utf-8'),
          tryDecode('windows-1252'),
          tryDecode('iso-8859-1'),
        ]
          .map(stripMarkdownFences)
          .find((candidate) => {
            const hasNullChar = candidate.includes('\u0000');
            const hasHtml = /<html[\s>]|<table[\s>]|<!doctype/i.test(candidate);
            return !hasNullChar && hasHtml;
          });

        if (!validContent) {
          Swal.fire({
            title: 'File không phù hợp',
            html: ext === 'doc'
              ? 'File .doc này có thể là định dạng Word nhị phân và không thể nạp trực tiếp.<br><br>Đã thử giải mã UTF-8 và Windows-1252 nhưng không thấy HTML hợp lệ.'
              : 'File không chứa nội dung HTML hợp lệ để nạp lại Ma trận.',
            icon: 'warning',
            confirmButtonColor: '#2dd4a8',
            background: '#132a1f',
            color: '#e2e8f0',
          });
          return;
        }

        const normalized = isFullHtmlDocument(validContent)
          ? validContent
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ma trận đề</title></head><body>${validContent}</body></html>`;

        setMatrixHtml(normalized);
        setCurrentStep(2);
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  const handleGenerateMatrix = async () => {
    if (!apiKey) {
      Swal.fire({
        title: 'Chưa có API Key',
        text: 'Vui lòng nhập API Key trong phần cài đặt.',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      setShowApiKeyModal(true);
      return;
    }
    if (!monHoc || selectedLessons.size === 0) {
      Swal.fire({
        title: 'Thiếu dữ liệu',
        text: 'Vui lòng chọn môn học và ít nhất 1 bài học.',
        icon: 'warning',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const selectedTopics: any[] = [];
      let totalPeriods = 0;
      chapters.forEach(ch => {
        const selLessons = ch.lessons.filter(l => selectedLessons.has(l.id));
        if (selLessons.length > 0) {
          selectedTopics.push({
            name: ch.name,
            lessons: selLessons.map(l => ({ name: l.name, periods: l.periods })),
          });
          totalPeriods += selLessons.reduce((sum, l) => sum + (l.periods || 1), 0);
        }
      });

      const qc = examStructure;
      const hasEssay = qc[3] && (qc[3].biet + qc[3].hieu + qc[3].vandung) > 0;
      const prompt = `Hãy tạo **MA TRẬN ĐỀ KIỂM TRA** (HTML Table) cho môn **${monHoc}**, khối **${khoiLop}**.

**CẤU HÌNH ĐỀ THI:**
- Loại đề: ${loaiKiemTra}
- Thời gian: ${thoiGian} phút
- Tổng số tiết trọng tâm: ${totalPeriods} tiết

**CẤU TRÚC SỐ LƯỢNG CÂU HỎI (Bắt buộc tuân thủ):**
- 1 lựa chọn (Dạng I): Biết ${qc[0].biet}, Hiểu ${qc[0].hieu}, VD ${qc[0].vandung}
- Đúng - Sai (Dạng II): Biết ${qc[1].biet}, Hiểu ${qc[1].hieu}, VD ${qc[1].vandung}
- Trả lời ngắn (Dạng III): Biết ${qc[2].biet}, Hiểu ${qc[2].hieu}, VD ${qc[2].vandung}
- Tự luận: Biết ${qc[3].biet}, Hiểu ${qc[3].hieu}, VD ${qc[3].vandung}

**===== ĐỊNH DẠNG BẢNG BẮT BUỘC =====**
Tiêu đề bảng (in đậm, căn giữa): **MA TRẬN ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} - ${monHoc.toUpperCase()} ${khoiLop}**
Dưới tiêu đề: **NĂM HỌC 20... - 20...** (để trống)

**HEADER BẢNG (4 dòng merge cells):**
- Dòng 1: TT(rowspan=4) | Chương/chủ đề(rowspan=4) | Nội dung/ĐVKT(rowspan=4) | Mức độ đánh giá(colspan=...) | Tổng số câu(colspan=3,rowspan=2) | Tỉ lệ % điểm(rowspan=4)
- Dòng 2: TNKQ(colspan=...)
- Dòng 3: 1 lựa chọn(colspan=3) | Đúng-Sai(colspan=3) | Trả lời ngắn(colspan=3) ${hasEssay ? '| Tự luận(colspan=3)' : ''} | Biết | Hiểu | VD
- Dòng 4: Biết | Hiểu | VD | Biết | Hiểu | VD | Biết | Hiểu | VD ${hasEssay ? '| Biết | Hiểu | VD' : ''}

${!hasEssay ? 'KHÔNG CÓ tự luận => KHÔNG tạo cột Tự luận.' : 'CÓ tự luận => thêm cột Tự luận (colspan=3).'}

**NỘI DUNG BẢNG - MỖI BÀI HỌC CÓ 2 DÒNG (sub-row):**
- Dòng 1: Số lượng câu hỏi. Ô "Nội dung" ghi tên bài + (X tiết), dùng rowspan=2
- Dòng 2: Ô Biết/Hiểu ghi "TD", ô VD ghi "GQVĐ". Nếu 0 câu thì để trống.
- Merge cells STT & Chương: nếu 1 chương có nhiều bài => rowspan = (số bài × 2)

**FOOTER 3 DÒNG:**
1. Tổng số câu theo từng cột + tổng cuối
2. Tổng số điểm theo từng cột + tổng = 10
3. Tỉ lệ % điểm: cuối = 100%

**QUY TẮC ĐIỂM:**
- Mọi điểm phải là bội số của 0.25
- Tổng điểm = 10
- Phân bổ câu hỏi theo tỷ lệ số tiết
- **QUAN TRỌNG - Cách tính điểm Đúng/Sai (Dạng II):** Mỗi câu Đúng/Sai có 4 mệnh đề (a, b, c, d). Mỗi mệnh đề đúng được 0.25 điểm → 1 câu Đúng/Sai = 1.0 điểm. Khi tính điểm trong bảng, 1 câu Đúng/Sai = 1.0 điểm (KHÔNG phải 0.25 điểm/câu).
- Dạng I (1 lựa chọn): tính điểm = tổng điểm trắc nghiệm / tổng số câu Dạng I
- Dạng III (Trả lời ngắn): tính điểm tương tự Dạng I

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
      const cleanHtml = stripMarkdownFences(result).trim();
      setMatrixHtml(cleanHtml);
      setCurrentStep(2);
    } catch (error: any) {
      Swal.fire({
        title: 'Lỗi',
        text: error.message || 'Không thể tạo ma trận',
        icon: 'error',
        confirmButtonColor: '#2dd4a8',
        background: '#132a1f',
        color: '#e2e8f0',
      });
    } finally {
      setIsGenerating(false);
    }
  };
  const handleGenerateSpecs = async () => {
    if (!matrixHtml) return;
    setIsGenerating(true);
    try {
      const prompt = `Hãy tạo **MA TRẬN ĐỀ KIỂM TRA** (HTML Table) cho môn **${monHoc}**, khối **${khoiLop}**.

**CẤU HÌNH ĐỀ THI:**
- Loại đề: ${loaiKiemTra}
- Thời gian: ${thoiGian} phút
- Tổng số tiết trọng tâm: ${totalPeriods} tiết

**CẤU TRÚC SỐ LƯỢNG CÂU HỎI (Bắt buộc tuân thủ):**
- 1 lựa chọn (Dạng I): Biết ${qc[0].biet}, Hiểu ${qc[0].hieu}, VD ${qc[0].vandung}
- Đúng - Sai (Dạng II): Biết ${qc[1].biet}, Hiểu ${qc[1].hieu}, VD ${qc[1].vandung}
- Trả lời ngắn (Dạng III): Biết ${qc[2].biet}, Hiểu ${qc[2].hieu}, VD ${qc[2].vandung}
- Tự luận: Biết ${qc[3].biet}, Hiểu ${qc[3].hieu}, VD ${qc[3].vandung}

**===== ĐỊNH DẠNG BẢNG BẮT BUỘC =====**
Tiêu đề bảng (in đậm, căn giữa): **MA TRẬN ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} - ${monHoc.toUpperCase()} ${khoiLop}**
Dưới tiêu đề: **NĂM HỌC 20... - 20...** (để trống)

**HEADER BẢNG (4 dòng merge cells):**
- Dòng 1: TT(rowspan=4) | Chương/chủ đề(rowspan=4) | Nội dung/ĐVKT(rowspan=4) | Mức độ đánh giá(colspan=...) | Tổng số câu(colspan=3,rowspan=2) | Tỉ lệ % điểm(rowspan=4)
- Dòng 2: TNKQ(colspan=...)
- Dòng 3: 1 lựa chọn(colspan=3) | Đúng-Sai(colspan=3) | Trả lời ngắn(colspan=3) ${hasEssay ? '| Tự luận(colspan=3)' : ''} | Biết | Hiểu | VD
- Dòng 4: Biết | Hiểu | VD | Biết | Hiểu | VD | Biết | Hiểu | VD ${hasEssay ? '| Biết | Hiểu | VD' : ''}

${!hasEssay ? 'KHÔNG CÓ tự luận => KHÔNG tạo cột Tự luận.' : 'CÓ tự luận => thêm cột Tự luận (colspan=3).'}

**NỘI DUNG BẢNG - MỖI BÀI HỌC CÓ 2 DÒNG (sub-row):**
- Dòng 1: Số lượng câu hỏi. Ô "Nội dung" ghi tên bài + (X tiết), dùng rowspan=2
- Dòng 2: Ô Biết/Hiểu ghi "TD", ô VD ghi "GQVĐ". Nếu 0 câu thì để trống.
- Merge cells STT & Chương: nếu 1 chương có nhiều bài => rowspan = (số bài × 2)

**FOOTER 3 DÒNG:**
1. Tổng số câu theo từng cột + tổng cuối
2. Tổng số điểm theo từng cột + tổng = 10
3. Tỉ lệ % điểm: cuối = 100%

**QUY TẮC ĐIỂM:**
- Mọi điểm phải là bội số của 0.25
- Tổng điểm = 10
- Phân bổ câu hỏi theo tỷ lệ số tiết
- **QUAN TRỌNG - Cách tính điểm Đúng/Sai (Dạng II):** Mỗi câu Đúng/Sai có 4 mệnh đề (a, b, c, d). Mỗi mệnh đề đúng được 0.25 điểm → 1 câu Đúng/Sai = 1.0 điểm. Khi tính điểm trong bảng, 1 câu Đúng/Sai = 1.0 điểm (KHÔNG phải 0.25 điểm/câu).
- Dạng I (1 lựa chọn): tính điểm = tổng điểm trắc nghiệm / tổng số câu Dạng I
- Dạng III (Trả lời ngắn): tính điểm tương tự Dạng I

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
      setSpecsHtml(cleanHtml);
      setCurrentStep(3);
    } catch (error: any) {
      Swal.fire({
        title: 'Lá»—i táº¡o Ä‘áº·c táº£',
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
      const prompt = `Hãy tạo **MA TRẬN ĐỀ KIỂM TRA** (HTML Table) cho môn **${monHoc}**, khối **${khoiLop}**.

**CẤU HÌNH ĐỀ THI:**
- Loại đề: ${loaiKiemTra}
- Thời gian: ${thoiGian} phút
- Tổng số tiết trọng tâm: ${totalPeriods} tiết

**CẤU TRÚC SỐ LƯỢNG CÂU HỎI (Bắt buộc tuân thủ):**
- 1 lựa chọn (Dạng I): Biết ${qc[0].biet}, Hiểu ${qc[0].hieu}, VD ${qc[0].vandung}
- Đúng - Sai (Dạng II): Biết ${qc[1].biet}, Hiểu ${qc[1].hieu}, VD ${qc[1].vandung}
- Trả lời ngắn (Dạng III): Biết ${qc[2].biet}, Hiểu ${qc[2].hieu}, VD ${qc[2].vandung}
- Tự luận: Biết ${qc[3].biet}, Hiểu ${qc[3].hieu}, VD ${qc[3].vandung}

**===== ĐỊNH DẠNG BẢNG BẮT BUỘC =====**
Tiêu đề bảng (in đậm, căn giữa): **MA TRẬN ĐỀ KIỂM TRA ${loaiKiemTra.toUpperCase()} - ${monHoc.toUpperCase()} ${khoiLop}**
Dưới tiêu đề: **NĂM HỌC 20... - 20...** (để trống)

**HEADER BẢNG (4 dòng merge cells):**
- Dòng 1: TT(rowspan=4) | Chương/chủ đề(rowspan=4) | Nội dung/ĐVKT(rowspan=4) | Mức độ đánh giá(colspan=...) | Tổng số câu(colspan=3,rowspan=2) | Tỉ lệ % điểm(rowspan=4)
- Dòng 2: TNKQ(colspan=...)
- Dòng 3: 1 lựa chọn(colspan=3) | Đúng-Sai(colspan=3) | Trả lời ngắn(colspan=3) ${hasEssay ? '| Tự luận(colspan=3)' : ''} | Biết | Hiểu | VD
- Dòng 4: Biết | Hiểu | VD | Biết | Hiểu | VD | Biết | Hiểu | VD ${hasEssay ? '| Biết | Hiểu | VD' : ''}

${!hasEssay ? 'KHÔNG CÓ tự luận => KHÔNG tạo cột Tự luận.' : 'CÓ tự luận => thêm cột Tự luận (colspan=3).'}

**NỘI DUNG BẢNG - MỖI BÀI HỌC CÓ 2 DÒNG (sub-row):**
- Dòng 1: Số lượng câu hỏi. Ô "Nội dung" ghi tên bài + (X tiết), dùng rowspan=2
- Dòng 2: Ô Biết/Hiểu ghi "TD", ô VD ghi "GQVĐ". Nếu 0 câu thì để trống.
- Merge cells STT & Chương: nếu 1 chương có nhiều bài => rowspan = (số bài × 2)

**FOOTER 3 DÒNG:**
1. Tổng số câu theo từng cột + tổng cuối
2. Tổng số điểm theo từng cột + tổng = 10
3. Tỉ lệ % điểm: cuối = 100%

**QUY TẮC ĐIỂM:**
- Mọi điểm phải là bội số của 0.25
- Tổng điểm = 10
- Phân bổ câu hỏi theo tỷ lệ số tiết
- **QUAN TRỌNG - Cách tính điểm Đúng/Sai (Dạng II):** Mỗi câu Đúng/Sai có 4 mệnh đề (a, b, c, d). Mỗi mệnh đề đúng được 0.25 điểm → 1 câu Đúng/Sai = 1.0 điểm. Khi tính điểm trong bảng, 1 câu Đúng/Sai = 1.0 điểm (KHÔNG phải 0.25 điểm/câu).
- Dạng I (1 lựa chọn): tính điểm = tổng điểm trắc nghiệm / tổng số câu Dạng I
- Dạng III (Trả lời ngắn): tính điểm tương tự Dạng I

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
      setExamHtml(cleanHtml);
      setCurrentStep(4);
    } catch (error: any) {
      Swal.fire({
        title: 'Lá»—i táº¡o Ä‘á» thi',
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

  // â”€â”€â”€ Step 1: ThÃ´ng tin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderStep1 = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Card 1: ThÃ´ng tin chung & Upload PPCT */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">1</span>
          <h2 className="text-lg font-semibold text-primary">ThÃ´ng tin chung & Upload PPCT</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          {/* MÃ´n há»c */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">MÃ´n há»c</label>
            <select
              value={monHoc}
              onChange={(e) => setMonHoc(e.target.value)}
              className="input-field"
            >
              <option value="">-- Chá»n mÃ´n há»c --</option>
              {MON_HOC_LIST.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Khá»‘i lá»›p */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Khá»‘i lá»›p</label>
            <select
              value={khoiLop}
              onChange={(e) => setKhoiLop(e.target.value)}
              className="input-field"
            >
              <option value="">-- Chá»n khá»‘i lá»›p --</option>
              {KHOI_LOP_LIST.map(k => <option key={k} value={k}>Khá»‘i {k}</option>)}
            </select>
          </div>

          {/* Loáº¡i kiá»ƒm tra */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Loáº¡i kiá»ƒm tra (Auto Filter)</label>
            <select
              value={loaiKiemTra}
              onChange={(e) => setLoaiKiemTra(e.target.value)}
              className="input-field"
            >
              {LOAI_KIEM_TRA.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Thá»i gian */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">Thá»i gian (phÃºt)</label>
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
                {isParsing && <span className="text-xs text-slate-400 shrink-0">Äang phÃ¢n tÃ­ch...</span>}
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
                XÃ³a
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

      {/* Card 2: Chá»n chá»§ Ä‘á» trá»ng tÃ¢m (after PPCT parsed) */}
      {chapters.length > 0 && (
        <div className="glass-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="section-number">2</span>
              <h2 className="text-lg font-semibold text-primary">Chá»n chá»§ Ä‘á» trá»ng tÃ¢m</h2>
            </div>
            <button
              onClick={() => autoSelectByExamType(loaiKiemTra, chapters)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-slate-400 hover:text-primary transition-colors"
            >
              <Filter size={12} />
              Lá»c theo ká»³
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
                      {chapter.totalPeriods} tiáº¿t
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
                            <span className="text-xs text-primary">{lesson.periods} tiáº¿t</span>
                            {lesson.weekEnd && (
                              <span className="text-xs text-slate-500">Tuáº§n {lesson.weekStart}-{lesson.weekEnd}</span>
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
            ÄÃ£ chá»n: <strong className="ml-1">{selectedLessons.size}</strong>&nbsp;bÃ i há»c
          </div>
        </div>
      )}

      {/* Card 3: Cáº¥u trÃºc Ä‘á» thi */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="section-number">3</span>
          <h2 className="text-lg font-semibold text-primary">Cáº¥u trÃºc Ä‘á» thi (Sá»‘ lÆ°á»£ng cÃ¢u há»i)</h2>
        </div>

        <div className="space-y-5">
          {examStructure.map((row, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="sm:w-52 shrink-0">
                <span className="text-sm font-medium text-primary">{row.label}</span>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs text-primary mb-1.5">Biáº¿t</label>
                  <input type="number" value={row.biet} onFocus={(e) => e.target.select()} onChange={(e) => updateStructure(idx, 'biet', e.target.value === '' ? 0 : parseInt(e.target.value))} className="input-field text-center" min={0} />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">Hiá»ƒu</label>
                  <input type="number" value={row.hieu} onFocus={(e) => e.target.select()} onChange={(e) => updateStructure(idx, 'hieu', e.target.value === '' ? 0 : parseInt(e.target.value))} className="input-field text-center" min={0} />
                </div>
                <div>
                  <label className="block text-xs text-primary mb-1.5">Váº­n dá»¥ng</label>
                  <input type="number" value={row.vandung} onFocus={(e) => e.target.select()} onChange={(e) => updateStructure(idx, 'vandung', e.target.value === '' ? 0 : parseInt(e.target.value))} className="input-field text-center" min={0} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Button: Táº¡o Ma tráº­n */}
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
          Táº¡o Ma tráº­n Ä‘á» thi
        </button>
      </div>
    </motion.div>
  );

  // â”€â”€â”€ Step 2: Ma tráº­n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <h2 className="text-lg font-semibold text-primary">Ma tráº­n Ä‘á» thi</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleUploadMatrix} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors">
              <Upload size={13} /> Upload Matrix (.html/.doc)
            </button>
            <button onClick={() => downloadDoc(matrixHtml, `ma_tran_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`, true)} disabled={!matrixHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <FileText size={13} /> Táº£i Word (.doc)
            </button>
            <button onClick={() => downloadHtml(matrixHtml, `ma_tran_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!matrixHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <Download size={13} /> Táº£i HTML
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
              Tiáº¿p theo: Báº£ng Ä‘áº·c táº£
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
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trÆ°á»›c</span>
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
            <p>Ma tráº­n sáº½ Ä‘Æ°á»£c hiá»ƒn thá»‹ sau khi táº¡o tá»« bÆ°á»›c 1 hoáº·c upload file.</p>
          </div>
        )}
      </div>
    </motion.div>
  );

  // â”€â”€â”€ Step 3: Báº£ng Ä‘áº·c táº£ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <h2 className="text-lg font-semibold text-primary">Báº£ng Ä‘áº·c táº£</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => downloadDoc(specsHtml, `dac_ta_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`, true)} disabled={!specsHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <FileText size={13} /> Táº£i Word (.doc)
            </button>
            <button onClick={() => downloadHtml(specsHtml, `dac_ta_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!specsHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <Download size={13} /> Táº£i HTML
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
              Tiáº¿p theo: Äá» thi
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
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trÆ°á»›c</span>
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
            <p>Báº£ng Ä‘áº·c táº£ sáº½ Ä‘Æ°á»£c hiá»ƒn thá»‹ sau khi hoÃ n thÃ nh ma tráº­n.</p>
          </div>
        )}
      </div>
    </motion.div>
  );

  // â”€â”€â”€ Step 4: Äá» thi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <h2 className="text-lg font-semibold text-primary">Äá» thi hoÃ n chá»‰nh</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => downloadDoc(examHtml, `de_thi_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!examHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <FileText size={13} /> Táº£i Word (.doc)
            </button>
            <button onClick={() => downloadHtml(examHtml, `de_thi_${monHoc}_${loaiKiemTra.replace(/\s/g, '_')}`)} disabled={!examHtml} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-slate-400 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-30">
              <Download size={13} /> Táº£i HTML
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
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Xem trÆ°á»›c</span>
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
            <p>Äá» thi sáº½ Ä‘Æ°á»£c táº¡o sau khi hoÃ n thÃ nh báº£ng Ä‘áº·c táº£.</p>
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

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="min-h-screen flex flex-col">
      {/* â”€â”€ Header â”€â”€ */}
      <header className="sticky top-0 z-50 bg-bg/90 backdrop-blur-lg border-b border-border px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">AI</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight uppercase">
              Táº¡o Äá» Thi Theo CV 7991
            </h1>
          </div>

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-primary transition-colors"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">CÃ i Ä‘áº·t API Key</span>
          </button>
        </div>
      </header>

      {/* â”€â”€ Main â”€â”€ */}
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

      {/* â”€â”€ API Key Modal â”€â”€ */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 md:p-8 w-full max-w-lg"
          >
            <h3 className="text-lg font-semibold text-primary mb-6 flex items-center gap-2">
              <Settings size={20} /> CÃ i Ä‘áº·t API Key
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-field"
                  placeholder="Nháº­p API Key..."
                />
                <p className="mt-2 text-xs text-slate-500">
                  Láº¥y API Key táº¡i{' '}
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
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Má»›i nháº¥t)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (ThÃ´ng minh)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-5 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white transition-colors border border-border hover:border-border-light"
              >
                ÄÃ³ng
              </button>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="gradient-btn px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              >
                LÆ°u
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}







