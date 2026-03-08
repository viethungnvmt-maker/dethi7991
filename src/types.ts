/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CognitiveLevel = 'Biết' | 'Hiểu' | 'Vận dụng';

export interface Subject {
  id: string;
  name: string;
  grade: string;
  semester: string;
  year: string;
}

export interface PPCTItem {
  id: string;
  lesson: string;
  topic: string;
  period: number;
}

export interface MatrixConfig {
  topicId: string;
  levels: Record<CognitiveLevel, number>; // Number of questions per level
}

export interface Question {
  id: string;
  topic: string;
  content: string;
  type: 'Multiple Choice' | 'Short Answer' | 'Essay';
  options?: string[];
  correctAnswer: string;
  explanation: string;
  level: CognitiveLevel;
}

export interface Exam {
  id: string;
  subjectId: string;
  title: string;
  duration: number;
  matrix: MatrixConfig[];
  questions: Question[];
  createdAt: string;
}

export interface AppData {
  subjects: Subject[];
  ppct: Record<string, PPCTItem[]>; // subjectId -> items
  exams: Exam[];
  settings: {
    apiKey: string;
    model: string;
    theme: 'light' | 'dark';
  };
}
