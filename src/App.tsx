/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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

const APP_BUILD_NAME = import.meta.env.VITE_BUILD_NAME || '2026.04.02-r20';

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

const createEmptyLevelCountMap = (): LevelCountMap => ({
  biet: 0,
  hieu: 0,
  vandung: 0,
  vandungcao: 0,
});

const sumLevelCountMap = (value: LevelCountMap) =>
  STRUCTURE_LEVELS.reduce((sum, level) => sum + value[level.key], 0);

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

const MAX_PROMPT_HTML_TEXT_LENGTH = 12_000;
const MAX_IMPORTED_WORKING_TEXT_LENGTH = 16_000;

const compactHtmlForPrompt = (html: string) =>
  sanitizePreviewText(htmlToPlainText(html))
    .slice(0, MAX_PROMPT_HTML_TEXT_LENGTH)
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

const htmlToPlainText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|main|header|footer|aside|table|thead|tbody|tfoot|tr|ul|ol|li|h1|h2|h3|h4|h5|h6|pre)>/gi, '\n')
    .replace(/<(?:td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const countQuestionsInGeneratedExam = (html: string) =>
  Array.from(extractQuestionBlocksFromHtml(html).keys()).filter((questionNumber) => questionNumber > 0).length;

const normalizeAsciiText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const DEFAULT_EXAM_GENERATION_ERROR_MESSAGE = 'AI chưa tạo đủ đề theo đúng cấu trúc yêu cầu. Vui lòng bấm tạo lại.';

const toUserFacingExamGenerationErrorMessage = (message: string) => {
  const normalized = normalizeAsciiText(message);

  if (!normalized) {
    return DEFAULT_EXAM_GENERATION_ERROR_MESSAGE;
  }

  if (
    normalized.includes('json hop le')
    || normalized.includes('html hop le')
    || normalized.includes('structured exam')
    || normalized.includes('single-pass exam generation failed')
  ) {
    return DEFAULT_EXAM_GENERATION_ERROR_MESSAGE;
  }

  return message;
};

const normalizeAnswerCellValue = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatQuestionNumberList = (numbers: number[], maxItems: number = 10) => {
  if (numbers.length === 0) return '';

  const displayed = numbers.slice(0, maxItems).join(', ');
  return numbers.length > maxItems ? `${displayed}...` : displayed;
};

const isQuestionHeaderText = (value: string) => {
  const normalized = normalizeAsciiText(value);
  return normalized === 'cau' || normalized.startsWith('cau ');
};

const isAnswerHeaderText = (value: string) => {
  const normalized = normalizeAsciiText(value);
  return normalized === 'dap an' || normalized.startsWith('dap an ');
};

const extractAnswerEntriesFromHtml = (html: string) => {
  const answerEntries = new Map<number, string>();

  if (!html || typeof DOMParser === 'undefined') {
    return answerEntries;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));

  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll('tr'));

    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
      const questionCells = Array.from(rows[rowIndex].querySelectorAll('th,td')).map((cell) =>
        normalizeAnswerCellValue(cell.textContent || ''),
      );
      const answerCells = Array.from(rows[rowIndex + 1].querySelectorAll('th,td')).map((cell) =>
        normalizeAnswerCellValue(cell.textContent || ''),
      );

      if (questionCells.length < 2 || answerCells.length < 2) continue;
      if (!isQuestionHeaderText(questionCells[0]) || !isAnswerHeaderText(answerCells[0])) continue;

      const pairCount = Math.min(questionCells.length, answerCells.length);
      for (let cellIndex = 1; cellIndex < pairCount; cellIndex += 1) {
        const questionMatch = questionCells[cellIndex].match(/\d+/);
        if (!questionMatch) continue;

        const questionNumber = Number(questionMatch[0]);
        if (!Number.isFinite(questionNumber) || questionNumber <= 0) continue;

        const answerValue = answerCells[cellIndex] || '';
        if (!answerEntries.has(questionNumber) || !normalizeAnswerCellValue(answerEntries.get(questionNumber) || '')) {
          answerEntries.set(questionNumber, answerValue);
        }
      }
    }
  });

  return answerEntries;
};

const isValidMultipleChoiceAnswer = (value: string) =>
  /^[ABCD](?:[.)])?$/i.test(normalizeAnswerCellValue(value));

const isValidTrueFalseAnswer = (value: string) => {
  const tokens = normalizeAsciiText(value)
    .replace(/[()]/g, ' ')
    .replace(/[,:;|/\\-]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (token === 'd' || token === 'dung') return 'd';
      if (token === 's' || token === 'sai') return 's';
      return token;
    })
    .filter((token) => token === 'd' || token === 's');

  return tokens.length >= 4;
};

type QuestionRange = ReturnType<typeof buildExamQuestionRanges>[number];

interface AnswerKeyValidationResult {
  isComplete: boolean;
  missingQuestions: number[];
  invalidQuestions: number[];
  summary: string;
}

const getAnswerValidatorForQuestion = (
  questionNumber: number,
  ranges: QuestionRange[],
) => {
  const validators = [
    isValidMultipleChoiceAnswer,
    isValidTrueFalseAnswer,
    (value: string) => normalizeAnswerCellValue(value).length > 0,
    (value: string) => normalizeAnswerCellValue(value).length > 0,
  ];

  for (let index = 0; index < Math.min(ranges.length, validators.length); index += 1) {
    const range = ranges[index];
    if (range.total > 0 && questionNumber >= range.start && questionNumber <= range.end) {
      return validators[index];
    }
  }

  return null;
};

const validateAnswerKeyCoverage = (
  html: string,
  totalQuestions: number,
  questionRanges: QuestionRange[],
): AnswerKeyValidationResult => {
  const answerEntries = extractAnswerEntriesFromHtml(html);
  const missingQuestions: number[] = [];
  const invalidQuestions: number[] = [];

  for (let questionNumber = 1; questionNumber <= totalQuestions; questionNumber += 1) {
    const answerValue = normalizeAnswerCellValue(answerEntries.get(questionNumber) || '');

    if (!answerValue) {
      missingQuestions.push(questionNumber);
      continue;
    }

    const validator = getAnswerValidatorForQuestion(questionNumber, questionRanges);
    if (validator && !validator(answerValue)) {
      invalidQuestions.push(questionNumber);
    }
  }

  const summaryParts: string[] = [];
  if (missingQuestions.length > 0) {
    summaryParts.push(`thiếu đáp án ở câu ${formatQuestionNumberList(missingQuestions)}`);
  }
  if (invalidQuestions.length > 0) {
    summaryParts.push(`sai định dạng đáp án ở câu ${formatQuestionNumberList(invalidQuestions)}`);
  }

  return {
    isComplete: missingQuestions.length === 0 && invalidQuestions.length === 0,
    missingQuestions,
    invalidQuestions,
    summary: summaryParts.join('; ') || 'đủ đáp án cho tất cả câu',
  };
};

interface QuestionContentValidationResult {
  isComplete: boolean;
  presentQuestionCount: number;
  missingQuestions: number[];
  invalidQuestions: number[];
  summary: string;
}

type GeneratedQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';

interface GeneratedRubricItem {
  content: string;
  points: number;
}

interface GeneratedExamQuestion {
  number: number;
  type: GeneratedQuestionType;
  prompt: string;
  options?: string[];
  statements?: string[];
  answer?: string | string[];
  answerGuide?: string;
  rubric?: GeneratedRubricItem[];
}

interface StructuredExamValidationResult {
  isComplete: boolean;
  presentQuestionCount: number;
  missingQuestions: number[];
  invalidQuestions: number[];
  summary: string;
  questions: GeneratedExamQuestion[];
}

interface StructuredExamChunkValidationResult {
  isComplete: boolean;
  presentQuestionCount: number;
  missingQuestions: number[];
  invalidQuestions: number[];
  summary: string;
  questions: GeneratedExamQuestion[];
}

type LevelCountMap = Record<StructureLevelKey, number>;

interface LessonMatrixRequirement {
  chapterName: string;
  lessonName: string;
  countsByType: Record<GeneratedQuestionType, LevelCountMap>;
}

interface LessonQuestionAssignment {
  type: GeneratedQuestionType;
  start: number;
  end: number;
  numbers: number[];
  total: number;
  levels: LevelCountMap;
}

interface AssignedLessonRequirement {
  chapterName: string;
  lessonName: string;
  assignments: LessonQuestionAssignment[];
  totalQuestions: number;
}

const stripQuestionLabel = (value: string) =>
  value.replace(/^\s*Câu\s*\d+\s*[:.)-]?\s*/i, '').trim();

const hasMeaningfulQuestionText = (value: string, minLength: number = 8) => {
  const normalized = stripQuestionLabel(value)
    .replace(/\s+/g, ' ')
    .trim();
  const withoutEllipsis = normalized.replace(/(?:\.\.\.|…)+/g, '').trim();

  if (normalized.length < minLength) return false;
  if (/^(?:[.·…_\-\s]+)$/.test(normalized)) return false;
  return withoutEllipsis.length >= Math.min(minLength, Math.max(4, Math.floor(minLength / 2)));
};

const removeAnswerKeyTablesFromHtml = (html: string) => {
  if (!html || typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));

  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll('tr'));

    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
      const questionCells = Array.from(rows[rowIndex].querySelectorAll('th,td')).map((cell) =>
        normalizeAnswerCellValue(cell.textContent || ''),
      );
      const answerCells = Array.from(rows[rowIndex + 1].querySelectorAll('th,td')).map((cell) =>
        normalizeAnswerCellValue(cell.textContent || ''),
      );

      if (questionCells.length < 2 || answerCells.length < 2) continue;
      if (!isQuestionHeaderText(questionCells[0]) || !isAnswerHeaderText(answerCells[0])) continue;

      table.remove();
      break;
    }
  });

  return doc.body?.innerHTML || html;
};

const extractQuestionSectionText = (html: string) => {
  const plainText = htmlToPlainText(removeAnswerKeyTablesFromHtml(html));
  const markerPatterns = [
    /đáp án/i,
    /dap an/i,
    /hướng dẫn chấm/i,
    /huong dan cham/i,
  ];

  const markerIndexes = markerPatterns
    .map((pattern) => plainText.search(pattern))
    .filter((index) => index >= 0);

  if (markerIndexes.length === 0) {
    return plainText;
  }

  return plainText.slice(0, Math.min(...markerIndexes)).trim();
};

const extractQuestionBlocksFromHtml = (html: string) => {
  const questionText = extractQuestionSectionText(html);
  const matches = [...questionText.matchAll(/\bCâu\s*(\d+)\b/gi)];
  const questionBlocks = new Map<number, string>();

  matches.forEach((match, index) => {
    const questionNumber = Number(match[1]);
    if (!Number.isFinite(questionNumber) || questionNumber <= 0 || questionBlocks.has(questionNumber)) {
      return;
    }

    const startIndex = match.index ?? 0;
    const endIndex = index + 1 < matches.length ? (matches[index + 1].index ?? questionText.length) : questionText.length;
    questionBlocks.set(questionNumber, questionText.slice(startIndex, endIndex).trim());
  });

  return questionBlocks;
};

const isValidMultipleChoiceQuestionBlock = (value: string) => {
  const optionSplit = value.split(/\bA[.)]/i);
  const promptPart = optionSplit[0] || value;

  return hasMeaningfulQuestionText(promptPart, 8)
    && /\bA[.)]\s*\S[\s\S]*\bB[.)]\s*\S[\s\S]*\bC[.)]\s*\S[\s\S]*\bD[.)]\s*\S/i.test(value);
};

const isValidTrueFalseQuestionBlock = (value: string) =>
  hasMeaningfulQuestionText(value, 8)
  && /\ba[.)]\s*\S[\s\S]*\bb[.)]\s*\S[\s\S]*\bc[.)]\s*\S[\s\S]*\bd[.)]\s*\S/i.test(value);

const getQuestionValidatorForQuestion = (
  questionNumber: number,
  ranges: QuestionRange[],
) => {
  const validators = [
    isValidMultipleChoiceQuestionBlock,
    isValidTrueFalseQuestionBlock,
    (value: string) => hasMeaningfulQuestionText(value, 8),
    (value: string) => hasMeaningfulQuestionText(value, 8),
  ];

  for (let index = 0; index < Math.min(ranges.length, validators.length); index += 1) {
    const range = ranges[index];
    if (range.total > 0 && questionNumber >= range.start && questionNumber <= range.end) {
      return validators[index];
    }
  }

  return null;
};

const validateQuestionContentCoverage = (
  html: string,
  totalQuestions: number,
  questionRanges: QuestionRange[],
): QuestionContentValidationResult => {
  const questionBlocks = extractQuestionBlocksFromHtml(html);
  const missingQuestions: number[] = [];
  const invalidQuestions: number[] = [];

  for (let questionNumber = 1; questionNumber <= totalQuestions; questionNumber += 1) {
    const questionBlock = questionBlocks.get(questionNumber) || '';

    if (!questionBlock) {
      missingQuestions.push(questionNumber);
      continue;
    }

    const validator = getQuestionValidatorForQuestion(questionNumber, questionRanges);
    if (validator && !validator(questionBlock)) {
      invalidQuestions.push(questionNumber);
    }
  }

  const summaryParts: string[] = [];
  if (missingQuestions.length > 0) {
    summaryParts.push(`thiếu nội dung câu ${formatQuestionNumberList(missingQuestions)}`);
  }
  if (invalidQuestions.length > 0) {
    summaryParts.push(`câu chưa đủ cấu trúc ở ${formatQuestionNumberList(invalidQuestions)}`);
  }

  return {
    isComplete: missingQuestions.length === 0 && invalidQuestions.length === 0,
    presentQuestionCount: Array.from(questionBlocks.keys()).filter((questionNumber) => questionNumber >= 1 && questionNumber <= totalQuestions).length,
    missingQuestions,
    invalidQuestions,
    summary: summaryParts.join('; ') || 'đủ nội dung cho tất cả câu',
  };
};

const QUESTION_TYPE_SEQUENCE: GeneratedQuestionType[] = [
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay',
];

const QUESTION_SECTION_TITLES: Record<GeneratedQuestionType, string> = {
  multiple_choice: 'TRẮC NGHIỆM NHIỀU LỰA CHỌN',
  true_false: 'CÂU ĐÚNG/SAI',
  short_answer: 'CÂU TRẢ LỜI NGẮN',
  essay: 'TỰ LUẬN',
};

const QUESTION_TYPE_PROMPT_LABELS: Record<GeneratedQuestionType, string> = {
  multiple_choice: 'trắc nghiệm 1 đáp án',
  true_false: 'đúng/sai',
  short_answer: 'trả lời ngắn/điền khuyết',
  essay: 'tự luận',
};

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

const toCleanString = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

const sanitizeGeneratedJson = (value: string) =>
  value.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

const extractJsonDocumentFromResponse = (responseText: string) => {
  const sanitized = sanitizeGeneratedJson(responseText);
  const candidates = [
    sanitized,
    sanitized.replace(/,\s*([}\]])/g, '$1'),
  ];

  for (const candidateText of candidates) {
    try {
      JSON.parse(candidateText);
      return candidateText;
    } catch {
      const objectStart = candidateText.indexOf('{');
      const objectEnd = candidateText.lastIndexOf('}');

      if (objectStart >= 0 && objectEnd > objectStart) {
        const objectCandidate = candidateText.slice(objectStart, objectEnd + 1).trim();
        try {
          JSON.parse(objectCandidate);
          return objectCandidate;
        } catch {
          // Try array candidate below.
        }
      }

      const arrayStart = candidateText.indexOf('[');
      const arrayEnd = candidateText.lastIndexOf(']');

      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        const arrayCandidate = candidateText.slice(arrayStart, arrayEnd + 1).trim();
        try {
          JSON.parse(arrayCandidate);
          return arrayCandidate;
        } catch {
          // Try the next candidate variant.
        }
      }
    }
  }

  throw new Error('AI không trả về JSON hợp lệ.');
};

const parseGeneratedExamPayload = (responseText: string) => {
  const jsonText = extractJsonDocumentFromResponse(responseText);
  const parsed = JSON.parse(jsonText) as unknown;

  if (Array.isArray(parsed)) {
    return { questions: parsed };
  }

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;

    if (Array.isArray(record.questions)) {
      return { questions: record.questions };
    }
    if (record.questions && typeof record.questions === 'object') {
      return { questions: Object.values(record.questions as Record<string, unknown>) };
    }

    const candidateKeys = ['items', 'data', 'result', 'exam', 'content'];
    for (const key of candidateKeys) {
      if (Array.isArray(record[key])) {
        return { questions: record[key] as unknown[] };
      }
      if (record[key] && typeof record[key] === 'object') {
        const nested = record[key] as Record<string, unknown>;
        if (Array.isArray(nested.questions)) {
          return { questions: nested.questions };
        }
        if (nested.questions && typeof nested.questions === 'object') {
          return { questions: Object.values(nested.questions as Record<string, unknown>) };
        }
      }
    }

    const firstArrayValue = Object.values(record).find(Array.isArray);
    if (Array.isArray(firstArrayValue)) {
      return { questions: firstArrayValue as unknown[] };
    }
  }

  return { questions: [] };
};

const getExpectedQuestionType = (
  questionNumber: number,
  questionRanges: QuestionRange[],
): GeneratedQuestionType | null => {
  for (let index = 0; index < Math.min(questionRanges.length, QUESTION_TYPE_SEQUENCE.length); index += 1) {
    const range = questionRanges[index];
    if (range.total > 0 && questionNumber >= range.start && questionNumber <= range.end) {
      return QUESTION_TYPE_SEQUENCE[index];
    }
  }

  return null;
};

const normalizeGeneratedQuestionType = (value: unknown): GeneratedQuestionType | null => {
  const normalized = normalizeAsciiText(typeof value === 'string' ? value : '');

  if (['multiple_choice', 'multiple choice', 'multiple-choice', 'mcq', 'trac nghiem', 'trac nghiem 1 dap an', 'trac nghiem 1 dap an dung', '1 lua chon'].includes(normalized)) {
    return 'multiple_choice';
  }
  if (['true_false', 'true false', 'true-false', 'dung sai', 'dung/sai', 'dung_sai', 'truefalse'].includes(normalized)) {
    return 'true_false';
  }
  if (['short_answer', 'short answer', 'short-answer', 'shortanswer', 'tra loi ngan', 'dien khuyet', 'tra loi ngan/dien khuyet', 'tra loi ngan dien khuyet'].includes(normalized)) {
    return 'short_answer';
  }
  if (['essay', 'tu luan'].includes(normalized)) {
    return 'essay';
  }

  return null;
};

const normalizeMultipleChoiceAnswer = (value: unknown) => {
  const normalized = normalizeStructuredTextValue(value).toUpperCase();
  const match = normalized.match(/[ABCD]/);
  return match ? match[0] : '';
};

const normalizeStructuredTextValue = (value: unknown) => {
  if (typeof value === 'string') {
    return toCleanString(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = ['text', 'content', 'value', 'label', 'option', 'statement', 'prompt', 'question', 'name'];
    for (const key of preferredKeys) {
      const candidate = toCleanString(record[key]);
      if (candidate) {
        return candidate;
      }
    }

    const firstStringValue = Object.values(record)
      .map((item) => toCleanString(item))
      .find(Boolean);

    return firstStringValue || '';
  }

  return toCleanString(value);
};

const normalizeOrderedStringArray = (value: unknown, preferredKeys: string[]) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeStructuredTextValue(item)).filter(Boolean);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredValues = preferredKeys
      .map((key) => normalizeStructuredTextValue(record[key]))
      .filter(Boolean);

    if (preferredValues.length > 0) {
      return preferredValues;
    }

    return Object.values(record).map((item) => normalizeStructuredTextValue(item)).filter(Boolean);
  }

  return [];
};

const normalizeTrueFalseAnswerToken = (value: unknown) => {
  const normalized = normalizeAsciiText(typeof value === 'string' ? value : String(value ?? ''));

  if (['d', 'dung', 'true', 't'].includes(normalized)) return 'Đ';
  if (['s', 'sai', 'false', 'f'].includes(normalized)) return 'S';
  return '';
};

const normalizeTrueFalseAnswers = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeTrueFalseAnswerToken(item))
      .filter(Boolean)
      .slice(0, 4);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const orderedKeys = ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D', '1', '2', '3', '4'];
    const preferredValues = orderedKeys
      .map((key) => normalizeTrueFalseAnswerToken(record[key]))
      .filter(Boolean);

    if (preferredValues.length > 0) {
      return preferredValues.slice(0, 4);
    }

    return Object.values(record)
      .map((item) => normalizeTrueFalseAnswerToken(item))
      .filter(Boolean)
      .slice(0, 4);
  }

  const text = toCleanString(value);
  if (!text) return [];

  return text
    .split(/[,\-|/;]+|\s{2,}/)
    .map((item) => normalizeTrueFalseAnswerToken(item))
    .filter(Boolean)
    .slice(0, 4);
};

const normalizeRubricItems = (value: unknown): GeneratedRubricItem[] => {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const raw = item as Record<string, unknown>;
    const content = toCleanString(raw.content ?? raw.text ?? raw.criterion);
    const pointsText = typeof raw.points === 'number' ? raw.points : Number(String(raw.points ?? '').replace(',', '.'));
    const points = Number.isFinite(pointsText) ? Math.max(0, pointsText) : 0;

    return { content, points };
  }).filter((item) => item.content && item.points > 0);
};

const inferGeneratedQuestionTypeFromShape = (
  options: string[],
  statements: string[],
  answerGuide: string,
  rubric: GeneratedRubricItem[],
) => {
  if (options.length >= 4) {
    return 'multiple_choice' as GeneratedQuestionType;
  }
  if (statements.length >= 4) {
    return 'true_false' as GeneratedQuestionType;
  }
  if (hasMeaningfulAnswerValue(answerGuide) || rubric.length > 0) {
    return 'essay' as GeneratedQuestionType;
  }
  return 'short_answer' as GeneratedQuestionType;
};

const getNextAvailableQuestionNumber = (
  usedNumbers: Set<number>,
  totalQuestions: number,
  preferredNumber: number,
) => {
  if (preferredNumber >= 1 && preferredNumber <= totalQuestions && !usedNumbers.has(preferredNumber)) {
    return preferredNumber;
  }

  for (let candidate = 1; candidate <= totalQuestions; candidate += 1) {
    if (!usedNumbers.has(candidate)) {
      return candidate;
    }
  }

  return 0;
};

const hasMeaningfulAnswerValue = (value: string) => {
  const normalized = toCleanString(value);
  if (!normalized) return false;
  return !/^(?:[.·…_\-\s]+)$/.test(normalized);
};

const isGeneratedQuestionValidForType = (
  question: GeneratedExamQuestion,
  expectedType: GeneratedQuestionType,
) => {
  if (question.type !== expectedType) {
    return false;
  }

  if (expectedType === 'multiple_choice') {
    return hasMeaningfulQuestionText(question.prompt, 8)
      && Array.isArray(question.options)
      && question.options.length === 4
      && question.options.every((option) => hasMeaningfulAnswerValue(option))
      && typeof question.answer === 'string'
      && /^[ABCD]$/.test(question.answer);
  }

  if (expectedType === 'true_false') {
    return hasMeaningfulQuestionText(question.prompt, 8)
      && Array.isArray(question.statements)
      && question.statements.length === 4
      && question.statements.every((statement) => hasMeaningfulQuestionText(statement, 3))
      && Array.isArray(question.answer)
      && question.answer.length === 4
      && question.answer.every((token) => token === 'Đ' || token === 'S');
  }

  if (expectedType === 'short_answer') {
    return hasMeaningfulQuestionText(question.prompt, 8)
      && typeof question.answer === 'string'
      && hasMeaningfulAnswerValue(question.answer);
  }

  return hasMeaningfulQuestionText(question.prompt, 8)
    && (
      hasMeaningfulAnswerValue(question.answerGuide || '')
      || (Array.isArray(question.rubric) && question.rubric.length > 0)
    );
};

const validateStructuredExamPayload = (
  responseText: string,
  totalQuestions: number,
  questionRanges: QuestionRange[],
): StructuredExamValidationResult => {
  const payload = parseGeneratedExamPayload(responseText);
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const normalizedQuestions = new Map<number, GeneratedExamQuestion>();
  const duplicateQuestions: number[] = [];
  const missingQuestions: number[] = [];
  const invalidQuestions: number[] = [];
  const usedNumbers = new Set<number>();
  const hasExpectedRanges = questionRanges.some((range) => range.total > 0);

  rawQuestions.forEach((item, index) => {
    const raw = item as Record<string, unknown>;
    const parsedNumber = typeof raw.number === 'number'
      ? raw.number
      : Number(String(raw.number ?? '').trim());
    const number = getNextAvailableQuestionNumber(
      usedNumbers,
      totalQuestions,
      Number.isFinite(parsedNumber) ? parsedNumber : index + 1,
    );

    if (number <= 0) {
      if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
        duplicateQuestions.push(parsedNumber);
      }
      return;
    }

    if (Number.isFinite(parsedNumber) && parsedNumber > 0 && (parsedNumber < 1 || parsedNumber > totalQuestions || usedNumbers.has(parsedNumber))) {
      duplicateQuestions.push(parsedNumber);
    }

    const prompt = normalizeStructuredTextValue(raw.prompt ?? raw.content ?? raw.question ?? raw.text ?? raw.stem ?? raw.title ?? raw.body);
    const options = normalizeOrderedStringArray(raw.options ?? raw.choices ?? raw.answers ?? raw.answerOptions ?? raw.phuongAn, ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']).slice(0, 4);
    const statements = normalizeOrderedStringArray(raw.statements ?? raw.items ?? raw.assertions ?? raw.subStatements ?? raw.phatBieu, ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D']).slice(0, 4);
    const provisionalAnswerGuide = normalizeStructuredTextValue(raw.answerGuide ?? raw.guide ?? raw.explanation ?? raw.huongDan ?? raw.huong_dan);
    const rubric = normalizeRubricItems(raw.rubric);
    const inferredType = inferGeneratedQuestionTypeFromShape(options, statements, provisionalAnswerGuide, rubric);
    const type = normalizeGeneratedQuestionType(raw.type ?? raw.questionType ?? raw.kind)
      || getExpectedQuestionType(number, questionRanges)
      || inferredType;
    const answerGuide = provisionalAnswerGuide || normalizeStructuredTextValue(type === 'essay' ? raw.answer : '');
    const rawAnswerValue = raw.answer ?? raw.correctAnswer ?? raw.correct_answer ?? raw.solution ?? raw.key ?? raw.dapAn ?? raw.dap_an;

    let answer: string | string[] | undefined;
    if (type === 'multiple_choice') {
      answer = normalizeMultipleChoiceAnswer(rawAnswerValue);
    } else if (type === 'true_false') {
      answer = normalizeTrueFalseAnswers(rawAnswerValue);
    } else {
      answer = normalizeStructuredTextValue(rawAnswerValue);
    }

    normalizedQuestions.set(number, {
      number,
      type: type || 'short_answer',
      prompt,
      options,
      statements,
      answer,
      answerGuide,
      rubric,
    });
    usedNumbers.add(number);
  });

  const validQuestions: GeneratedExamQuestion[] = [];

  for (let questionNumber = 1; questionNumber <= totalQuestions; questionNumber += 1) {
    const question = normalizedQuestions.get(questionNumber);

    if (!question) {
      missingQuestions.push(questionNumber);
      continue;
    }

    const expectedType = hasExpectedRanges
      ? getExpectedQuestionType(questionNumber, questionRanges)
      : question.type;

    if (!expectedType || question.type !== expectedType) {
      invalidQuestions.push(questionNumber);
      continue;
    }

    if (!isGeneratedQuestionValidForType(question, expectedType)) {
      invalidQuestions.push(questionNumber);
      continue;
    }

    validQuestions.push(question);
  }

  const summaryParts: string[] = [];
  if (missingQuestions.length > 0) {
    summaryParts.push(`thiếu câu ${formatQuestionNumberList(missingQuestions)}`);
  }
  if (invalidQuestions.length > 0) {
    summaryParts.push(`sai dạng hoặc thiếu dữ liệu ở câu ${formatQuestionNumberList(invalidQuestions)}`);
  }
  if (duplicateQuestions.length > 0) {
    summaryParts.push(`trùng số câu ${formatQuestionNumberList(duplicateQuestions)}`);
  }

  return {
    isComplete: missingQuestions.length === 0 && invalidQuestions.length === 0 && validQuestions.length === totalQuestions,
    presentQuestionCount: validQuestions.length,
    missingQuestions,
    invalidQuestions,
    summary: summaryParts.join('; ') || 'đủ dữ liệu cấu trúc cho tất cả câu',
    questions: validQuestions.sort((a, b) => a.number - b.number),
  };
};

const validateStructuredExamChunkPayload = (
  responseText: string,
  range: QuestionRange,
  expectedType: GeneratedQuestionType,
): StructuredExamChunkValidationResult => {
  const payload = parseGeneratedExamPayload(responseText);
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const normalizedQuestions = new Map<number, GeneratedExamQuestion>();
  const missingQuestions: number[] = [];
  const invalidQuestions: number[] = [];
  const validQuestions: GeneratedExamQuestion[] = [];

  rawQuestions.forEach((item) => {
    const raw = item as Record<string, unknown>;
    const number = typeof raw.number === 'number'
      ? raw.number
      : Number(String(raw.number ?? '').trim());

    if (!Number.isFinite(number) || number <= 0) {
      return;
    }

    if (normalizedQuestions.has(number)) {
      invalidQuestions.push(number);
      return;
    }

    const type = normalizeGeneratedQuestionType(raw.type ?? raw.questionType ?? raw.kind) || expectedType;
    const prompt = normalizeStructuredTextValue(raw.prompt ?? raw.content ?? raw.question ?? raw.text ?? raw.stem ?? raw.title ?? raw.body);
    const options = normalizeOrderedStringArray(raw.options ?? raw.choices ?? raw.answers ?? raw.answerOptions ?? raw.phuongAn, ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']).slice(0, 4);
    const statements = normalizeOrderedStringArray(raw.statements ?? raw.items ?? raw.assertions ?? raw.subStatements ?? raw.phatBieu, ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D']).slice(0, 4);
    const answerGuide = normalizeStructuredTextValue(raw.answerGuide ?? raw.guide ?? raw.explanation ?? raw.huongDan ?? raw.huong_dan ?? (type === 'essay' ? raw.answer : ''));
    const rubric = normalizeRubricItems(raw.rubric);
    const rawAnswerValue = raw.answer ?? raw.correctAnswer ?? raw.correct_answer ?? raw.solution ?? raw.key ?? raw.dapAn ?? raw.dap_an;

    let answer: string | string[] | undefined;
    if (type === 'multiple_choice') {
      answer = normalizeMultipleChoiceAnswer(rawAnswerValue);
    } else if (type === 'true_false') {
      answer = normalizeTrueFalseAnswers(rawAnswerValue);
    } else {
      answer = normalizeStructuredTextValue(rawAnswerValue);
    }

    normalizedQuestions.set(number, {
      number,
      type: type || 'short_answer',
      prompt,
      options,
      statements,
      answer,
      answerGuide,
      rubric,
    });
  });

  for (const questionNumber of normalizedQuestions.keys()) {
    if (questionNumber < range.start || questionNumber > range.end) {
      invalidQuestions.push(questionNumber);
    }
  }

  for (let questionNumber = range.start; questionNumber <= range.end; questionNumber += 1) {
    const question = normalizedQuestions.get(questionNumber);

    if (!question) {
      missingQuestions.push(questionNumber);
      continue;
    }

    if (!isGeneratedQuestionValidForType(question, expectedType)) {
      invalidQuestions.push(questionNumber);
      continue;
    }

    validQuestions.push(question);
  }

  const summaryParts: string[] = [];
  if (missingQuestions.length > 0) {
    summaryParts.push(`thiếu câu ${formatQuestionNumberList(missingQuestions)}`);
  }
  if (invalidQuestions.length > 0) {
    summaryParts.push(`sai dữ liệu ở câu ${formatQuestionNumberList(invalidQuestions)}`);
  }

  return {
    isComplete: missingQuestions.length === 0 && invalidQuestions.length === 0 && validQuestions.length === range.total,
    presentQuestionCount: validQuestions.length,
    missingQuestions,
    invalidQuestions,
    summary: summaryParts.join('; ') || `đủ ${range.total} câu ${QUESTION_TYPE_PROMPT_LABELS[expectedType]}`,
    questions: validQuestions.sort((a, b) => a.number - b.number),
  };
};

const validateLessonStructuredPayload = (
  responseText: string,
  lessonRequirement: AssignedLessonRequirement,
): StructuredExamChunkValidationResult => {
  const payload = parseGeneratedExamPayload(responseText);
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const normalizedQuestions = new Map<number, GeneratedExamQuestion>();
  const expectedTypeByQuestion = new Map<number, GeneratedQuestionType>();
  const missingQuestions: number[] = [];
  const invalidQuestions: number[] = [];
  const validQuestions: GeneratedExamQuestion[] = [];

  lessonRequirement.assignments.forEach((assignment) => {
    assignment.numbers.forEach((number) => {
      expectedTypeByQuestion.set(number, assignment.type);
    });
  });

  rawQuestions.forEach((item) => {
    const raw = item as Record<string, unknown>;
    const number = typeof raw.number === 'number'
      ? raw.number
      : Number(String(raw.number ?? '').trim());

    if (!Number.isFinite(number) || number <= 0) {
      return;
    }

    if (normalizedQuestions.has(number)) {
      invalidQuestions.push(number);
      return;
    }

    const expectedType = expectedTypeByQuestion.get(number);
    const type = normalizeGeneratedQuestionType(raw.type ?? raw.questionType ?? raw.kind) || expectedType;
    const prompt = normalizeStructuredTextValue(raw.prompt ?? raw.content ?? raw.question ?? raw.text ?? raw.stem ?? raw.title ?? raw.body);
    const options = normalizeOrderedStringArray(raw.options ?? raw.choices ?? raw.answers ?? raw.answerOptions ?? raw.phuongAn, ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']).slice(0, 4);
    const statements = normalizeOrderedStringArray(raw.statements ?? raw.items ?? raw.assertions ?? raw.subStatements ?? raw.phatBieu, ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D']).slice(0, 4);
    const answerGuide = normalizeStructuredTextValue(raw.answerGuide ?? raw.guide ?? raw.explanation ?? raw.huongDan ?? raw.huong_dan ?? (type === 'essay' ? raw.answer : ''));
    const rubric = normalizeRubricItems(raw.rubric);
    const rawAnswerValue = raw.answer ?? raw.correctAnswer ?? raw.correct_answer ?? raw.solution ?? raw.key ?? raw.dapAn ?? raw.dap_an;

    let answer: string | string[] | undefined;
    if (type === 'multiple_choice') {
      answer = normalizeMultipleChoiceAnswer(rawAnswerValue);
    } else if (type === 'true_false') {
      answer = normalizeTrueFalseAnswers(rawAnswerValue);
    } else {
      answer = normalizeStructuredTextValue(rawAnswerValue);
    }

    normalizedQuestions.set(number, {
      number,
      type: type || 'short_answer',
      prompt,
      options,
      statements,
      answer,
      answerGuide,
      rubric,
    });
  });

  for (const questionNumber of normalizedQuestions.keys()) {
    if (!expectedTypeByQuestion.has(questionNumber)) {
      invalidQuestions.push(questionNumber);
    }
  }

  lessonRequirement.assignments.forEach((assignment) => {
    assignment.numbers.forEach((questionNumber) => {
      const question = normalizedQuestions.get(questionNumber);
      if (!question) {
        missingQuestions.push(questionNumber);
        return;
      }

      if (!isGeneratedQuestionValidForType(question, assignment.type)) {
        invalidQuestions.push(questionNumber);
        return;
      }

      validQuestions.push(question);
    });
  });

  const summaryParts: string[] = [];
  if (missingQuestions.length > 0) {
    summaryParts.push(`thiếu câu ${formatQuestionNumberList(missingQuestions)}`);
  }
  if (invalidQuestions.length > 0) {
    summaryParts.push(`sai dữ liệu ở câu ${formatQuestionNumberList(invalidQuestions)}`);
  }

  return {
    isComplete: missingQuestions.length === 0 && invalidQuestions.length === 0 && validQuestions.length === lessonRequirement.totalQuestions,
    presentQuestionCount: validQuestions.length,
    missingQuestions,
    invalidQuestions,
    summary: summaryParts.join('; ') || `đủ câu cho bài ${lessonRequirement.lessonName}`,
    questions: validQuestions.sort((a, b) => a.number - b.number),
  };
};

const buildQuestionNumberRangeChecklist = (start: number, end: number) =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => `Câu ${start + index}`).join(', ');

const formatLessonLevelBreakdown = (levels: LevelCountMap) =>
  STRUCTURE_LEVELS
    .map(({ key, label }) => (levels[key] > 0 ? `${levels[key]} câu ${label.toLowerCase()}` : ''))
    .filter(Boolean)
    .join(', ');

const buildStructuredChunkPrompt = (
  compactSpecsHtml: string,
  lessonBreakdownPrompt: string,
  examTypeRequirements: string,
  range: QuestionRange,
  questionType: GeneratedQuestionType,
  previousFeedback: string,
) => {
  const questionChecklist = buildQuestionNumberRangeChecklist(range.start, range.end);

  const typeSpecificInstruction = questionType === 'multiple_choice'
    ? `Mỗi câu phải có:
- "type": "multiple_choice"
- "prompt": nội dung câu hỏi đầy đủ
- "options": mảng đúng 4 phần tử A, B, C, D
- "answer": đúng 1 ký tự A hoặc B hoặc C hoặc D`
    : questionType === 'true_false'
      ? `Mỗi câu phải có:
- "type": "true_false"
- "prompt": đề dẫn đầy đủ
- "statements": mảng đúng 4 mệnh đề a, b, c, d
- "answer": mảng đúng 4 phần tử chỉ gồm "Đ" hoặc "S"`
      : questionType === 'short_answer'
        ? `Mỗi câu phải có:
- "type": "short_answer"
- "prompt": nội dung câu điền khuyết/trả lời ngắn đầy đủ
- "answer": đáp án ngắn chính xác`
        : `Mỗi câu phải có:
- "type": "essay"
- "prompt": nội dung câu tự luận đầy đủ
- "answerGuide": gợi ý đáp án
- hoặc "rubric": mảng chấm điểm chi tiết`;

  return `Dựa trên Bảng đặc tả sau, hãy chỉ tạo NHÓM CÂU thuộc dạng ${QUESTION_TYPE_PROMPT_LABELS[questionType]}.

BẢNG ĐẶC TẢ:
${compactSpecsHtml}

PHÂN BỔ TỪNG DẠNG:
${examTypeRequirements}

${lessonBreakdownPrompt ? `PHÂN BỔ THEO BÀI:
${lessonBreakdownPrompt}
` : ''}

YÊU CẦU CỦA LẦN TẠO NÀY:
- Chỉ tạo các câu từ Câu ${range.start} đến Câu ${range.end}.
- Tổng số câu cần tạo trong lần này: ${range.total}.
- Không được tạo câu ngoài dải số trên.
- Các số câu bắt buộc phải đủ: ${questionChecklist}.
- Mọi câu phải là câu thật, không được placeholder, không được ghi "...".
- ${previousFeedback ? `Lỗi lần trước cần tránh: ${previousFeedback}.` : 'Phải trả đúng đủ ngay trong lần này.'}

${typeSpecificInstruction}

CHỈ TRẢ VỀ JSON OBJECT:
{
  "questions": [
    ...
  ]
}`;
};

const buildLessonStructuredPrompt = (
  compactSpecsHtml: string,
  lessonRequirement: AssignedLessonRequirement,
  previousFeedback: string,
) => {
  const assignmentLines = lessonRequirement.assignments.map((assignment) => {
    const questionNumbers = assignment.numbers.map((number) => `Câu ${number}`).join(', ');
    return `- ${QUESTION_TYPE_PROMPT_LABELS[assignment.type]}: ${formatLessonLevelBreakdown(assignment.levels)}. Dùng đúng các số câu: ${questionNumbers}.`;
  }).join('\n');

  return `Dựa trên Bảng đặc tả sau, hãy chỉ tạo câu hỏi cho duy nhất bài học "${lessonRequirement.lessonName}" thuộc chương "${lessonRequirement.chapterName}".

BẢNG ĐẶC TẢ:
${compactSpecsHtml}

YÊU CẦU CHO RIÊNG BÀI NÀY:
${assignmentLines}

QUY TẮC:
- Chỉ tạo câu cho đúng bài "${lessonRequirement.lessonName}".
- Tổng số câu cần tạo trong lần này: ${lessonRequirement.totalQuestions}.
- Không được tạo câu ngoài các số câu đã chỉ định.
- Không được bỏ sót loại câu nào đã yêu cầu ở trên.
- Mỗi câu phải đầy đủ nội dung, không placeholder, không dấu "...".
- ${previousFeedback ? `Lỗi lần trước cần tránh: ${previousFeedback}.` : 'Phải tạo đủ đúng ngay trong lần này.'}

CHỈ TRẢ VỀ JSON OBJECT:
{
  "questions": [
    {
      "number": 1,
      "type": "multiple_choice",
      "prompt": "Nội dung câu hỏi",
      "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
      "answer": "A"
    }
  ]
}`;
};

const buildLessonAssignmentDetails = (assignment: LessonQuestionAssignment) => {
  let cursor = 0;
  const parts = STRUCTURE_LEVELS
    .map(({ key, label }) => {
      const count = assignment.levels[key];
      if (count <= 0) return '';

      const numbers = assignment.numbers.slice(cursor, cursor + count);
      cursor += count;
      const questionNumbers = numbers.map((number) => `Câu ${number}`).join(', ');
      return `${label}: ${questionNumbers}`;
    })
    .filter(Boolean);

  return parts.join('; ');
};

const buildSinglePassHtmlPrompt = (
  compactSpecsHtml: string,
  examTypeRequirements: string,
  assignedLessonRequirements: AssignedLessonRequirement[],
  effectiveQuestionCount: number,
  questionChecklist: string,
  questionRangePrompt: string,
  subject: string,
  examType: string,
  duration: number,
) => {
  const lessonAssignmentText = assignedLessonRequirements.length > 0
    ? assignedLessonRequirements.map((lesson) => {
      const assignmentLines = lesson.assignments.map((assignment) => {
        const questionNumbers = assignment.numbers.map((number) => `Câu ${number}`).join(', ');
        const levelDetails = buildLessonAssignmentDetails(assignment);
        return `  - ${QUESTION_TYPE_PROMPT_LABELS[assignment.type]}: ${formatLessonLevelBreakdown(assignment.levels)}. Dùng đúng các số câu: ${questionNumbers}.${levelDetails ? ` Phân theo mức độ: ${levelDetails}.` : ''}`;
      }).join('\n');

      return `- Chương: ${lesson.chapterName}\n  Bài: ${lesson.lessonName}\n${assignmentLines}`;
    }).join('\n')
    : '- Không trích được phân bố theo từng bài từ ma trận, hãy bám đúng cấu trúc tổng thể bên dưới.';

  return `Dựa trên bảng đặc tả sau, hãy soạn TOÀN BỘ ĐỀ THI HOÀN CHỈNH và HƯỚNG DẪN CHẤM chỉ trong MỘT lần trả lời.

BẢNG ĐẶC TẢ:
${compactSpecsHtml}

CẤU TRÚC TỔNG THỂ BẮT BUỘC:
- Tổng số câu toàn đề: ${effectiveQuestionCount}
${questionRangePrompt}

PHÂN BỔ TỪNG DẠNG:
${examTypeRequirements}

PHÂN BỔ CHI TIẾT THEO TỪNG BÀI:
${lessonAssignmentText}

QUY TẮC CỰC KỲ QUAN TRỌNG:
- Chỉ trả lời MỘT LẦN bằng JSON hoàn chỉnh.
- Phải tạo đủ toàn bộ các câu từ Câu 1 đến Câu ${effectiveQuestionCount}.
- Các số câu bắt buộc phải đủ: ${questionChecklist}.
- Nếu bài nào được giao số câu nào thì phải tạo đúng số câu đó cho đúng bài đó.
- Không được bỏ sót câu trắc nghiệm 1 đáp án.
- Không được bỏ sót câu trả lời ngắn/điền khuyết.
- Không được đổi loại câu giữa các dải số câu.
- Mỗi câu phải là câu thật, đầy đủ nội dung, không placeholder, không "...".
- Câu trắc nghiệm 1 đáp án phải có đủ 4 lựa chọn A, B, C, D.
- Câu đúng/sai phải có đủ 4 mệnh đề a, b, c, d và 4 đáp án tương ứng.
- Câu trả lời ngắn phải có prompt đầy đủ và đáp án ngắn chính xác.
- Câu tự luận phải có answerGuide hoặc rubric.
- Mọi chuỗi phải bằng tiếng Việt và không được rỗng.

YÊU CẦU OUTPUT:
1. Full HTML Document (<!DOCTYPE html>...)
2. Tiêu đề: ĐỀ KIỂM TRA ${examType.toUpperCase()} - ${subject.toUpperCase()}
3. Thời gian: ${duration} phút
4. Năm học: "NĂM HỌC 20... - 20..." (để trống)
5. Trường: "TRƯỜNG THPT ..............." (để trống)
6. Có phần Họ tên, SBD
7. Đề phải có đủ toàn bộ câu từ Câu 1 đến Câu ${effectiveQuestionCount}
8. Các phần câu hỏi phải hiển thị đầy đủ trong thân đề, không được chỉ có số câu ở bảng đáp án
9. Đáp án cuối bài phải trình bày dạng bảng, mỗi bảng 10 câu, gồm 2 dòng:
   - Dòng 1: "Câu" | 1 | 2 | ...
   - Dòng 2: "Đáp án" | đáp án tương ứng
10. Với câu 1 lựa chọn: ô đáp án chỉ ghi 1 ký tự A/B/C/D
11. Với câu đúng/sai: ô đáp án ghi đủ 4 mệnh đề, ví dụ "Đ, S, Đ, S"
12. Với câu trả lời ngắn: ô đáp án ghi đáp án ngắn chính xác
13. Với câu tự luận: ô đáp án ghi "TL" và phải có hướng dẫn chấm chi tiết

Format câu hỏi:
- Trắc nghiệm: Câu X. Nội dung -> A. B. C. D.
- Đúng/Sai: Câu X. Đề dẫn -> a) ... b) ... c) ... d) ...
- Trả lời ngắn: Câu X. Nội dung
- Tự luận: Câu X. Nội dung

CHỈ trả về HTML thuần, KHÔNG markdown code block, KHÔNG giải thích thêm.`;
};

const buildSinglePassHtmlPromptV2 = (
  compactSpecsHtml: string,
  examTypeRequirements: string,
  assignedLessonRequirements: AssignedLessonRequirement[],
  effectiveQuestionCount: number,
  questionChecklist: string,
  questionRangePrompt: string,
  questionRanges: QuestionRange[],
  subject: string,
  examType: string,
  duration: number,
) => {
  const lessonAssignmentText = assignedLessonRequirements.length > 0
    ? assignedLessonRequirements.map((lesson) => {
      const assignmentLines = lesson.assignments.map((assignment) => {
        const questionNumbers = assignment.numbers.map((number) => `Cau ${number}`).join(', ');
        const levelDetails = buildLessonAssignmentDetails(assignment);
        return `  - ${QUESTION_TYPE_PROMPT_LABELS[assignment.type]}: ${formatLessonLevelBreakdown(assignment.levels)}. Dung dung cac so cau: ${questionNumbers}.${levelDetails ? ` Phan theo muc do: ${levelDetails}.` : ''}`;
      }).join('\n');

      return `- Chuong: ${lesson.chapterName}\n  Bai: ${lesson.lessonName}\n${assignmentLines}`;
    }).join('\n')
    : '- Khong tach duoc theo tung bai tu ma tran, hay bam dung cau truc tong the ben duoi.';

  const activeSections = questionRanges
    .map((range, index) => ({
      range,
      type: QUESTION_TYPE_SEQUENCE[index],
      roman: ROMAN_NUMERALS[index] || `${index + 1}`,
    }))
    .filter((item) => item.range.total > 0);

  const sectionRules = activeSections.length > 0
    ? activeSections.map((item) =>
      `- PHAN ${item.roman}: ${QUESTION_SECTION_TITLES[item.type]} chi gom cac cau ${item.range.start}-${item.range.end}.`,
    ).join('\n')
    : '- Tao de theo dung cau truc tong the.';

  const sectionSkeleton = activeSections.length > 0
    ? activeSections.map((item) =>
      `<section class="exam-section">\n  <h4>PHAN ${item.roman}. ${QUESTION_SECTION_TITLES[item.type]}</h4>\n</section>`,
    ).join('\n')
    : '<section class="exam-section"></section>';

  return `Ban la giao vien Viet Nam. Hay tao TOAN BO DE THI HOAN CHINH chi trong 1 lan tra loi.

DU LIEU NGUON:
${compactSpecsHtml}

CAU TRUC TONG THE BAT BUOC:
- Tong so cau: ${effectiveQuestionCount}
${questionRangePrompt}

PHAN BO TUNG DANG:
${examTypeRequirements}

PHAN BO THEO TUNG BAI:
${lessonAssignmentText}

CAC SECTION BAT BUOC:
${sectionRules}

BAT BUOC:
- Chi tra ve duy nhat 1 tai lieu HTML hoan chinh.
- KHONG tra ve JSON.
- KHONG tra ve markdown code block.
- KHONG giai thich them.
- Phai tao du tat ca cac cau tu Cau 1 den Cau ${effectiveQuestionCount}.
- Cac so cau bat buoc phai du: ${questionChecklist}.
- Khong duoc doi loai cau giua cac dai so cau.
- Moi cau phai la cau that, co noi dung day du, khong placeholder, khong "...".
- Cau trac nghiem 1 dap an phai co du 4 lua chon A, B, C, D.
- Cau dung/sai phai co du 4 menh de a, b, c, d.
- Cau tra loi ngan phai co noi dung day du va co dap an ngan ro rang.
- Cau tu luan phai co huong dan cham chi tiet.
- Bang dap an cuoi bai phai du cho tat ca cac cau, khong de trong o nao.

HTML KHUNG PHAI THEO:
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>De kiem tra ${examType} - ${subject}</title>
</head>
<body>
  <h3>DE KIEM TRA ${examType.toUpperCase()} - ${subject.toUpperCase()}</h3>
  <p><strong>TRUONG THPT ...............</strong></p>
  <p><strong>NAM HOC 20... - 20...</strong></p>
  <p><strong>Thoi gian lam bai: ${duration} phut</strong></p>
  <p>Ho va ten: .................................... SBD: ........................</p>
  ${sectionSkeleton}
  <h3>DAP AN</h3>
  <table>
    <tr><th>Cau</th><th>1</th><th>2</th></tr>
    <tr><th>Dap an</th><td>A</td><td>B</td></tr>
  </table>
  <h3>HUONG DAN CHAM</h3>
</body>
</html>

QUY TAC NOI DUNG:
- Trong than de, moi cau phai bat dau bang chuoi "Cau X." dung thu tu.
- Trac nghiem: sau "Cau X." phai co 4 dong A. B. C. D.
- Dung/sai: sau "Cau X." phai co 4 dong a) b) c) d).
- Tra loi ngan: sau "Cau X." la noi dung cau hoi day du.
- Tu luan: sau "Cau X." la noi dung cau hoi day du.
- Muc DAP AN phai dung dang bang, moi bang toi da 10 cau, gom 2 dong: "Cau" va "Dap an".
- O dap an cua cau trac nghiem chi ghi 1 ky tu A/B/C/D.
- O dap an cua cau dung/sai ghi du 4 gia tri, vi du "D, S, D, S".
- O dap an cua cau tra loi ngan ghi dap an ngan chinh xac.
- O dap an cua cau tu luan ghi "TL".

CHI TRA VE HTML THUAN VA CHI 1 TAI LIEU HTML DUY NHAT.`;
};

const buildSinglePassStructuredPromptV2 = (
  compactSpecsHtml: string,
  examTypeRequirements: string,
  assignedLessonRequirements: AssignedLessonRequirement[],
  effectiveQuestionCount: number,
  questionChecklist: string,
  questionRangePrompt: string,
) => {
  const lessonAssignmentText = assignedLessonRequirements.length > 0
    ? assignedLessonRequirements.map((lesson) => {
      const assignmentLines = lesson.assignments.map((assignment) => {
        const questionNumbers = assignment.numbers.map((number) => `Cau ${number}`).join(', ');
        const levelDetails = buildLessonAssignmentDetails(assignment);
        return `  - ${QUESTION_TYPE_PROMPT_LABELS[assignment.type]}: ${formatLessonLevelBreakdown(assignment.levels)}. Dung dung cac so cau: ${questionNumbers}.${levelDetails ? ` Phan theo muc do: ${levelDetails}.` : ''}`;
      }).join('\n');

      return `- Chuong: ${lesson.chapterName}\n  Bai: ${lesson.lessonName}\n${assignmentLines}`;
    }).join('\n')
    : '- Khong tach duoc theo tung bai tu ma tran, hay bam dung cau truc tong the ben duoi.';

  return `Ban la giao vien Viet Nam. Hay tao DUY NHAT 1 JSON object cho de thi.

DU LIEU NGUON:
${compactSpecsHtml}

CAU TRUC TONG THE BAT BUOC:
- Tong so cau: ${effectiveQuestionCount}
${questionRangePrompt}

PHAN BO TUNG DANG:
${examTypeRequirements}

PHAN BO THEO TUNG BAI:
${lessonAssignmentText}

BAT BUOC:
- Chi tra ve 1 JSON object hop le, khong markdown, khong giai thich.
- JSON phai co dung 1 khoa "questions".
- Mang "questions" phai co dung ${effectiveQuestionCount} phan tu.
- So thu tu phai day du va lien tuc: ${questionChecklist}.
- Neu bai nao duoc giao cau nao thi phai tao dung cau do cho dung bai do.
- Khong duoc doi loai cau giua cac dai so cau.
- Moi cau phai la cau that, co noi dung day du, khong placeholder, khong "...".
- Khong duoc bo sot cau trac nghiem 1 dap an.
- Khong duoc bo sot cau tra loi ngan/dien khuyet.
- Cau trac nghiem 1 dap an phai co du 4 lua chon A, B, C, D.
- Cau dung/sai phai co du 4 menh de a, b, c, d va 4 dap an tuong ung.
- Cau tra loi ngan phai co prompt day du va answer ngan chinh xac.
- Cau tu luan phai co answerGuide hoac rubric.
- Moi chuoi phai bang tieng Viet va khong duoc rong.

Schema bat buoc:
{
  "questions": [
    {
      "number": 1,
      "type": "multiple_choice",
      "prompt": "Noi dung cau hoi",
      "options": ["Phuong an A", "Phuong an B", "Phuong an C", "Phuong an D"],
      "answer": "A"
    },
    {
      "number": 8,
      "type": "true_false",
      "prompt": "De dan",
      "statements": ["Menh de a", "Menh de b", "Menh de c", "Menh de d"],
      "answer": ["D", "S", "D", "S"]
    },
    {
      "number": 9,
      "type": "short_answer",
      "prompt": "Noi dung cau tra loi ngan/dien khuyet",
      "answer": "Dap an ngan"
    },
    {
      "number": 10,
      "type": "essay",
      "prompt": "Noi dung cau tu luan",
      "answerGuide": "Goi y dap an",
      "rubric": [
        { "content": "Y 1", "points": 0.5 },
        { "content": "Y 2", "points": 0.5 }
      ]
    }
  ]
}

CHI TRA VE JSON OBJECT DUY NHAT.`;
};

const renderAnswerCellValue = (question: GeneratedExamQuestion) => {
  if (question.type === 'multiple_choice') {
    return typeof question.answer === 'string' ? question.answer : '';
  }
  if (question.type === 'true_false') {
    return Array.isArray(question.answer) ? question.answer.join(', ') : '';
  }
  if (question.type === 'short_answer') {
    return typeof question.answer === 'string' ? question.answer : '';
  }
  return 'TL';
};

const buildAnswerTablesHtml = (questions: GeneratedExamQuestion[]) => {
  const chunks: GeneratedExamQuestion[][] = [];

  for (let index = 0; index < questions.length; index += 10) {
    chunks.push(questions.slice(index, index + 10));
  }

  return chunks.map((chunk) => `
    <table class="answer-table">
      <tr>
        <th>Câu</th>
        ${chunk.map((question) => `<th>${question.number}</th>`).join('')}
      </tr>
      <tr>
        <th>Đáp án</th>
        ${chunk.map((question) => `<td>${escapeHtml(renderAnswerCellValue(question))}</td>`).join('')}
      </tr>
    </table>
  `).join('<div class="answer-table-spacer"></div>');
};

const renderQuestionHtml = (question: GeneratedExamQuestion) => {
  if (question.type === 'multiple_choice') {
    return `
      <div class="question-block">
        <p><span class="question-number">Câu ${question.number}.</span> ${escapeHtml(question.prompt)}</p>
        <div class="options">
          ${question.options?.map((option, index) => `<div class="option-item">${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</div>`).join('') || ''}
        </div>
      </div>
    `;
  }

  if (question.type === 'true_false') {
    return `
      <div class="question-block">
        <p><span class="question-number">Câu ${question.number}.</span> ${escapeHtml(question.prompt)}</p>
        <div class="statements">
          ${question.statements?.map((statement, index) => `<div class="statement-item">${String.fromCharCode(97 + index)}) ${escapeHtml(statement)}</div>`).join('') || ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="question-block">
      <p><span class="question-number">Câu ${question.number}.</span> ${escapeHtml(question.prompt)}</p>
    </div>
  `;
};

const buildScoringGuideHtml = (questions: GeneratedExamQuestion[]) => {
  const shortAnswerGuides = questions.filter((question) => question.type === 'short_answer');
  const essayGuides = questions.filter((question) => question.type === 'essay');

  if (shortAnswerGuides.length === 0 && essayGuides.length === 0) {
    return '';
  }

  const shortAnswerHtml = shortAnswerGuides.length > 0
    ? `
      <div class="guide-group">
        <h4>Đáp án câu trả lời ngắn</h4>
        ${shortAnswerGuides.map((question) => `<p><strong>Câu ${question.number}:</strong> ${escapeHtml(typeof question.answer === 'string' ? question.answer : '')}</p>`).join('')}
      </div>
    `
    : '';

  const essayHtml = essayGuides.length > 0
    ? `
      <div class="guide-group">
        <h4>Hướng dẫn chấm tự luận</h4>
        ${essayGuides.map((question) => `
          <div class="essay-guide">
            <p><strong>Câu ${question.number}.</strong> ${escapeHtml(question.answerGuide || 'Xem rubric bên dưới.')}</p>
            ${question.rubric && question.rubric.length > 0 ? `
              <table class="rubric-table">
                <tr>
                  <th>Nội dung</th>
                  <th>Điểm</th>
                </tr>
                ${question.rubric.map((item) => `
                  <tr>
                    <td class="text-left">${escapeHtml(item.content)}</td>
                    <td>${formatScore(item.points)}</td>
                  </tr>
                `).join('')}
              </table>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `
    : '';

  return `
    <h3>HƯỚNG DẪN CHẤM</h3>
    ${shortAnswerHtml}
    ${essayHtml}
  `;
};

const buildExamHtmlFromStructuredQuestions = (
  questions: GeneratedExamQuestion[],
  subject: string,
  examType: string,
  duration: number,
  questionRanges: QuestionRange[],
) => {
  const sectionsHtml = questionRanges
    .map((range, index) => ({ range, type: QUESTION_TYPE_SEQUENCE[index], roman: ROMAN_NUMERALS[index] || `${index + 1}` }))
    .filter((item) => item.range.total > 0)
    .map((item) => {
      const sectionQuestions = questions.filter((question) => question.number >= item.range.start && question.number <= item.range.end);

      return `
        <section class="exam-section">
          <h4>PHẦN ${item.roman}. ${QUESTION_SECTION_TITLES[item.type]}</h4>
          ${sectionQuestions.map((question) => renderQuestionHtml(question)).join('')}
        </section>
      `;
    }).join('');
  const fallbackSectionsHtml = QUESTION_TYPE_SEQUENCE
    .map((type, index) => ({ type, roman: ROMAN_NUMERALS[index] || `${index + 1}` }))
    .map((item) => {
      const sectionQuestions = questions.filter((question) => question.type === item.type);
      if (sectionQuestions.length === 0) {
        return '';
      }

      return `
        <section class="exam-section">
          <h4>PHẦN ${item.roman}. ${QUESTION_SECTION_TITLES[item.type]}</h4>
          ${sectionQuestions.map((question) => renderQuestionHtml(question)).join('')}
        </section>
      `;
    }).join('');
  const finalSectionsHtml = sectionsHtml || fallbackSectionsHtml;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Đề kiểm tra ${escapeHtml(examType)} - ${escapeHtml(subject)}</title>
  <style>
    body { font-family: "Times New Roman", serif; font-size: 13pt; line-height: 1.5; color: #000; margin: 20px; }
    h2, h3, h4 { text-align: center; font-weight: bold; margin: 12px 0; }
    .exam-meta { margin-bottom: 12px; }
    .exam-meta p { margin: 4px 0; }
    .question-block { margin-bottom: 12px; }
    .question-number { font-weight: bold; }
    .options, .statements { margin-left: 22px; }
    .option-item, .statement-item { margin-bottom: 4px; }
    .exam-section { margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid black; padding: 5px; text-align: center; vertical-align: top; word-break: break-word; }
    th { font-weight: bold; }
    .text-left { text-align: left; }
    .answer-table-spacer { height: 12px; }
    .guide-group { margin-top: 12px; }
    .essay-guide { margin-top: 12px; }
  </style>
</head>
<body>
  <h2>ĐỀ KIỂM TRA ${escapeHtml(examType.toUpperCase())} - ${escapeHtml(subject.toUpperCase())}</h2>
  <div class="exam-meta">
    <p><strong>NĂM HỌC 20... - 20...</strong></p>
    <p><strong>TRƯỜNG THPT .......................</strong></p>
    <p><strong>Thời gian làm bài:</strong> ${duration} phút</p>
    <p><strong>Họ và tên:</strong> ............................................. <strong>SBD:</strong> ............................</p>
  </div>
  ${finalSectionsHtml}
  <h3>ĐÁP ÁN</h3>
  ${buildAnswerTablesHtml(questions)}
  ${buildScoringGuideHtml(questions)}
</body>
</html>`;
};

const isQuarterStep = (value: number) => Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;

const describeRowConfig = (row: ExamStructureRow) =>
  STRUCTURE_LEVELS.map(
    ({ key, label }) => `${label} ${row[key].count} câu x ${formatScore(row[key].score)} điểm/câu`,
  ).join(', ');

const sanitizeGeneratedHtml = (html: string) =>
  html.replace(/```html\n?/gi, '').replace(/```\n?/g, '').trim();

const normalizeForParsing = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const extractExpectedQuestionCountFromHtml = (html: string) => {
  const normalizedText = normalizeForParsing(htmlToPlainText(html));
  const totalMatches = [...normalizedText.matchAll(/tong so cau[^0-9]{0,30}(\d+)/g)];

  if (totalMatches.length > 0) {
    return Number(totalMatches[totalMatches.length - 1][1]) || 0;
  }

  return countQuestionsInGeneratedExam(html);
};

const extractHtmlDocumentFromResponse = (responseText: string) => {
  const sanitized = sanitizeGeneratedHtml(responseText);
  const lower = sanitized.toLowerCase();
  const startCandidates = [
    lower.indexOf('<!doctype html'),
    lower.indexOf('<html'),
    lower.indexOf('<body'),
  ].filter((index) => index >= 0);

  if (startCandidates.length === 0) {
    return sanitized;
  }

  const start = Math.min(...startCandidates);
  const endHtml = lower.lastIndexOf('</html>');
  const endBody = lower.lastIndexOf('</body>');

  if (endHtml >= 0) {
    return sanitized.slice(start, endHtml + '</html>'.length).trim();
  }

  if (endBody >= 0) {
    return sanitized.slice(start, endBody + '</body>'.length).trim();
  }

  return sanitized.slice(start).trim();
};

const HTML_LIKE_DOCUMENT_REGEX = /<(?:!doctype|html|body|table|div|section|main)\b/i;
const MAX_PREVIEW_SOURCE_LENGTH = 24_000;
const MAX_PREVIEW_TEXT_LENGTH = 6_000;
const PREVIEW_IMAGE_WIDTH = 1200;
const PREVIEW_IMAGE_HEIGHT = 1700;
const PREVIEW_LINE_HEIGHT = 24;
const PREVIEW_MAX_LINES = 58;
const PREVIEW_MAX_CHARS_PER_LINE = 82;

const prepareImportedHtmlDocument = (rawContent: string) => {
  const extracted = extractHtmlDocumentFromResponse(rawContent);

  return extracted
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .trim();
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizePreviewText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

const buildWorkingHtmlFromImport = (html: string, title: string) => {
  const text = sanitizePreviewText(htmlToPlainText(html))
    .slice(0, MAX_IMPORTED_WORKING_TEXT_LENGTH)
    .trim();

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
};

const wrapPreviewText = (value: string, maxCharsPerLine: number) => {
  const lines: string[] = [];
  const paragraphs = sanitizePreviewText(value).replace(/\r/g, '').split('\n');

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();

    if (!trimmedParagraph) {
      if (lines[lines.length - 1] !== '') {
        lines.push('');
      }
      continue;
    }

    const words = trimmedParagraph.split(/\s+/).filter(Boolean);
    let currentLine = '';

    for (const word of words) {
      if (word.length > maxCharsPerLine) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }

        for (let index = 0; index < word.length; index += maxCharsPerLine) {
          lines.push(word.slice(index, index + maxCharsPerLine));
        }
        continue;
      }

      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length > maxCharsPerLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
};


const buildSafePreviewImageUrl = (rawContent: string, title: string) => {
  if (!rawContent) return '';
  return '';

  const prepared = prepareImportedHtmlDocument(rawContent);
  const limitedSource = prepared.slice(0, MAX_PREVIEW_SOURCE_LENGTH);
  const sourceWasTrimmed = prepared.length > MAX_PREVIEW_SOURCE_LENGTH;

  const previewText = sanitizePreviewText(htmlToPlainText(limitedSource)).slice(0, MAX_PREVIEW_TEXT_LENGTH);
  const textLines = wrapPreviewText(previewText, PREVIEW_MAX_CHARS_PER_LINE);
  const contentLines = textLines.slice(0, PREVIEW_MAX_LINES - (sourceWasTrimmed ? 4 : 2));
  const pageX = 40;
  const pageY = 32;
  const pageWidth = PREVIEW_IMAGE_WIDTH - 80;
  const pageHeight = PREVIEW_IMAGE_HEIGHT - 64;
  const contentStartY = pageY + 120;



  const previewNotice = sourceWasTrimmed
    ? '<div class="preview-note">Bản xem trước đã được rút gọn để tránh lỗi bộ nhớ.</div>'
    : '';

  const contentMarkup = contentLines.map((line, index) => {
    const y = contentStartY + index * PREVIEW_LINE_HEIGHT;
    return `<text x="${pageX + 34}" y="${y}" font-family="Times New Roman, serif" font-size="13pt" fill="#111827">${escapeHtml(line || ' ')}</text>`;
  }).join('');

  const trimNoticeMarkup = sourceWasTrimmed
    ? `<text x="${pageX + 34}" y="${pageY + 84}" font-family="Arial, sans-serif" font-size="11pt" fill="#9a3412">Ban xem truoc da duoc rut gon de tranh loi bo nho.</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_IMAGE_WIDTH}" height="${PREVIEW_IMAGE_HEIGHT}" viewBox="0 0 ${PREVIEW_IMAGE_WIDTH} ${PREVIEW_IMAGE_HEIGHT}">
  <title>${escapeHtml(title)}</title>
  <rect x="0" y="0" width="${PREVIEW_IMAGE_WIDTH}" height="${PREVIEW_IMAGE_HEIGHT}" fill="#e5e7eb" />
  <rect x="${pageX}" y="${pageY}" width="${pageWidth}" height="${pageHeight}" rx="18" fill="#ffffff" stroke="#cbd5e1" />
  <text x="${PREVIEW_IMAGE_WIDTH / 2}" y="${pageY + 48}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18pt" font-weight="700" fill="#111827">${escapeHtml(title)}</text>
  ${trimNoticeMarkup}
  <line x1="${pageX + 32}" y1="${pageY + 96}" x2="${pageX + pageWidth - 32}" y2="${pageY + 96}" stroke="#e5e7eb" stroke-width="1" />
  ${contentMarkup}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const buildSafePreviewExcerpt = (rawContent: string) => {
  if (!rawContent) return '';

  const prepared = prepareImportedHtmlDocument(rawContent);
  return sanitizePreviewText(
    htmlToPlainText(prepared.slice(0, MAX_PREVIEW_SOURCE_LENGTH)),
  ).slice(0, MAX_PREVIEW_TEXT_LENGTH);
};

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });

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

const sumLessonCountsByQuestionType = (
  lessonRequirements: LessonMatrixRequirement[],
  questionType: GeneratedQuestionType,
) =>
  lessonRequirements.reduce((acc, lesson) => {
    const levels = lesson.countsByType[questionType];
    STRUCTURE_LEVELS.forEach(({ key }) => {
      acc[key] += levels[key];
    });
    return acc;
  }, createEmptyLevelCountMap());

const buildExamQuestionRangesFromLessonRequirements = (
  lessonRequirements: LessonMatrixRequirement[],
) => {
  let currentQuestion = 1;

  return QUESTION_TYPE_SEQUENCE.map((questionType, index) => {
    const levels = sumLessonCountsByQuestionType(lessonRequirements, questionType);
    const total = sumLevelCountMap(levels);
    const label = DEFAULT_EXAM_STRUCTURE[index]?.label || QUESTION_TYPE_PROMPT_LABELS[questionType];

    if (total <= 0) {
      return { label, total: 0, start: 0, end: 0 };
    }

    const range = {
      label,
      total,
      start: currentQuestion,
      end: currentQuestion + total - 1,
    };

    currentQuestion += total;
    return range;
  });
};

const buildExamTypeRequirementsFromLessonRequirements = (
  lessonRequirements: LessonMatrixRequirement[],
  questionRanges: QuestionRange[],
) => QUESTION_TYPE_SEQUENCE.map((questionType, index) => {
  const levels = sumLessonCountsByQuestionType(lessonRequirements, questionType);
  const total = sumLevelCountMap(levels);
  const label = DEFAULT_EXAM_STRUCTURE[index]?.label || QUESTION_TYPE_PROMPT_LABELS[questionType];
  const range = questionRanges[index];

  if (!range || total <= 0) {
    return `- ${label}: 0 câu, phải bỏ hoàn toàn dạng này khỏi đề.`;
  }

  return `- ${label}: ${total} câu, đánh số từ Câu ${range.start} đến Câu ${range.end}. Chi tiết mức độ: ${formatLessonLevelBreakdown(levels)}.`;
}).join('\n');

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

const extractLessonRequirementsFromMatrix = (
  matrixHtml: string,
  selectedLessonItems: SelectedLessonSummary[],
  includeEssay: boolean,
): LessonMatrixRequirement[] => {
  if (!matrixHtml || selectedLessonItems.length === 0 || typeof DOMParser === 'undefined') {
    return [];
  }

  const doc = new DOMParser().parseFromString(matrixHtml, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr'));
  const activeTypes = includeEssay ? QUESTION_TYPE_SEQUENCE : QUESTION_TYPE_SEQUENCE.slice(0, 3);
  const requiredValueCells = activeTypes.length * STRUCTURE_LEVELS.length;
  const lessonRequirements: LessonMatrixRequirement[] = [];
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

    const countsByType = {
      multiple_choice: createEmptyLevelCountMap(),
      true_false: createEmptyLevelCountMap(),
      short_answer: createEmptyLevelCountMap(),
      essay: createEmptyLevelCountMap(),
    } satisfies Record<GeneratedQuestionType, LevelCountMap>;

    activeTypes.forEach((questionType, typeIndex) => {
      const levelCells = valueCells.slice(
        typeIndex * STRUCTURE_LEVELS.length,
        (typeIndex + 1) * STRUCTURE_LEVELS.length,
      );

      STRUCTURE_LEVELS.forEach(({ key }, levelIndex) => {
        countsByType[questionType][key] = extractIntegerFromCell(levelCells[levelIndex] || '');
      });
    });

    lessonRequirements.push({
      chapterName: currentLesson.chapterName,
      lessonName: currentLesson.lessonName,
      countsByType,
    });

    lessonCursor += 1;
  });

  return lessonRequirements;
};

const assignQuestionNumbersToLessonRequirements = (
  lessonRequirements: LessonMatrixRequirement[],
  questionRanges: QuestionRange[],
): AssignedLessonRequirement[] => {
  const assignedLessons = lessonRequirements.map((lesson) => ({
    chapterName: lesson.chapterName,
    lessonName: lesson.lessonName,
    assignments: [] as LessonQuestionAssignment[],
    totalQuestions: 0,
  }));

  QUESTION_TYPE_SEQUENCE.forEach((questionType, typeIndex) => {
    const range = questionRanges[typeIndex];
    if (!range || range.total <= 0) return;

    let currentQuestion = range.start;

    assignedLessons.forEach((assignedLesson, lessonIndex) => {
      const levels = lessonRequirements[lessonIndex]?.countsByType[questionType] || createEmptyLevelCountMap();
      const total = sumLevelCountMap(levels);
      if (total <= 0) return;

      const numbers = Array.from({ length: total }, (_, index) => currentQuestion + index);
      assignedLesson.assignments.push({
        type: questionType,
        start: currentQuestion,
        end: currentQuestion + total - 1,
        numbers,
        total,
        levels: { ...levels },
      });
      assignedLesson.totalQuestions += total;
      currentQuestion += total;
    });
  });

  return assignedLessons.filter((lesson) => lesson.totalQuestions > 0);
};

const buildLessonBreakdownFromMatrix = (
  matrixHtml: string,
  selectedLessonItems: SelectedLessonSummary[],
  includeEssay: boolean,
) => {
  return extractLessonRequirementsFromMatrix(matrixHtml, selectedLessonItems, includeEssay)
    .map((lesson) => {
      const summaryParts = QUESTION_TYPE_SEQUENCE
        .filter((questionType, index) => includeEssay || index < 3)
        .map((questionType, index) => {
          const levelParts = EXAM_PROMPT_LEVEL_LABELS.map((levelLabel, levelIndex) => {
            const count = lesson.countsByType[questionType][STRUCTURE_LEVELS[levelIndex].key];
            return count > 0 ? `${count} cau ${levelLabel}` : '';
          }).filter(Boolean);

          return levelParts.length > 0 ? `${EXAM_PROMPT_TYPE_LABELS[index]}: ${levelParts.join(', ')}` : '';
        })
        .filter(Boolean);

      return summaryParts.length > 0 ? `- ${lesson.lessonName}: ${summaryParts.join('; ')}.` : '';
    })
    .filter(Boolean)
    .join('\n');
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
  const matrixPreviewImageUrl = useMemo(
    () => (matrixHtml ? buildSafePreviewImageUrl(matrixHtml, 'Ma trận đề thi') : ''),
    [matrixHtml],
  );
  const specsPreviewImageUrl = useMemo(
    () => (specsHtml ? buildSafePreviewImageUrl(specsHtml, 'Bảng đặc tả') : ''),
    [specsHtml],
  );
  const examPreviewImageUrl = useMemo(
    () => (examHtml ? buildSafePreviewImageUrl(examHtml, 'Đề thi hoàn chỉnh') : ''),
    [examHtml],
  );

  const matrixPreviewExcerpt = useMemo(
    () => (currentStep === 2 && matrixHtml ? buildSafePreviewExcerpt(matrixHtml) : ''),
    [currentStep, matrixHtml],
  );
  const specsPreviewExcerpt = useMemo(
    () => (currentStep === 3 && specsHtml ? buildSafePreviewExcerpt(specsHtml) : ''),
    [currentStep, specsHtml],
  );
  const examPreviewExcerpt = useMemo(
    () => (currentStep === 4 && examHtml ? buildSafePreviewExcerpt(examHtml) : ''),
    [currentStep, examHtml],
  );

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
    await waitForNextPaint();
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
      const cleanHtml = extractHtmlDocumentFromResponse(result);
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

  const importHtmlLikeDocument = (
    target: 'matrix' | 'specs',
    label: 'ma trận' | 'đặc tả',
  ) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const normalizedFileName = file.name.toLowerCase();

        if (normalizedFileName.endsWith('.doc')) {
          Swal.fire({
            title: 'Chưa hỗ trợ upload .doc',
            text: `File .doc chỉ phù hợp để mở bằng Word. Với phần ${label}, vui lòng dùng nút "Tải HTML" rồi upload lại file .html.`,
            icon: 'warning',
            confirmButtonColor: '#2dd4a8',
            background: '#132a1f',
            color: '#e2e8f0',
          });
          return;
        }

        if (file.size > 3 * 1024 * 1024) {
          Swal.fire({
            title: 'File quá lớn',
            text: `File ${label} vượt quá giới hạn an toàn 3MB để xem trước trong trình duyệt.`,
            icon: 'warning',
            confirmButtonColor: '#2dd4a8',
            background: '#132a1f',
            color: '#e2e8f0',
          });
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const rawContent = String(reader.result || '');
          const normalizedHtml = prepareImportedHtmlDocument(rawContent);

          if (!HTML_LIKE_DOCUMENT_REGEX.test(normalizedHtml)) {
            Swal.fire({
              title: 'File chưa hỗ trợ',
              text: `Chỉ nên upload file HTML hoặc file .doc do ứng dụng này xuất ra cho phần ${label}.`,
              icon: 'warning',
              confirmButtonColor: '#2dd4a8',
              background: '#132a1f',
              color: '#e2e8f0',
            });
            return;
          }

          const workingHtml = buildWorkingHtmlFromImport(
            normalizedHtml,
            target === 'matrix' ? 'Ma trận đề thi' : 'Bảng đặc tả đề thi',
          );

          if (target === 'matrix') {
            setMatrixHtml(workingHtml);
          } else {
            setSpecsHtml(workingHtml);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleUploadMatrix = () => {
    importHtmlLikeDocument('matrix', 'ma trận');
  };

  const handleUploadSpecs = () => {
    importHtmlLikeDocument('specs', 'đặc tả');
  };

  const handleGenerateSpecs = async () => {
    if (!matrixHtml) return;
    setIsGenerating(true);
    await waitForNextPaint();
    try {
      const compactMatrixHtml = compactHtmlForPrompt(matrixHtml);
      const prompt = `Dựa trên Ma trận đề kiểm tra sau, hãy tạo BẢNG ĐẶC TẢ ĐỀ KIỂM TRA (Full HTML Document).

MA TRẬN ĐẦU VÀO (đã rút gọn):
${compactMatrixHtml}

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
      const cleanHtml = extractHtmlDocumentFromResponse(result);
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
    setExamHtml('');
    setIsGenerating(true);
    await waitForNextPaint();
    try {
      const configuredQuestionCount = totalConfiguredQuestions;
      const fallbackQuestionCount = Math.max(
        extractExpectedQuestionCountFromHtml(specsHtml),
        extractExpectedQuestionCountFromHtml(matrixHtml),
      );
      let effectiveQuestionCount = configuredQuestionCount > 0 ? configuredQuestionCount : fallbackQuestionCount;

      if (effectiveQuestionCount <= 0) {
        throw new Error('Không xác định được tổng số câu từ cấu hình hiện tại hoặc file đặc tả. Vui lòng nhập cấu hình đề hoặc upload đặc tả/ma trận có đủ dòng tổng số câu.');
      }

      let examQuestionRanges = configuredQuestionCount > 0 ? buildExamQuestionRanges(examStructure) : [];
      const compactSpecsHtml = compactHtmlForPrompt(specsHtml);
      let activeQuestionTypes = examQuestionRanges.filter((item) => item.total > 0);
      const selectedLessonItems: SelectedLessonSummary[] = chapters.flatMap((chapter) =>
        chapter.lessons
          .filter((lesson) => selectedLessons.has(lesson.id))
          .map((lesson) => ({ chapterName: chapter.name, lessonName: lesson.name })),
      );
      const includeEssay = configuredQuestionCount > 0
        ? calculateRowTotals(examStructure[3]).count > 0
        : /tu luan|tự luận/i.test(htmlToPlainText(specsHtml));
      let examTypeRequirements = configuredQuestionCount > 0
        ? buildExamTypeRequirements(examStructure)
        : '- Follow the exact question distribution that already appears in the uploaded specification table.';
      let questionChecklist = buildQuestionChecklist(effectiveQuestionCount);
      const lessonBreakdownPrompt = buildLessonBreakdownFromMatrix(matrixHtml, selectedLessonItems, includeEssay);
      const lessonRequirements = extractLessonRequirementsFromMatrix(matrixHtml, selectedLessonItems, includeEssay);
      if (configuredQuestionCount <= 0) {
        const derivedQuestionRanges = buildExamQuestionRangesFromLessonRequirements(lessonRequirements);
        const derivedQuestionCount = derivedQuestionRanges.reduce((sum, item) => sum + item.total, 0);

        if (derivedQuestionCount > 0) {
          examQuestionRanges = derivedQuestionRanges;
          activeQuestionTypes = examQuestionRanges.filter((item) => item.total > 0);
          effectiveQuestionCount = derivedQuestionCount;
          examTypeRequirements = buildExamTypeRequirementsFromLessonRequirements(lessonRequirements, examQuestionRanges);
          questionChecklist = buildQuestionChecklist(effectiveQuestionCount);
        }
      }
      const assignedLessonRequirements = assignQuestionNumbersToLessonRequirements(lessonRequirements, examQuestionRanges);
      const questionRangePrompt = activeQuestionTypes.length > 0
        ? activeQuestionTypes.map((item) => `- ${item.label}: ${item.total} câu, đánh số từ Câu ${item.start} đến Câu ${item.end}`).join('\n')
        : '- Use the uploaded specification table as the source of truth for question counts and numbering.';

      const shouldUseSingleCallPrompt = true;
      if (shouldUseSingleCallPrompt) {
        const singlePassPrompt = buildSinglePassStructuredPromptV2(
          compactSpecsHtml,
          examTypeRequirements,
          assignedLessonRequirements,
          effectiveQuestionCount,
          questionChecklist,
          questionRangePrompt,
        );

        const singlePassResult = await callGeminiAI(singlePassPrompt, apiKey, model, {
          temperature: 0,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
        });

        const structuredValidation = validateStructuredExamPayload(singlePassResult, effectiveQuestionCount, examQuestionRanges);
        if (!structuredValidation.isComplete) {
          console.error('Single-pass exam generation failed', {
            reason: structuredValidation.summary,
            assignedLessonRequirements,
          });
          throw new Error('AI chưa tạo đủ đề theo đúng cấu trúc yêu cầu. Vui lòng bấm tạo lại.');
        }
        const cleanHtml = buildExamHtmlFromStructuredQuestions(
          structuredValidation.questions,
          monHoc,
          loaiKiemTra,
          thoiGian,
          examQuestionRanges,
        );


        setExamHtml(cleanHtml);
        setCurrentStep(4);
        return;
      }

      if (assignedLessonRequirements.length > 0) {
        const lessonQuestions: GeneratedExamQuestion[] = [];
        let lessonPipelineFailed = false;
        let lessonPipelineFeedback = '';

        for (const lessonRequirement of assignedLessonRequirements) {
          let lessonSuccess = false;
          let lessonFeedback = '';

          for (let attempt = 1; attempt <= 3; attempt += 1) {
            const prompt = buildLessonStructuredPrompt(
              compactSpecsHtml,
              lessonRequirement,
              lessonFeedback,
            );

            try {
              const result = await callGeminiAI(prompt, apiKey, model, {
                temperature: attempt === 1 ? 0.1 : 0,
                maxOutputTokens: 32768,
                responseMimeType: 'application/json',
              });

              const lessonValidation = validateLessonStructuredPayload(result, lessonRequirement);
              lessonFeedback = lessonValidation.summary;

              if (!lessonValidation.isComplete) {
                continue;
              }

              lessonQuestions.push(...lessonValidation.questions);
              lessonSuccess = true;
              break;
            } catch (attemptError: any) {
              lessonFeedback = attemptError?.message || `Không tạo được bài ${lessonRequirement.lessonName}.`;
            }
          }

          if (!lessonSuccess) {
            lessonPipelineFailed = true;
            lessonPipelineFeedback = `${lessonRequirement.lessonName}: ${lessonFeedback || 'không tạo đủ câu'}`;
            console.error('Lesson exam generation failed', {
              lessonRequirement,
              lessonFeedback,
            });
            break;
          }
        }

        if (!lessonPipelineFailed) {
          const normalizedQuestions = lessonQuestions.sort((a, b) => a.number - b.number);
          const lessonFullValidation = validateStructuredExamPayload(
            JSON.stringify({ questions: normalizedQuestions }),
            effectiveQuestionCount,
            examQuestionRanges,
          );

          if (lessonFullValidation.isComplete) {
            const cleanHtml = buildExamHtmlFromStructuredQuestions(
              lessonFullValidation.questions,
              monHoc,
              loaiKiemTra,
              thoiGian,
              examQuestionRanges,
            );

            const questionContentValidation = validateQuestionContentCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
            const answerKeyValidation = validateAnswerKeyCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);

            if (questionContentValidation.isComplete && answerKeyValidation.isComplete) {
              setExamHtml(cleanHtml);
              setCurrentStep(4);
              return;
            }

            console.error('Lesson pipeline rendered exam validation failed', {
              questionSummary: questionContentValidation.summary,
              answerSummary: answerKeyValidation.summary,
            });
          } else {
            lessonPipelineFeedback = lessonFullValidation.summary;
            console.error('Lesson pipeline combined validation failed', {
              summary: lessonFullValidation.summary,
            });
          }
        }

        console.warn('Lesson pipeline failed, falling back to type-based generation', {
          lessonPipelineFeedback,
        });
      }

      if (activeQuestionTypes.length > 0) {
        const combinedQuestions: GeneratedExamQuestion[] = [];
        let chunkPipelineFailed = false;
        let lastStructuredIssue = '';
        let lastQuestionIssue = '';
        let lastAnswerIssue = '';

        for (const range of activeQuestionTypes) {
          const expectedType = getExpectedQuestionType(range.start, examQuestionRanges);
          if (!expectedType) continue;

          let chunkSuccess = false;
          let chunkFeedback = '';

          for (let attempt = 1; attempt <= 3; attempt += 1) {
            const prompt = buildStructuredChunkPrompt(
              compactSpecsHtml,
              lessonBreakdownPrompt,
              examTypeRequirements,
              range,
              expectedType,
              chunkFeedback,
            );

            try {
              const result = await callGeminiAI(prompt, apiKey, model, {
                temperature: attempt === 1 ? 0.1 : 0,
                maxOutputTokens: 32768,
                responseMimeType: 'application/json',
              });

              const chunkValidation = validateStructuredExamChunkPayload(result, range, expectedType);
              chunkFeedback = chunkValidation.summary;

              if (!chunkValidation.isComplete) {
                continue;
              }

              combinedQuestions.push(...chunkValidation.questions);
              chunkSuccess = true;
              break;
            } catch (attemptError: any) {
              chunkFeedback = attemptError?.message || `Không tạo được nhóm câu ${range.start}-${range.end}.`;
            }
          }

          if (!chunkSuccess) {
            lastStructuredIssue = `${QUESTION_TYPE_PROMPT_LABELS[expectedType]} (${range.start}-${range.end}): ${chunkFeedback || 'không tạo đủ câu'}`;
            console.error('Chunk exam generation failed', {
              range,
              expectedType,
              chunkFeedback,
            });
            chunkPipelineFailed = true;
            break;
          }
        }

        if (!chunkPipelineFailed) {
          const normalizedQuestions = combinedQuestions.sort((a, b) => a.number - b.number);
          const fullValidation = validateStructuredExamPayload(
            JSON.stringify({ questions: normalizedQuestions }),
            effectiveQuestionCount,
            examQuestionRanges,
          );

          if (fullValidation.isComplete) {
            const cleanHtml = buildExamHtmlFromStructuredQuestions(
              fullValidation.questions,
              monHoc,
              loaiKiemTra,
              thoiGian,
              examQuestionRanges,
            );

            const questionContentValidation = validateQuestionContentCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
            lastQuestionIssue = questionContentValidation.summary;
            const answerKeyValidation = validateAnswerKeyCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
            lastAnswerIssue = answerKeyValidation.summary;

            if (questionContentValidation.isComplete && answerKeyValidation.isComplete) {
              setExamHtml(cleanHtml);
              setCurrentStep(4);
              return;
            }

            console.error('Rendered exam validation failed', {
              lastStructuredIssue,
              lastQuestionIssue,
              lastAnswerIssue,
            });
          } else {
            lastStructuredIssue = fullValidation.summary;
            console.error('Combined structured exam validation failed', {
              summary: fullValidation.summary,
              effectiveQuestionCount,
              examQuestionRanges,
            });
          }
        }

        console.warn('Structured chunk pipeline failed, falling back to broader generation', {
          lastStructuredIssue,
          lastQuestionIssue,
          lastAnswerIssue,
        });
      }

      const structuredBasePrompt = `Dựa trên Bảng đặc tả (HTML) sau, hãy tạo DỮ LIỆU CÂU HỎI CHUẨN HÓA cho đề kiểm tra.

BẢNG ĐẶC TẢ:
${compactSpecsHtml}

CẤU TRÚC BẮT BUỘC:
- Tổng số câu toàn đề: ${effectiveQuestionCount}
${questionRangePrompt}

PHÂN BỔ CHI TIẾT TỪNG DẠNG:
${examTypeRequirements}

${lessonBreakdownPrompt ? `PHÂN BỔ CHI TIẾT THEO TỪNG BÀI:
${lessonBreakdownPrompt}

Nếu một bài không xuất hiện trong danh sách trên thì KHÔNG được tạo câu hỏi từ bài đó.
` : ''}

CHỈ TRẢ VỀ JSON OBJECT, KHÔNG markdown, KHÔNG HTML, KHÔNG giải thích.
Mỗi câu phải là câu thật, có nội dung hoàn chỉnh, không được placeholder, không được dấu "...".
Không được bỏ sót câu trắc nghiệm 1 đáp án và không được bỏ sót câu trả lời ngắn.

Schema bắt buộc:
{
  "questions": [
    {
      "number": 1,
      "type": "multiple_choice",
      "prompt": "Nội dung câu hỏi",
      "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
      "answer": "A"
    },
    {
      "number": 8,
      "type": "true_false",
      "prompt": "Đề dẫn",
      "statements": ["Mệnh đề a", "Mệnh đề b", "Mệnh đề c", "Mệnh đề d"],
      "answer": ["Đ", "S", "Đ", "S"]
    },
    {
      "number": 12,
      "type": "short_answer",
      "prompt": "Nội dung câu trả lời ngắn/điền khuyết",
      "answer": "Đáp án ngắn"
    },
    {
      "number": 15,
      "type": "essay",
      "prompt": "Nội dung câu tự luận",
      "answerGuide": "Gợi ý đáp án",
      "rubric": [
        { "content": "Ý 1", "points": 0.5 },
        { "content": "Ý 2", "points": 0.5 }
      ]
    }
  ]
}

QUY TẮC JSON:
- Phải có đúng ${effectiveQuestionCount} phần tử trong mảng "questions".
- Số thứ tự phải chạy liên tục và đầy đủ: ${questionChecklist}.
- "type" chỉ được dùng một trong 4 giá trị: "multiple_choice", "true_false", "short_answer", "essay".
- Đúng dải số câu nào thì phải dùng đúng type của dải đó, không được đổi.
- Với dải trắc nghiệm 1 đáp án: mỗi câu bắt buộc có đủ 4 lựa chọn A, B, C, D.
- Với dải đúng/sai: mỗi câu bắt buộc có đủ 4 mệnh đề a, b, c, d và 4 đáp án tương ứng.
- Với dải trả lời ngắn: mỗi câu bắt buộc có prompt đầy đủ và answer ngắn chính xác.
- Với dải tự luận: phải có answerGuide hoặc rubric.
- Mọi chuỗi phải bằng tiếng Việt và không được rỗng.`;

      let structuredGeneratedQuestionCount = 0;
      let structuredQuestionFeedback = '';
      let structuredQuestionContentFeedback = '';
      let structuredAnswerKeyFeedback = '';

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const retryPrompt = attempt === 1
          ? structuredBasePrompt
          : `${structuredBasePrompt}

LẦN THỬ ${attempt}:
- Ở lần trước bạn mới tạo được ${structuredGeneratedQuestionCount}/${effectiveQuestionCount} câu hợp lệ.
- Dữ liệu câu hỏi lần trước: ${structuredQuestionFeedback || 'chưa đủ dữ liệu để đánh giá'}.
- Phần thân đề lần trước: ${structuredQuestionContentFeedback || 'chưa đủ dữ liệu để đánh giá'}.
- Bảng đáp án lần trước: ${structuredAnswerKeyFeedback || 'chưa đủ dữ liệu để đánh giá'}.
- Hãy tạo lại TOÀN BỘ mảng "questions" từ đầu, không sửa chắp vá.
- Tuyệt đối không bỏ sót câu trắc nghiệm 1 đáp án và câu trả lời ngắn.`;

        try {
          const result = await callGeminiAI(retryPrompt, apiKey, model, {
            temperature: attempt === 1 ? 0.1 : 0,
            maxOutputTokens: 32768,
            responseMimeType: 'application/json',
          });

          const structuredValidation = validateStructuredExamPayload(result, effectiveQuestionCount, examQuestionRanges);
          structuredGeneratedQuestionCount = structuredValidation.presentQuestionCount;
          structuredQuestionFeedback = structuredValidation.summary;

          if (!structuredValidation.isComplete) {
            continue;
          }

          const cleanHtml = buildExamHtmlFromStructuredQuestions(
            structuredValidation.questions,
            monHoc,
            loaiKiemTra,
            thoiGian,
            examQuestionRanges,
          );

          const questionContentValidation = validateQuestionContentCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
          structuredQuestionContentFeedback = questionContentValidation.summary;
          const answerKeyValidation = validateAnswerKeyCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
          structuredAnswerKeyFeedback = answerKeyValidation.summary;

          if (questionContentValidation.isComplete && answerKeyValidation.isComplete) {
            setExamHtml(cleanHtml);
            setCurrentStep(4);
            return;
          }
        } catch (attemptError: any) {
          structuredQuestionFeedback = attemptError?.message || 'AI không trả về JSON hợp lệ.';
        }
      }

      console.error('Exam generation validation failed', {
        structuredQuestionFeedback,
        structuredQuestionContentFeedback,
        structuredAnswerKeyFeedback,
        effectiveQuestionCount,
        examQuestionRanges,
      });
      console.warn('Falling back to legacy HTML generation pipeline');

      const basePrompt = `Dựa trên Bảng đặc tả (HTML) sau, hãy soạn ĐỀ THI HOÀN CHỈNH và HƯỚNG DẪN CHẤM.

BẢNG ĐẶC TẢ:
${compactSpecsHtml}

CẤU TRÚC SỐ CÂU BẮT BUỘC PHẢI KHỚP 100%:
- Tổng số câu toàn đề: ${effectiveQuestionCount}
${questionRangePrompt}

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
- Phải tạo ĐÚNG ${effectiveQuestionCount} câu, không nhiều hơn, không ít hơn.
- Đánh số câu liên tục từ 1 đến ${effectiveQuestionCount}.
- Nếu một dạng có 0 câu thì KHÔNG được tạo dạng đó.
- Bảng đáp án cuối bài phải đủ đúng ${effectiveQuestionCount} câu.
- Mỗi câu từ 1 đến ${effectiveQuestionCount} phải xuất hiện đầy đủ trong PHẦN THÂN ĐỀ trước mục Đáp án/Hướng dẫn chấm; không được chỉ xuất hiện số câu ở bảng đáp án.
- Với dải câu 1 lựa chọn phải có đủ 4 phương án A, B, C, D cho từng câu.
- Với dải câu trả lời ngắn/điền khuyết phải có đề bài hoàn chỉnh cho từng câu, không được để trống hoặc ghi placeholder.
- Chỉ có các trường thông tin đầu đề sau: Trường, Năm học, Thời gian làm bài, Họ và tên, SBD. KHÔNG thêm trường khác như "SĐK".
- KHÔNG được chỉ viết vài câu mẫu, KHÔNG được bỏ dở giữa chừng, KHÔNG được dùng dấu "..." để thay cho câu hỏi còn thiếu.
- Phải viết đầy đủ nội dung cho toàn bộ ${effectiveQuestionCount} câu trong cùng một tài liệu HTML.
- Do not reveal analysis, self-correction, reasoning steps, or prompt interpretation. Output only the final HTML document.

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
   - Tuyệt đối KHÔNG để trống bất kỳ ô đáp án nào.
   - Với câu 1 lựa chọn: ô đáp án chỉ ghi đúng 1 ký tự A/B/C/D.
   - Với câu Đúng/Sai: ô đáp án phải ghi đủ 4 mệnh đề, ví dụ "Đ, S, Đ, S".
   - Với câu trả lời ngắn/điền khuyết: ô đáp án phải ghi đáp án ngắn chính xác (số, công thức, từ hoặc cụm từ), không được dùng "...".
   - Với câu tự luận: ô đáp án ghi "TL" hoặc "Xem HD chấm", đồng thời phần hướng dẫn chấm phải có thang điểm chi tiết.
   - Nếu trong cùng một bảng có lẫn nhiều dạng câu thì vẫn phải điền đúng định dạng đáp án cho từng câu tương ứng.

Format câu hỏi:
- Trắc nghiệm: Câu X. Nội dung -> A. B. C. D.
- Đúng/Sai: Câu X. Đề dẫn -> a) Mệnh đề 1 b) Mệnh đề 2 c) Mệnh đề 3 d) Mệnh đề 4. Mỗi câu có 4 mệnh đề, mỗi mệnh đề Đúng hoặc Sai, mỗi mệnh đề đúng được 0.25 điểm (tổng 1 câu = 1.0 điểm).
- Trả lời ngắn: Câu X. Nội dung
- Tự luận: Câu X. Nội dung (nếu có)
- Không được gom nhiều số câu vào một dòng tóm tắt. Mỗi câu phải có nội dung riêng, nhìn thấy rõ trong phần đề.

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
      let questionContentFeedback = '';
      let answerKeyFeedback = '';

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const retryPrompt = attempt === 1
          ? basePrompt
          : `${basePrompt}

LẦN THỬ ${attempt}:
- Ở lần trước bạn mới tạo được ${generatedQuestionCount}/${effectiveQuestionCount} câu.
- Phần thân đề lần trước: ${questionContentFeedback || 'chưa đủ dữ liệu để đánh giá'}.
- Bảng đáp án lần trước: ${answerKeyFeedback || 'chưa đủ dữ liệu để đánh giá'}.
- Hãy tạo lại TOÀN BỘ đề từ đầu, không sửa chắp vá.
- Chỉ dừng khi đã có đủ từ Câu 1 đến Câu ${effectiveQuestionCount}.
- Nếu thiếu bất kỳ câu nào, hãy tiếp tục viết cho đến khi đủ.
- Ở phần thân đề, bắt buộc phải có đủ câu thật cho tất cả các số câu từ 1 đến Câu ${effectiveQuestionCount}; không được để thiếu câu trắc nghiệm 1 đáp án hay câu trả lời ngắn.
- Ở phần đáp án cuối bài, bắt buộc phải điền đủ đáp án cho tất cả các câu từ 1 đến Câu ${effectiveQuestionCount}; không được để trống ô nào, nhất là câu trắc nghiệm 1 đáp án và câu trả lời ngắn.`;

        const result = await callGeminiAI(retryPrompt, apiKey, model, {
          temperature: attempt === 1 ? 0.1 : 0,
          maxOutputTokens: 32768,
        });

        cleanHtml = extractHtmlDocumentFromResponse(result);

        if (!/<(?:!doctype|html|body|table|div|section|main)\b/i.test(cleanHtml)) {
          throw new Error('AI không trả về HTML hợp lệ. Vui lòng bấm tạo lại.');
        }

        const questionContentValidation = validateQuestionContentCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
        generatedQuestionCount = questionContentValidation.presentQuestionCount;
        questionContentFeedback = questionContentValidation.summary;
        const answerKeyValidation = validateAnswerKeyCoverage(cleanHtml, effectiveQuestionCount, examQuestionRanges);
        answerKeyFeedback = answerKeyValidation.summary;

        if (questionContentValidation.isComplete && answerKeyValidation.isComplete) {
          setExamHtml(cleanHtml);
          setCurrentStep(4);
          return;
        }
      }

      throw new Error(`Đề thi AI chưa đạt sau 3 lần thử. Phần thân đề gần nhất: ${questionContentFeedback}. Bảng đáp án gần nhất: ${answerKeyFeedback}. Vui lòng bấm tạo lại.`);
    } catch (error: any) {
      setExamHtml('');
      console.error('Generate exam error:', error);
      const rawMessage = typeof error?.message === 'string' ? error.message : '';
      const safeUserMessage = toUserFacingExamGenerationErrorMessage(rawMessage);
      const userMessage = rawMessage || 'Không thể tạo đề thi ở lần này. Vui lòng thử lại.';
      Swal.fire({
        title: 'Chưa tạo được đề',
        text: safeUserMessage || userMessage,
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
              <Upload size={13} /> Upload HTML Ma trận
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
            <div className="bg-slate-950 rounded-xl overflow-auto h-[650px] border border-border">
              <pre className="whitespace-pre-wrap break-words p-5 text-[13px] leading-6 text-slate-200 font-mono">
                {matrixPreviewExcerpt || 'Ban xem truoc da duoc tat de tranh loi bo nho. Hay dung nut Tai HTML neu can xem day du.'}
              </pre>
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
              <Upload size={13} /> Upload HTML Đặc tả
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
            <div className="bg-slate-950 rounded-xl overflow-auto h-[650px] border border-border">
              <pre className="whitespace-pre-wrap break-words p-5 text-[13px] leading-6 text-slate-200 font-mono">
                {specsPreviewExcerpt || 'Ban xem truoc da duoc tat de tranh loi bo nho. Hay dung nut Tai HTML neu can xem day du.'}
              </pre>
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
            <div className="bg-slate-950 rounded-xl overflow-auto h-[650px] border border-border">
              <pre className="whitespace-pre-wrap break-words p-5 text-[13px] leading-6 text-slate-200 font-mono">
                {examPreviewExcerpt || 'Ban xem truoc da duoc tat de tranh loi bo nho. Hay dung nut Tai HTML neu can xem day du.'}
              </pre>
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
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">AI</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight uppercase">
                Tạo Đề Thi Theo CV 7991
              </h1>
              <div className="mt-1 flex items-center gap-2 text-[11px] sm:text-xs text-slate-400">
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  Build {APP_BUILD_NAME}
                </span>
                <span className="hidden sm:inline">Nếu chưa thấy mã build mới, hãy tải lại app.</span>
              </div>
            </div>
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
