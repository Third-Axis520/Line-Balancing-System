export interface PPTSlide {
  slideNumber: number;
  title: string;
  subTitle?: string;
  paragraphs: string[];
  bulletPoints?: string[];
  tables?: { headers: string[]; rows: string[][] }[];
  images: string[]; // URLs of preview images/screenshots belonging to this slide
  slideImageUrl?: string; // Full-fidelity rendered slide image URL (16:9 exact slide layout)
  notes?: string;
}

export interface PPTItem {
  id: string;
  title: string;
  originalFileName: string;
  fileSize: number; // in bytes
  fileUrl: string;
  category: string;
  version: string;
  uploader: string;
  uploadDate: string;
  updateDate: string;
  description: string;
  slideCount?: number;
  imageCount: number;
  images: string[]; // URLs of preview images/extracted slide pictures
  slides?: PPTSlide[]; // Detailed slide content
  downloadCount: number;
  isPinned?: boolean;
  targetDepartment?: string;
  tags: string[];
}

export interface AuthState {
  isAuthenticated: boolean;
  username: string;
  role: 'admin' | 'planner' | 'guest';
}

export type CategoryType = 
  | '全部'
  | '现场陈列与美陈'
  | '活动执行与动线'
  | '舞台声光与舞美'
  | '视觉设计与物料'
  | '安全与应急预案'
  | '培训与销售指导';
