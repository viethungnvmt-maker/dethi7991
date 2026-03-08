import { GoogleGenAI } from "@google/genai";

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

export async function callGeminiAI(prompt: string, apiKey: string, modelName: string = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error('Vui lòng cấu hình API Key trong phần cài đặt.');
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      }
    });

    return response.text || '';
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

export async function callGeminiWithFile(
  prompt: string,
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  modelName: string = 'gemini-2.5-flash'
) {
  if (!apiKey) {
    throw new Error('Vui lòng cấu hình API Key trong phần cài đặt.');
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { data: fileBase64, mimeType } }
        ]
      }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      }
    });

    return response.text || '';
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

export const PROMPTS = {
  PARSE_PPCT: () => `Hãy phân tích file PPCT (Phân phối chương trình / Kế hoạch dạy học) này.
Trích xuất danh sách các bài học/chủ đề, số tiết cho mỗi bài, và phân theo học kỳ.

Trả về KẾT QUẢ CHÍNH XÁC dưới dạng JSON (KHÔNG có markdown, KHÔNG có code block):
{
  "semesters": [
    {
      "name": "Học kỳ 1",
      "lessons": [
        { "name": "Bài 1: Tên bài học", "periods": 2, "week": "Tuần 1-2" },
        { "name": "ÔN TẬP GIỮA HỌC KỲ 1", "periods": 1, "week": "Tuần 8" }
      ]
    },
    {
      "name": "Học kỳ 2",
      "lessons": [
        { "name": "Bài 9: Tên bài học", "periods": 1, "week": "Tuần 19" }
      ]
    }
  ]
}

Lưu ý:
- Giữ nguyên tên bài học gốc trong file
- Bao gồm cả các bài Ôn tập, Kiểm tra nếu có
- "periods" là tổng số tiết dạy của bài đó
- "week" là tuần dạy (ví dụ: "Tuần 1-2" hoặc "Tuần 5")
- CHỈ trả về JSON thuần, không có text nào khác`,

  GENERATE_MATRIX: (subject: string, ppct: string, examType: string, duration: number, structure: string) => `
Hãy tạo MA TRẬN ĐỀ KIỂM TRA cho môn ${subject}.
Loại kiểm tra: ${examType}, Thời gian: ${duration} phút.

Thông tin PPCT (các bài đã chọn):
${ppct}

Cấu trúc đề thi:
${structure}

Trả về một file HTML HOÀN CHỈNH (bao gồm <!DOCTYPE html>, <html>, <head>, <body>) chứa bảng ma trận đề kiểm tra theo CV 7991.

Yêu cầu:
1. Tiêu đề: "MA TRẬN ĐỀ KIỂM TRA ${examType.toUpperCase()} – ${subject.toUpperCase()} ${('KHỐI ...')}"
2. Dưới tiêu đề: "NĂM HỌC 20... - 20..."
3. Bảng có các cột: TT, Chương/Chủ đề, Nội dung/Đơn vị kiến thức, Mức độ đánh giá (TNKQ: Biết/Hiểu/VD và TL: Biết/Hiểu/VD), Tổng số câu, Tỉ lệ % điểm
4. Mỗi chủ đề có rowspan phù hợp với số bài
5. Hàng cuối: Tổng số câu, Tổng số điểm, Tỉ lệ % điểm
6. Ghi chú bên dưới bảng
7. Style CSS inline trong <style> tag: font Times New Roman, border collapse, padding 4px 6px

CHỈ trả về HTML thuần, KHÔNG có markdown code block, KHÔNG có giải thích.`,
  GENERATE_QUESTIONS: (subject: string, topic: string, level: string, count: number) => `
    Hãy soạn ${count} câu hỏi trắc nghiệm cho môn ${subject}, chủ đề "${topic}" ở mức độ "${level}".
    Yêu cầu:
    - Nội dung bám sát chương trình giáo dục phổ thông.
    - Mỗi câu hỏi có 4 phương án A, B, C, D.
    - Có đáp án đúng và lời giải chi tiết.
    - Trả về định dạng JSON:
    {
      "questions": [
        {
          "content": "Câu hỏi...",
          "options": ["A...", "B...", "C...", "D..."],
          "correctAnswer": "A",
          "explanation": "Giải thích...",
          "level": "${level}"
        }
      ]
    }
  `
};
