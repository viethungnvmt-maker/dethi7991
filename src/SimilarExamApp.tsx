import React, { useState } from 'react';
import { Upload, ArrowLeft, Loader2, Download, Check, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import Swal from 'sweetalert2';
import { generateSimilarExam } from './services/gemini';

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

interface Props {
  onGoHome: () => void;
}

export default function SimilarExamApp({ onGoHome }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [examHtml, setExamHtml] = useState('');

  const handleGenerate = async () => {
    if (!file) {
      Swal.fire({
        title: 'Chưa có file',
        text: 'Vui lòng tải lên tài liệu đề thi mẫu.',
        icon: 'warning',
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
      const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/plain'; // Approximation for Gemini vision support, pdf or image
      const finalMime = file.type.startsWith('image/') ? file.type : mimeType;
      
      const html = await generateSimilarExam(base64, finalMime, apiKey, model);
      setExamHtml(html);
      
      Swal.fire({
        title: 'Thành công!',
        text: `Đề thi tương tự đã được tạo xong.`,
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
body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.3; }
p { margin: 0; padding: 0; }
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
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="sticky top-0 z-50 bg-bg/90 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={onGoHome} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-500 font-bold text-sm">
              AI
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 uppercase">Tạo Đề Tương Tự</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {!examHtml ? (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <Upload size={20} className="text-blue-500" />
                Tải lên Đề thi Mẫu
              </h2>
              <div
                className="relative border-2 border-dashed border-border hover:border-blue-500/50 rounded-xl p-8 transition-colors flex flex-col items-center justify-center gap-3 bg-bg/50"
              >
                <input
                  type="file"
                  accept=".pdf, .docx, image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  {file ? <Check size={24} /> : <Upload size={24} />}
                </div>
                <div className="text-center">
                  <p className="font-medium text-slate-200">
                    {file ? file.name : "Nhấn để chọn file"}
                  </p>
                  {!file && <p className="text-sm text-slate-400 mt-1">Hỗ trợ PDF, DOCX, Ảnh</p>}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!file || isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  AI đang phân tích và tạo đề...
                </>
              ) : (
                <>Sinh Đề Tương Tự Mới <ArrowLeft className="rotate-180" size={20} /></>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl font-bold text-slate-100">Kết Quả Đề Thi</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setExamHtml('')}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-slate-300 hover:bg-white/5"
                >
                  Làm Lại
                </button>
                <button
                  onClick={handleDownloadWord}
                  className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2"
                >
                  <Download size={18} />
                  Tải Xuống Word
                </button>
              </div>
            </div>

            <div className="glass-card p-6 bg-white overflow-auto max-h-[70vh]">
              <div className="exam-content text-slate-900" dangerouslySetInnerHTML={{ __html: examHtml }} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
