import { GoogleGenAI } from "@google/genai";

// Helpers
const getApiKey = (): string => localStorage.getItem('gemini_api_key') || '';
const getModel = (): string => localStorage.getItem('gemini_model') || 'gemini-2.5-flash';

const createAI = (apiKey?: string) => {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('Vui long cau hinh API Key trong phan cai dat.');
  return new GoogleGenAI({ apiKey: key });
};

// Generic AI call
export async function callGeminiAI(prompt: string, apiKey: string, modelName?: string) {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.2, maxOutputTokens: 65536 },
    });
    return response.text || '';
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

// Parse PPCT file
export async function parsePPCTFile(
  file: File,
  fileBase64: string,
  subject: string,
  grade: string,
  apiKey: string,
  modelName?: string,
): Promise<any> {
  const ai = createAI(apiKey);
  const model = modelName || getModel();
  const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/plain';

  const subjectFilter = subject && grade
    ? `\nBAT BUOC: Chi trich xuat noi dung mon "${subject}" lop "${grade}". Bo qua mon/lop khac.`
    : '';

  const prompt = `Ban la chuyen gia phan tich chuong trinh giao duc Viet Nam.
Hay doc file dinh kem va trich xuat du lieu thanh JSON object (khong markdown).

Yeu cau JSON:
{
  "subject": "...",
  "grade": "...",
  "chapters": [
    {
      "id": "c1",
      "name": "Ten chuong",
      "totalPeriods": 0,
      "lessons": [
        {
          "id": "c1_l1",
          "name": "Ten bai hoc",
          "periods": 1,
          "weekStart": 1,
          "weekEnd": 1
        }
      ]
    }
  ]
}

Chi trich xuat, khong sang tao noi dung moi.${subjectFilter}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        { parts: [{ text: prompt }] },
        {
          parts: [{
            inlineData: {
              mimeType,
              data: fileBase64,
            },
          }],
        },
      ],
      config: { temperature: 0.1, maxOutputTokens: 65536 },
    });

    const text = response.text || '';
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    return JSON.parse(cleaned);
  } catch (error: any) {
    console.error('PPCT parsing error:', error);
    throw error;
  }
}

// Generate Matrix HTML
export async function generateMatrixHTML(
  subject: string,
  grade: string,
  examType: string,
  duration: number,
  selectedTopics: any[],
  questionConfig: any,
  apiKey: string,
  modelName?: string,
): Promise<string> {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  const hasEssay = questionConfig.essay.biet + questionConfig.essay.hieu + questionConfig.essay.vandung > 0;
  const totalPeriods = selectedTopics.reduce(
    (acc: number, ch: any) => acc + (ch.lessons || []).reduce((sum: number, l: any) => sum + (l.periods || 1), 0),
    0,
  );

  const prompt = `Hay tao **MA TRAN DE KIEM TRA** (HTML Table) cho mon **${subject}**, khoi **${grade}**.

CAU HINH:
- Loai de: ${examType}
- Thoi gian: ${duration} phut
- Tong so tiet trong tam: ${totalPeriods} tiet

CAU TRUC SO CAU:
- Dang I: Biet ${questionConfig.type1.biet}, Hieu ${questionConfig.type1.hieu}, VD ${questionConfig.type1.vandung}
- Dang II: Biet ${questionConfig.type2.biet}, Hieu ${questionConfig.type2.hieu}, VD ${questionConfig.type2.vandung}
- Dang III: Biet ${questionConfig.type3.biet}, Hieu ${questionConfig.type3.hieu}, VD ${questionConfig.type3.vandung}
- Tu luan: Biet ${questionConfig.essay.biet}, Hieu ${questionConfig.essay.hieu}, VD ${questionConfig.essay.vandung}

DINH DANG BAT BUOC:
- Header 4 dong merge cells
- Co/khong co cot Tu luan theo cau hinh
- Moi bai hoc co 2 dong sub-row (TD/GQVD)
- Footer 3 dong

DU LIEU DAU VAO:
${JSON.stringify(selectedTopics, null, 2)}

OUTPUT:
- Full HTML document
- Co CSS bang ro rang
- Khong markdown code block
- hasEssay = ${hasEssay}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { temperature: 0.2 },
    });
    return (response.text || '').replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
  } catch (error: any) {
    console.error('Matrix generation error:', error);
    throw error;
  }
}

export const PROMPTS = {
  PARSE_PPCT: () => '',
  GENERATE_MATRIX: (_subject: string, _ppct: string, _examType: string, _duration: number, _structure: string) => '',
};
