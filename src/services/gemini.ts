import { GoogleGenAI } from "@google/genai";

// ─── Helpers ────────────────────────────────────────────────────────
const getApiKey = (): string => localStorage.getItem('gemini_api_key') || '';
const getModel = (): string => localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3-flash-preview'] as const;

const createAI = (apiKey?: string) => {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('Vui lòng cấu hình API Key trong phần cài đặt.');
  return new GoogleGenAI({ apiKey: key });
};

const tryParseJsonText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

const extractGeminiErrorDetails = (error: any) => {
  const rawMessage = typeof error?.message === 'string' ? error.message : '';
  const parsedMessage = rawMessage ? tryParseJsonText(rawMessage) : null;
  const nestedError = parsedMessage && typeof parsedMessage === 'object' && parsedMessage !== null && 'error' in parsedMessage
    ? (parsedMessage as { error?: Record<string, unknown> }).error
    : null;

  const code = Number(
    nestedError?.code
    ?? error?.status
    ?? error?.code
    ?? 0,
  );
  const status = String(
    nestedError?.status
    ?? error?.status
    ?? error?.code
    ?? '',
  );
  const message = String(
    nestedError?.message
    ?? rawMessage
    ?? 'Khong the ket noi den Gemini.',
  );

  return { code, status, message };
};

const isRetryableGeminiUnavailableError = (error: any) => {
  const { code, status, message } = extractGeminiErrorDetails(error);
  const normalized = message.toLowerCase();

  return (
    code === 503
    || status.toUpperCase() === 'UNAVAILABLE'
    || normalized.includes('high demand')
    || normalized.includes('try again later')
  );
};

const buildGeminiModelFallbackChain = (preferredModel: string) => {
  const normalizedPreferredModel = preferredModel?.trim() || getModel();
  const orderedModels = [normalizedPreferredModel, ...GEMINI_FALLBACK_MODELS];

  return orderedModels.filter((model, index) => orderedModels.indexOf(model) === index);
};

const generateContentWithModelFallback = async (
  ai: GoogleGenAI,
  preferredModel: string,
  request: any,
) => {
  const modelChain = buildGeminiModelFallbackChain(preferredModel);
  let lastError: any = null;

  for (let index = 0; index < modelChain.length; index += 1) {
    const currentModel = modelChain[index];

    try {
      return await ai.models.generateContent({
        model: currentModel,
        ...request,
      });
    } catch (error: any) {
      lastError = error;

      if (!isRetryableGeminiUnavailableError(error) || index === modelChain.length - 1) {
        throw error;
      }

      console.warn(`Gemini model ${currentModel} unavailable, retrying with fallback model.`);
    }
  }

  throw lastError;
};

export const toUserFacingGeminiErrorMessage = (error: any) => {
  const { code, status, message } = extractGeminiErrorDetails(error);
  const normalized = message.toLowerCase();

  if (
    code === 503
    || status.toUpperCase() === 'UNAVAILABLE'
    || normalized.includes('high demand')
    || normalized.includes('try again later')
  ) {
    return 'Model AI dang qua tai tam thoi. Vui long thu lai sau it phut hoac doi sang Gemini 3 Flash trong phan Cai dat API Key.';
  }

  if (
    code === 429
    || status.toUpperCase() === 'RESOURCE_EXHAUSTED'
    || normalized.includes('quota')
    || normalized.includes('rate limit')
  ) {
    return 'API Key dang cham gioi han tam thoi. Vui long cho mot luc roi thu lai.';
  }

  if (
    code === 401
    || status.toUpperCase() === 'UNAUTHENTICATED'
    || normalized.includes('api key not valid')
    || normalized.includes('invalid api key')
  ) {
    return 'API Key khong hop le hoac da het hieu luc. Vui long kiem tra lai trong phan Cai dat API Key.';
  }

  return message || 'Khong the ket noi den Gemini o lan nay. Vui long thu lai.';
};

type GeminiCallOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
};

// ─── Generic AI call ────────────────────────────────────────────────
export async function callGeminiAI(
  prompt: string,
  apiKey: string,
  modelName?: string,
  options: GeminiCallOptions = {},
) {
  const ai = createAI(apiKey);
  const model = modelName || getModel();
  const { temperature = 0.2, maxOutputTokens = 32768, responseMimeType, responseSchema } = options;

  try {
    const response = await generateContentWithModelFallback(ai, model, {
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature,
        maxOutputTokens,
        ...(responseMimeType ? { responseMimeType } : {}),
        ...(responseSchema ? { responseSchema } : {}),
      }
    });
    return response.text || '';
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw new Error(toUserFacingGeminiErrorMessage(error));
  }
}

// ─── Parse PPCT file ────────────────────────────────────────────────
export async function parsePPCTFile(
  file: File,
  fileBase64: string,
  subject: string,
  grade: string,
  apiKey: string,
  modelName?: string
): Promise<any> {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  // Reference site uses text/plain for docx, application/pdf for pdf
  const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/plain';

  let subjectFilter = '';
  if (subject && grade) {
    subjectFilter = `
**ĐẶC BIỆT LƯU Ý MÔN VÀ LỚP BẮT BUỘC:**
- Người dùng ĐÃ CHỌN TRƯỚC: Môn học là "${subject}" và Khối lớp là "${grade}".
- TUYỆT ĐỐI CHỈ trích xuất nội dung của môn "${subject}" lớp "${grade}".
- NẾU file có chứa nhiều môn khác hay khối lớp khác, HÃY BỎ QUA chúng.
`;
  }

  const prompt = `Bạn là chuyên gia phân tích chương trình giáo dục Việt Nam.
Hãy đọc file đính kèm (Kế hoạch dạy học/PPCT) và trích xuất dữ liệu cấu trúc cực kỳ chi tiết.

**===== NGUYÊN TẮC VÀNG: CHỈ TRÍCH XUẤT, KHÔNG SÁNG TẠO =====**
1. TUYỆT ĐỐI CHỈ trích xuất nội dung CÓ SẴN trong file đính kèm. KHÔNG ĐƯỢC tự bịa đặt.
2. Tên môn học, tên chương, tên bài học PHẢI lấy NGUYÊN VĂN từ file gốc.
3. Nếu không đọc được rõ một phần nào đó trong file, hãy ghi "Không đọc được".
${subjectFilter}
**NGÔN NGỮ BẮT BUỘC: TIẾNG VIỆT**

Yêu cầu đầu ra: JSON Object (không markdown) với cấu trúc sau:
{
  "subject": "Tên môn học chính xác như trong file",
  "grade": "Khối lớp chính xác như trong file",
  "chapters": [
    {
      "id": "c1",
      "name": "Tên chương CHÍNH XÁC từ file gốc",
      "totalPeriods": 10,
      "lessons": [
        {
          "id": "c1_l1",
          "name": "Tên bài học CHÍNH XÁC từ file gốc",
          "periods": 2,
          "weekStart": 1,
          "weekEnd": 1
        }
      ]
    }
  ]
}

Lưu ý quan trọng:
1. Hãy cố gắng nhận diện số tiết và tuần học của từng bài. Nếu không ghi rõ, hãy ước lượng.
2. Nếu tài liệu là PDF dạng ảnh, hãy dùng khả năng Vision để đọc kỹ bảng biểu.
3. Xác định chính xác môn học từ NỘI DUNG THỰC TẾ trong file.
4. Toàn bộ giá trị JSON phải bằng TIẾNG VIỆT, trích xuất nguyên văn từ file.`;

  console.log('🔄 Parsing PPCT file, model:', model, 'mimeType:', mimeType);

  try {
    const response = await generateContentWithModelFallback(ai, model, {
      contents: {
        parts: [
          { inlineData: { mimeType, data: fileBase64 } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text || '{}';
    console.log('✅ PPCT parse response length:', text.length);
    console.log('📋 PPCT parse preview:', text.substring(0, 500));

    try {
      return JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '');
      return JSON.parse(cleaned);
    }
  } catch (error: any) {
    console.error('❌ PPCT parse error:', error);
    throw new Error(toUserFacingGeminiErrorMessage(error));
  }
}

// ─── Generate Matrix HTML ───────────────────────────────────────────
export async function generateMatrixHTML(
  subject: string,
  grade: string,
  examType: string,
  duration: number,
  selectedTopics: any[],
  questionConfig: any,
  apiKey: string,
  modelName?: string
): Promise<string> {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  const hasEssay =
    questionConfig.essay.biet +
    questionConfig.essay.hieu +
    questionConfig.essay.vandung +
    (questionConfig.essay.vandungcao || 0) > 0;

  const prompt = `Hãy tạo MA TRẬN ĐỀ KIỂM TRA (HTML Table) cho môn ${subject}, khối ${grade}.
Loại đề: ${examType}, Thời gian: ${duration} phút.

CẤU TRÚC SỐ LƯỢNG CÂU HỎI:
- 1 lựa chọn (Dạng I): Biết ${questionConfig.type1.biet}, Hiểu ${questionConfig.type1.hieu}, VD ${questionConfig.type1.vandung}, VDC ${questionConfig.type1.vandungcao || 0}
- Đúng - Sai (Dạng II): Biết ${questionConfig.type2.biet}, Hiểu ${questionConfig.type2.hieu}, VD ${questionConfig.type2.vandung}, VDC ${questionConfig.type2.vandungcao || 0}  
- Trả lời ngắn (Dạng III): Biết ${questionConfig.type3.biet}, Hiểu ${questionConfig.type3.hieu}, VD ${questionConfig.type3.vandung}, VDC ${questionConfig.type3.vandungcao || 0}
- Tự luận: Biết ${questionConfig.essay.biet}, Hiểu ${questionConfig.essay.hieu}, VD ${questionConfig.essay.vandung}, VDC ${questionConfig.essay.vandungcao || 0}

DỮ LIỆU ĐẦU VÀO:
${JSON.stringify(selectedTopics, null, 2)}

YÊU CẦU OUTPUT:
1. Xuất Full HTML Document (<!DOCTYPE html>...).
2. Tiêu đề: "MA TRẬN ĐỀ KIỂM TRA ${examType.toUpperCase()} – ${subject.toUpperCase()} ${grade.toUpperCase()}"
3. Dưới tiêu đề: "NĂM HỌC 20... - 20..."
4. Bảng có header 4 tầng merge cells.
5. Phân bổ câu hỏi theo tỷ lệ số tiết.
${!hasEssay ? '6. KHÔNG CÓ tự luận => KHÔNG tạo cột Tự luận.' : ''}

Style CSS:
body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.3; margin: 20px; }
h2 { text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
th, td { border: 1px solid black; padding: 4px 6px; text-align: center; vertical-align: middle; }
th { font-weight: bold; }`;

  try {
    const response = await generateContentWithModelFallback(ai, model, {
      contents: prompt,
      config: { temperature: 0.2 }
    });
    return (response.text || '').replace(/```html/g, '').replace(/```/g, '');
  } catch (error: any) {
    console.error('Matrix generation error:', error);
    throw new Error(toUserFacingGeminiErrorMessage(error));
  }
}

export async function generateSimilarExam(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  modelName?: string
): Promise<string> {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  const prompt = `Bạn là chuyên gia giáo dục. Hãy đọc đề thi được đính kèm ở document này.
Sau đó, hãy soạn thảo một đề thi MỚI HOÀN TOÀN nhưng có CẤU TRÚC, ĐỘ KHÓ, VÀ ĐỊNH DẠNG Y HỆT như đề mẫu.
NỘI DUNG YÊU CẦU:
1. Số lượng câu hỏi giống hệt.
2. Các phần (trắc nghiệm, tự luận, đúng/sai, trả lời ngắn) giống hệt.
3. Thay đổi nội dung câu hỏi, dữ liệu, nhưng giữ nguyên mức độ nhận thức (biết, hiểu, vận dụng, vận dụng cao).
4. Cung cấp ĐÁP ÁN ở cuối đề.
YÊU CẦU ĐẦU RA:
- Trả về ĐỊNH DẠNG HTML (sử dụng h2, h3, p, table nếu cần thiết). Chỉ trả về mã HTML sạch, không cần markdown block html.`;

  try {
    const response = await generateContentWithModelFallback(ai, model, {
      contents: {
        parts: [
          { inlineData: { mimeType, data: fileBase64 } },
          { text: prompt }
        ]
      },
      config: { temperature: 0.7 }
    });
    return (response.text || '').replace(/```html/g, '').replace(/```/g, '');
  } catch (error: any) {
    console.error('Similar Exam generation error:', error);
    throw new Error(toUserFacingGeminiErrorMessage(error));
  }
}

export async function generateExamVariants(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  modelName?: string
): Promise<any> {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  const prompt = `Bạn là chuyên gia giáo dục. Hãy đọc đề thi gốc được đính kèm.
Tạo ra 3 ĐỀ THI BIẾN THỂ (Variant 1, Variant 2, Variant 3) từ đề gốc này.
YÊU CẦU ĐỀ BIẾN THỂ:
1. Tạo 3 mã đề HOÀN TOÀN ĐỘC LẬP (nội dung mới) dựa trên cấu trúc đề gốc (độ khó, format câu hỏi y hệt).
2. Có kèm đáp án riêng cho từng mã đề ở cuối cùng.
YÊU CẦU ĐẦU RA:
- Trả về dạng JSON với cấu trúc:
{
  "variants": [
    { "title": "Đề 1", "content": "Mã HTML của đề 1 (không bao gồm thẻ html...)" },
    { "title": "Đề 2", "content": "Mã HTML của đề 2" },
    { "title": "Đề 3", "content": "Mã HTML của đề 3" }
  ]
}`;

  try {
    const response = await generateContentWithModelFallback(ai, model, {
      contents: {
        parts: [
          { inlineData: { mimeType, data: fileBase64 } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: 'application/json', temperature: 0.8 }
    });
    const text = response.text || '{}';
    try {
      return JSON.parse(text.replace(/```json/g, '').replace(/```/g, ''));
    } catch {
      return JSON.parse(text);
    }
  } catch (error: any) {
    console.error('Variants Exam generation error:', error);
    throw new Error(toUserFacingGeminiErrorMessage(error));
  }
}

export const PROMPTS = {
  PARSE_PPCT: () => '', // Now handled by parsePPCTFile function
  GENERATE_MATRIX: (subject: string, ppct: string, examType: string, duration: number, structure: string) => '',
};
