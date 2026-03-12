import { GoogleGenAI } from "@google/genai";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getApiKey = (): string => localStorage.getItem('gemini_api_key') || '';
const getModel = (): string => localStorage.getItem('gemini_model') || 'gemini-2.5-flash';

const createAI = (apiKey?: string) => {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('Vui lÃ²ng cáº¥u hÃ¬nh API Key trong pháº§n cÃ i Ä‘áº·t.');
  return new GoogleGenAI({ apiKey: key });
};

// â”€â”€â”€ Generic AI call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function callGeminiAI(prompt: string, apiKey: string, modelName?: string) {
  const ai = createAI(apiKey);
  const model = modelName || getModel();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.2, maxOutputTokens: 65536 }
    });
    return response.text || '';
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

// â”€â”€â”€ Parse PPCT file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
**Äáº¶C BIá»†T LÆ¯U Ã MÃ”N VÃ€ Lá»šP Báº®T BUá»˜C:**
- NgÆ°á»i dÃ¹ng ÄÃƒ CHá»ŒN TRÆ¯á»šC: MÃ´n há»c lÃ  "${subject}" vÃ  Khá»‘i lá»›p lÃ  "${grade}".
- TUYá»†T Äá»I CHá»ˆ trÃ­ch xuáº¥t ná»™i dung cá»§a mÃ´n "${subject}" lá»›p "${grade}".
- Náº¾U file cÃ³ chá»©a nhiá»u mÃ´n khÃ¡c hay khá»‘i lá»›p khÃ¡c, HÃƒY Bá»Ž QUA chÃºng.
`;
  }

  const prompt = `Báº¡n lÃ  chuyÃªn gia phÃ¢n tÃ­ch chÆ°Æ¡ng trÃ¬nh giÃ¡o dá»¥c Viá»‡t Nam.
HÃ£y Ä‘á»c file Ä‘Ã­nh kÃ¨m (Káº¿ hoáº¡ch dáº¡y há»c/PPCT) vÃ  trÃ­ch xuáº¥t dá»¯ liá»‡u cáº¥u trÃºc cá»±c ká»³ chi tiáº¿t.

**===== NGUYÃŠN Táº®C VÃ€NG: CHá»ˆ TRÃCH XUáº¤T, KHÃ”NG SÃNG Táº O =====**
1. TUYá»†T Äá»I CHá»ˆ trÃ­ch xuáº¥t ná»™i dung CÃ“ Sáº´N trong file Ä‘Ã­nh kÃ¨m. KHÃ”NG ÄÆ¯á»¢C tá»± bá»‹a Ä‘áº·t.
2. TÃªn mÃ´n há»c, tÃªn chÆ°Æ¡ng, tÃªn bÃ i há»c PHáº¢I láº¥y NGUYÃŠN VÄ‚N tá»« file gá»‘c.
3. Náº¿u khÃ´ng Ä‘á»c Ä‘Æ°á»£c rÃµ má»™t pháº§n nÃ o Ä‘Ã³ trong file, hÃ£y ghi "KhÃ´ng Ä‘á»c Ä‘Æ°á»£c".
${subjectFilter}
**NGÃ”N NGá»® Báº®T BUá»˜C: TIáº¾NG VIá»†T**

YÃªu cáº§u Ä‘áº§u ra: JSON Object (khÃ´ng markdown) vá»›i cáº¥u trÃºc sau:
{
  "subject": "TÃªn mÃ´n há»c chÃ­nh xÃ¡c nhÆ° trong file",
  "grade": "Khá»‘i lá»›p chÃ­nh xÃ¡c nhÆ° trong file",
  "chapters": [
    {
      "id": "c1",
      "name": "TÃªn chÆ°Æ¡ng CHÃNH XÃC tá»« file gá»‘c",
      "totalPeriods": 10,
      "lessons": [
        {
          "id": "c1_l1",
          "name": "TÃªn bÃ i há»c CHÃNH XÃC tá»« file gá»‘c",
          "periods": 2,
          "weekStart": 1,
          "weekEnd": 1
        }
      ]
    }
  ]
}

LÆ°u Ã½ quan trá»ng:
1. HÃ£y cá»‘ gáº¯ng nháº­n diá»‡n sá»‘ tiáº¿t vÃ  tuáº§n há»c cá»§a tá»«ng bÃ i. Náº¿u khÃ´ng ghi rÃµ, hÃ£y Æ°á»›c lÆ°á»£ng.
2. Náº¿u tÃ i liá»‡u lÃ  PDF dáº¡ng áº£nh, hÃ£y dÃ¹ng kháº£ nÄƒng Vision Ä‘á»ƒ Ä‘á»c ká»¹ báº£ng biá»ƒu.
3. XÃ¡c Ä‘á»‹nh chÃ­nh xÃ¡c mÃ´n há»c tá»« Ná»˜I DUNG THá»°C Táº¾ trong file.
4. ToÃ n bá»™ giÃ¡ trá»‹ JSON pháº£i báº±ng TIáº¾NG VIá»†T, trÃ­ch xuáº¥t nguyÃªn vÄƒn tá»« file.`;

  console.log('ðŸ”„ Parsing PPCT file, model:', model, 'mimeType:', mimeType);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: fileBase64 } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text || '{}';
    console.log('âœ… PPCT parse response length:', text.length);
    console.log('ðŸ“‹ PPCT parse preview:', text.substring(0, 500));

    try {
      return JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '');
      return JSON.parse(cleaned);
    }
  } catch (error: any) {
    console.error('âŒ PPCT parse error:', error);
    throw error;
  }
}

// â”€â”€â”€ Generate Matrix HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  const hasEssay = questionConfig.essay.biet + questionConfig.essay.hieu + questionConfig.essay.vandung > 0;
  const totalPeriods = selectedTopics.reduce(
    (acc: number, ch: any) => acc + (ch.lessons || []).reduce((sum: number, l: any) => sum + (l.periods || 1), 0),
    0,
  );

  const prompt = `Hãy tạo **MA TRẬN ĐỀ KIỂM TRA** (HTML Table) cho môn **${subject}**, khối **${grade}**.

**CẤU HÌNH ĐỀ THI:**
- Loại đề: ${examType}
- Thời gian: ${duration} phút
- Tổng số tiết trọng tâm: ${totalPeriods} tiết

**CẤU TRÚC SỐ LƯỢNG CÂU HỎI (Bắt buộc tuân thủ):**
- 1 lựa chọn (Dạng I): Biết ${questionConfig.type1.biet}, Hiểu ${questionConfig.type1.hieu}, VD ${questionConfig.type1.vandung}
- Đúng - Sai (Dạng II): Biết ${questionConfig.type2.biet}, Hiểu ${questionConfig.type2.hieu}, VD ${questionConfig.type2.vandung}
- Trả lời ngắn (Dạng III): Biết ${questionConfig.type3.biet}, Hiểu ${questionConfig.type3.hieu}, VD ${questionConfig.type3.vandung}
- Tự luận: Biết ${questionConfig.essay.biet}, Hiểu ${questionConfig.essay.hieu}, VD ${questionConfig.essay.vandung}

**===== ĐỊNH DẠNG BẢNG BẮT BUỘC =====**
Tiêu đề bảng (in đậm, căn giữa): **MA TRẬN ĐỀ KIỂM TRA ${examType.toUpperCase()} - ${subject.toUpperCase()} ${grade}**
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
- **QUAN TRỌNG - Cách tính điểm Đúng/Sai (Dạng II):** Mỗi câu Đúng/Sai có 4 mệnh đề (a, b, c, d). Mỗi mệnh đề đúng được 0.25 điểm -> 1 câu Đúng/Sai = 1.0 điểm. Khi tính điểm trong bảng, 1 câu Đúng/Sai = 1.0 điểm (KHÔNG phải 0.25 điểm/câu).
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

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { temperature: 0.2 }
    });
    return (response.text || '').replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
  } catch (error: any) {
    console.error('Matrix generation error:', error);
    throw error;
  }
}

export const PROMPTS = {
  PARSE_PPCT: () => '', // Now handled by parsePPCTFile function
  GENERATE_MATRIX: (subject: string, ppct: string, examType: string, duration: number, structure: string) => '',
};

