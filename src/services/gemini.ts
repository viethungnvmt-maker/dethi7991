import { GoogleGenAI } from "@google/genai";

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

export async function callGeminiAI(prompt: string, apiKey: string, modelName: string = 'gemini-2.0-flash') {
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

export const PROMPTS = {
  GENERATE_MATRIX: (subject: string, ppct: string) => `
    Dựa trên kế hoạch dạy học (PPCT) sau của môn ${subject}:
    ${ppct}
    
    Hãy đề xuất một ma trận đề kiểm tra định kỳ (Giữa kỳ hoặc Cuối kỳ) bao gồm các chủ đề chính, số tiết và phân bổ câu hỏi theo 4 mức độ: Biết, Hiểu, Vận dụng, Vận dụng cao.
    Trả về kết quả dưới dạng JSON có cấu trúc:
    {
      "matrix": [
        { "topic": "Tên chương/chủ đề", "periods": 5, "know": 2, "understand": 2, "apply": 1, "applyHigh": 0 }
      ]
    }
  `,
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
