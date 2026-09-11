import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import JSZip from "jszip";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { createServer as createViteServer } from "vite";
import { AuthDependencies, AuthFailure, createEntraAuth, EntraIdentity } from "./server/auth.js";

export interface CreateAppOptions {
  dataDir: string;
  uploadsDir: string;
  auth?: AuthDependencies;
}

const appLifecycles = new WeakMap<express.Express, {
  generateSeedDataIfEmpty: () => Promise<void>;
  ensureSlidesParsed: () => Promise<void>;
}>();

export function createApp(options: CreateAppOptions): express.Express {
const app = express();

// Directories
const DATA_DIR = options.dataDir;
const UPLOADS_DIR = options.uploadsDir;
const PPTS_DIR = path.join(UPLOADS_DIR, "ppts");
const PREVIEWS_DIR = path.join(UPLOADS_DIR, "previews");
const DB_FILE = path.join(DATA_DIR, "ppts.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");

// Ensure directories exist
for (const dir of [DATA_DIR, UPLOADS_DIR, PPTS_DIR, PREVIEWS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const authDependencies = options.auth ?? createEntraAuth();
const parsedEmployeeCacheTtlSeconds = Number.parseInt(process.env.EMPLOYEE_CACHE_TTL_SECONDS ?? "", 10);
const employeeCacheTtlMs = (Number.isInteger(parsedEmployeeCacheTtlSeconds) && parsedEmployeeCacheTtlSeconds >= 0
  ? parsedEmployeeCacheTtlSeconds
  : 3600) * 1000;
const employeeCache = new Map<string, { employee: import("./server/auth.js").DirectoryEmployee; expiresAt: number; syncedAt: string }>();
const directoryRefreshes = new Map<string, number>();
type RoleConfig = { admins: string[]; planners: string[] };
function loadRoleConfig(): RoleConfig {
  if (!fs.existsSync(AUTH_FILE)) return { admins: [], planners: [] };
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    if (raw && typeof raw === "object") {
      const config = raw as { admins?: unknown; planners?: unknown };
      if (Array.isArray(config.admins) && Array.isArray(config.planners)
        && config.admins.every(value => typeof value === "string") && config.planners.every(value => typeof value === "string")) {
        return { admins: config.admins, planners: config.planners };
      }
    }
  } catch {
    console.error("Failed to read auth.json roles.");
  }
  return { admins: [], planners: [] };
}
let roleConfig: RoleConfig = loadRoleConfig();

// Multer storage for PPT files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PPTS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `ppt-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB max for rich image PPTs
  }
});

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static files for uploads
app.use("/uploads", express.static(UPLOADS_DIR));

// Helper: Read and save PPT DB
interface StoredPPTSlide {
  slideNumber: number;
  title: string;
  subTitle?: string;
  paragraphs: string[];
  bulletPoints?: string[];
  tables?: { headers: string[]; rows: string[][] }[];
  images: string[];
  slideImageUrl?: string;
  notes?: string;
}

interface StoredPPT {
  id: string;
  title: string;
  originalFileName: string;
  storedFileName: string;
  fileSize: number;
  fileUrl: string;
  category: string;
  version: string;
  uploader: string;
  uploadDate: string;
  updateDate: string;
  description: string;
  slideCount?: number;
  imageCount: number;
  images: string[];
  slides?: StoredPPTSlide[];
  downloadCount: number;
  isPinned?: boolean;
  targetDepartment?: string;
  tags: string[];
}

function getPPTs(): StoredPPT[] {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function savePPTs(items: StoredPPT[]) {
  fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2), "utf-8");
}

function decodeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

// Extract full slide content (titles, text, tables, and images) from .pptx using JSZip
async function extractPptxContent(
  filePath: string,
  pptId: string
): Promise<{ images: string[]; slideCount: number; slides: StoredPPTSlide[] }> {
  const images: string[] = [];
  const slides: StoredPPTSlide[] = [];
  const mediaMap: Record<string, string> = {};

  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    const targetDir = path.join(PREVIEWS_DIR, pptId);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Extract media images
    let imgIdx = 1;
    const mediaFiles: { name: string; file: JSZip.JSZipObject }[] = [];
    zip.forEach((relativePath, file) => {
      if (
        relativePath.startsWith("ppt/media/") &&
        !file.dir &&
        /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(relativePath)
      ) {
        mediaFiles.push({ name: relativePath, file });
      }
    });

    mediaFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const item of mediaFiles) {
      const ext = path.extname(item.name) || ".png";
      const outFileName = `img_${imgIdx}${ext}`;
      const outPath = path.join(targetDir, outFileName);
      const content = await item.file.async("nodebuffer");
      fs.writeFileSync(outPath, content);
      const publicUrl = `/uploads/previews/${pptId}/${outFileName}`;
      images.push(publicUrl);
      const baseName = path.basename(item.name);
      mediaMap[baseName] = publicUrl;
      imgIdx++;
    }

    // 2. Extract slides in numerical order
    const slideEntries: { path: string; num: number }[] = [];
    zip.forEach((relativePath) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideEntries.push({ path: relativePath, num: parseInt(match[1], 10) });
      }
    });
    slideEntries.sort((a, b) => a.num - b.num);

    for (const entry of slideEntries) {
      const xml = await zip.file(entry.path)!.async("string");
      let title = "";
      const paragraphs: string[] = [];
      const tables: { headers: string[]; rows: string[][] }[] = [];

      // Extract shapes: <p:sp>
      const shapeRegex = /<p:sp[\s\S]*?<\/p:sp>/g;
      let shapeMatch: RegExpExecArray | null;
      while ((shapeMatch = shapeRegex.exec(xml)) !== null) {
        const shapeXml = shapeMatch[0];
        const isTitleShape = /<p:ph[^>]*type="(title|ctrTitle)"/i.test(shapeXml);

        const pRegex = /<a:p[\s\S]*?<\/a:p>/g;
        let pMatch: RegExpExecArray | null;
        while ((pMatch = pRegex.exec(shapeXml)) !== null) {
          const pXml = pMatch[0];
          const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
          let tMatch: RegExpExecArray | null;
          let pText = "";
          while ((tMatch = tRegex.exec(pXml)) !== null) {
            pText += tMatch[1];
          }
          pText = decodeXml(pText).trim();
          if (pText) {
            if (isTitleShape && !title) {
              title = pText;
            } else {
              paragraphs.push(pText);
            }
          }
        }
      }

      // Extract tables: <a:tbl>
      const tblRegex = /<a:tbl[\s\S]*?<\/a:tbl>/g;
      let tblMatch: RegExpExecArray | null;
      while ((tblMatch = tblRegex.exec(xml)) !== null) {
        const tblXml = tblMatch[0];
        const rows: string[][] = [];
        const trRegex = /<a:tr[\s\S]*?<\/a:tr>/g;
        let trMatch: RegExpExecArray | null;
        while ((trMatch = trRegex.exec(tblXml)) !== null) {
          const trXml = trMatch[0];
          const row: string[] = [];
          const tcRegex = /<a:tc[\s\S]*?<\/a:tc>/g;
          let tcMatch: RegExpExecArray | null;
          while ((tcMatch = tcRegex.exec(trXml)) !== null) {
            const tcXml = tcMatch[0];
            const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
            let tMatch: RegExpExecArray | null;
            let cellText = "";
            while ((tMatch = tRegex.exec(tcXml)) !== null) {
              cellText += tMatch[1];
            }
            row.push(decodeXml(cellText).trim());
          }
          if (row.some((c) => Boolean(c))) rows.push(row);
        }
        if (rows.length > 0) {
          tables.push({ headers: rows[0], rows: rows.slice(1) });
        }
      }

      // Fallback text if no shapes matched
      if (paragraphs.length === 0 && !title) {
        const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = tRegex.exec(xml)) !== null) {
          const t = decodeXml(tMatch[1]).trim();
          if (t) paragraphs.push(t);
        }
      }

      if (!title && paragraphs.length > 0) {
        title = paragraphs.shift() || "";
      }

      // Locate images embedded in this slide via rels
      const slideImages: string[] = [];
      const relPath = `ppt/slides/_rels/slide${entry.num}.xml.rels`;
      const relFile = zip.file(relPath);
      if (relFile) {
        const relXml = await relFile.async("string");
        const targetRegex = /Target="(\.\.\/media\/[^"]+)"/g;
        let targetMatch: RegExpExecArray | null;
        while ((targetMatch = targetRegex.exec(relXml)) !== null) {
          const baseName = path.basename(targetMatch[1]);
          if (mediaMap[baseName] && !slideImages.includes(mediaMap[baseName])) {
            slideImages.push(mediaMap[baseName]);
          }
        }
      }

      slides.push({
        slideNumber: entry.num,
        title: title || `幻灯片 ${entry.num}`,
        paragraphs,
        tables: tables.length > 0 ? tables : undefined,
        images: slideImages
      });
    }

    // 3. Render exact slides with 100% fidelity using LibreOffice + pdftoppm
    const renderedSlideUrls: string[] = [];
    try {
      const tempDir = path.join("/tmp", `conv_${pptId}_${Date.now()}`);
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      try {
        execSync(`soffice --headless --convert-to pdf --outdir "${tempDir}" "${filePath}"`, {
          stdio: "ignore",
          timeout: 45000
        });

        const pdfFiles = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
        if (pdfFiles.length > 0) {
          const pdfPath = path.join(tempDir, pdfFiles[0]);
          execSync(`pdftoppm -png -r 150 "${pdfPath}" "${targetDir}/slide"`, {
            stdio: "ignore",
            timeout: 45000
          });

          const slideFiles = fs
            .readdirSync(targetDir)
            .filter((f) => /^slide-\d+\.png$/i.test(f))
            .sort((a, b) => {
              const na = parseInt(a.replace(/\D/g, ""), 10);
              const nb = parseInt(b.replace(/\D/g, ""), 10);
              return na - nb;
            });

          for (const sf of slideFiles) {
            renderedSlideUrls.push(`/uploads/previews/${pptId}/${sf}`);
          }
        }
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    } catch (renderErr) {
      console.warn("LibreOffice rendering warning:", renderErr);
    }

    // Attach rendered slide images to each slide
    if (renderedSlideUrls.length > 0) {
      for (let i = 0; i < renderedSlideUrls.length; i++) {
        const slideUrl = renderedSlideUrls[i];
        if (slides[i]) {
          slides[i].slideImageUrl = slideUrl;
          if (!slides[i].images || slides[i].images.length === 0) {
            slides[i].images = [slideUrl];
          }
        } else {
          slides.push({
            slideNumber: i + 1,
            title: `幻灯片 ${i + 1}`,
            paragraphs: [],
            images: [slideUrl],
            slideImageUrl: slideUrl
          });
        }
      }
      // Replace images list with full rendered slides
      images.length = 0;
      images.push(...renderedSlideUrls);
    }
  } catch (err) {
    console.error("Error extracting PPTX content:", err);
  }

  return {
    images,
    slideCount: slides.length || 1,
    slides
  };
}

// Backwards-compatible wrapper
async function extractPptxImages(filePath: string, pptId: string) {
  const result = await extractPptxContent(filePath, pptId);
  return { images: result.images, slideCount: result.slideCount, slides: result.slides };
}

// Auto-populate slides for existing stored files
async function ensureSlidesParsed() {
  try {
    const ppts = getPPTs();
    let modified = false;

    for (const ppt of ppts) {
      const targetDir = path.join(PREVIEWS_DIR, ppt.id);
      
      // Check if rendered slides exist on disk
      if (fs.existsSync(targetDir)) {
        const slideFiles = fs
          .readdirSync(targetDir)
          .filter((f) => /^slide-\d+\.(png|svg)$/i.test(f))
          .sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ""), 10);
            const nb = parseInt(b.replace(/\D/g, ""), 10);
            return na - nb;
          });

        if (slideFiles.length > 0) {
          const slideUrls = slideFiles.map((f) => `/uploads/previews/${ppt.id}/${f}`);
          
          if (!ppt.images || ppt.images.length !== slideUrls.length || ppt.images[0] !== slideUrls[0]) {
            ppt.images = slideUrls;
            ppt.imageCount = slideUrls.length;
            modified = true;
          }

          if (ppt.slides && ppt.slides.length > 0) {
            ppt.slides.forEach((s, idx) => {
              if (slideUrls[idx] && s.slideImageUrl !== slideUrls[idx]) {
                s.slideImageUrl = slideUrls[idx];
                modified = true;
              }
            });
          }
        }
      }

      // If slides are missing entirely, parse from file
      if (!ppt.slides || ppt.slides.length === 0) {
        const pptFile = path.join(PPTS_DIR, ppt.storedFileName);
        if (fs.existsSync(pptFile) && ppt.originalFileName.toLowerCase().endsWith(".pptx")) {
          console.log(`Extracting slides for ${ppt.title}...`);
          const extracted = await extractPptxContent(pptFile, ppt.id);
          if (extracted.slides && extracted.slides.length > 0) {
            ppt.slides = extracted.slides;
            ppt.slideCount = extracted.slideCount;
            if (extracted.images.length > 0) {
              ppt.images = extracted.images;
              ppt.imageCount = extracted.images.length;
            }
            modified = true;
          }
        }
      }
    }

    if (modified) {
      savePPTs(ppts);
      console.log("Successfully verified and backfilled slide contents into ppts.json");
    }
  } catch (err) {
    console.error("Failed in ensureSlidesParsed:", err);
  }
}

// Generate realistic seed PPTX files if none exist
async function generateSeedDataIfEmpty() {
  const existing = getPPTs();
  if (existing.length > 0) return;

  console.log("Initializing sample planning PPT files...");

  // Generate SVG-based demonstration graphic slide buffers
  function createSlideSvg(title: string, sub: string, tag: string, color: string): Buffer {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <circle cx="1100" cy="150" r="300" fill="${color}" opacity="0.12"/>
      <circle cx="200" cy="650" r="240" fill="#38bdf8" opacity="0.08"/>
      
      <!-- Top Bar -->
      <rect x="80" y="60" width="1120" height="4" fill="url(#accent)"/>
      <rect x="80" y="80" rx="8" ry="8" width="140" height="36" fill="${color}" opacity="0.25"/>
      <text x="150" y="104" fill="${color}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${tag}</text>
      
      <!-- Slide Content -->
      <text x="80" y="240" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="800">${title}</text>
      <text x="80" y="300" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500">${sub}</text>

      <!-- Decorative Content Cards representing images -->
      <rect x="80" y="360" rx="16" ry="16" width="340" height="260" fill="#1e293b" stroke="#334155" stroke-width="2"/>
      <rect x="100" y="380" rx="8" ry="8" width="300" height="150" fill="${color}" opacity="0.2"/>
      <circle cx="250" cy="455" r="30" fill="${color}" opacity="0.5"/>
      <text x="250" y="570" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle">现场实拍陈列效果图 A</text>

      <rect x="470" y="360" rx="16" ry="16" width="340" height="260" fill="#1e293b" stroke="#334155" stroke-width="2"/>
      <rect x="490" y="380" rx="8" ry="8" width="300" height="150" fill="#38bdf8" opacity="0.2"/>
      <polygon points="640,420 670,470 610,470" fill="#38bdf8" opacity="0.6"/>
      <text x="640" y="570" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle">动线人流与展位测绘图</text>

      <rect x="860" y="360" rx="16" ry="16" width="340" height="260" fill="#1e293b" stroke="#334155" stroke-width="2"/>
      <rect x="880" y="380" rx="8" ry="8" width="300" height="150" fill="#10b981" opacity="0.2"/>
      <text x="1030" y="465" fill="#10b981" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">100% 验收标准</text>
      <text x="1030" y="570" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle">灯光与安全规范图解</text>
    </svg>`;
    return Buffer.from(svg, "utf-8");
  }

  // Helper to build a valid minimal PPTX containing embedded SVG/PNG image media
  async function buildSamplePptx(
    id: string,
    fileName: string,
    slideDetails: { title: string; sub: string; tag: string; color: string }[]
  ) {
    const zip = new JSZip();
    const pptDir = path.join(PREVIEWS_DIR, id);
    if (!fs.existsSync(pptDir)) fs.mkdirSync(pptDir, { recursive: true });

    const previewUrls: string[] = [];

    // [Content_Types].xml
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`
    );

    // _rels/.rels
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
    );

    // ppt/presentation.xml
    zip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" />`
    );

    // Write image media and preview slides
    for (let i = 0; i < slideDetails.length; i++) {
      const s = slideDetails[i];
      const svgBuffer = createSlideSvg(s.title, s.sub, s.tag, s.color);
      const imgFileName = `slide_img_${i + 1}.svg`;
      zip.file(`ppt/media/${imgFileName}`, svgBuffer);
      zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`);

      // Also save to previews dir for lightning-fast client preview
      fs.writeFileSync(path.join(pptDir, imgFileName), svgBuffer);
      previewUrls.push(`/uploads/previews/${id}/${imgFileName}`);
    }

    const pptxBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const filePath = path.join(PPTS_DIR, fileName);
    fs.writeFileSync(filePath, pptxBuffer);

    return {
      fileSize: pptxBuffer.length,
      slideCount: slideDetails.length,
      imageCount: slideDetails.length,
      images: previewUrls
    };
  }

  const sample1 = await buildSamplePptx("sample-1", "2026全国春季新品发布会-现场陈列与展台动线全案.pptx", [
    { title: "展厅主入口与中庭门面陈列规范", sub: "主视觉发光字定位与第一视角焦点陈列方案", tag: "展厅主入口", color: "#f59e0b" },
    { title: "A区核心展台动线与互动打卡区", sub: "人流动线宽度要求大于2.4米，设置双向引导指示", tag: "展台动线", color: "#6366f1" },
    { title: "B区物料堆头与灯箱实景打样对比", sub: "严禁遮挡消防疏散标识，灯带色温统一4000K", tag: "物料打样", color: "#10b981" },
    { title: "VIP洽谈区与休息体验空间布置", sub: "软装沙发间距、绿植摆放与产品体验桌规格", tag: "VIP体验", color: "#ec4899" },
    { title: "收尾撤展与物料清点回收清单", sub: "现场大屏与桁架拆卸顺序图示及安全防护规范", tag: "撤展标准", color: "#0ea5e9" }
  ]);

  const sample2 = await buildSamplePptx("sample-2", "Q2商场端午节主题美陈及快闪店执行方案.pptx", [
    { title: "中庭大型美陈装置施工结构与安全承重", sub: "吊装钢丝绳锚固点分布图与地面承重荷载核算", tag: "主题美陈", color: "#14b8a6" },
    { title: "快闪店货架陈列与试饮试吃操作台规范", sub: "食品级操作台面防护、下水管路隐蔽施工指引", tag: "快闪店规范", color: "#8b5cf6" },
    { title: "全场导视系统与地贴定位放线图", sub: "商场电梯口、B1直梯、停车场主出入口导视分布", tag: "导视系统", color: "#f97316" },
    { title: "现场早晚班巡检与灯光照度抽检标准", sub: "每日10:00前完成展陈通电检测与互动装置复位", tag: "巡检要点", color: "#06b6d4" }
  ]);

  const sample3 = await buildSamplePptx("sample-3", "大型路演现场应急预案与疏散通道部署指引.pptx", [
    { title: "现场红线范围与紧急疏散通道平面图", sub: "主备用通道双路通畅标准，严禁任何物料占用通道", tag: "通道规划", color: "#ef4444" },
    { title: "应急医疗点与防暴装备物资放置位点", sub: "配电房、音控台、舞台后区灭火器与医药箱定位", tag: "安全物资", color: "#f43f5e" },
    { title: "突发人流拥挤与天气突变应急响应流转", sub: "企划总指挥、安保组、现场执行组三方联动呼叫频段", tag: "指挥流转", color: "#eab308" }
  ]);

  const sample4 = await buildSamplePptx("sample-4", "品牌视觉VI物料规范与舞台声光电参数指导.pptx", [
    { title: "舞台LED主屏与侧翼地屏分辨率及色域", sub: "P2.5高清大屏色温校正标准，主屏分辨率3840x2160", tag: "舞美大屏", color: "#3b82f6" },
    { title: "音响设备吊挂点位与声场均匀覆盖图", sub: "主扩线阵列音箱倾角与返听音箱现场走线保护", tag: "音响声场", color: "#a855f7" },
    { title: "打光重点：新品展示台面洗墙光与轮廓光", sub: "面光灯色温5600K，CRI>95，避免展品反光与阴影", tag: "灯光工程", color: "#e11d48" }
  ]);

  const initialItems: StoredPPT[] = [
    {
      id: "sample-1",
      title: "2026全国春季新品发布会-现场陈列与展台动线全案",
      originalFileName: "2026全国春季新品发布会-现场陈列与展台动线全案.pptx",
      storedFileName: "2026全国春季新品发布会-现场陈列与展台动线全案.pptx",
      fileSize: sample1.fileSize,
      fileUrl: "/api/ppts/sample-1/download",
      category: "现场陈列与美陈",
      version: "v2.3 (终版审定)",
      uploader: "全国企划部 - 林主管",
      uploadDate: "2026-09-01 14:30",
      updateDate: "2026-09-02 18:15",
      description: "包含主入口形象、A/B区展位立体效果图、灯光照射角度规范、展品距离地面高度及人流动线图示。请现场督导与执行员工严格按照P12-P18页面尺寸实操。",
      slideCount: sample1.slideCount,
      imageCount: sample1.imageCount,
      images: sample1.images,
      downloadCount: 128,
      isPinned: true,
      targetDepartment: "现场执行组 / 陈列督导组",
      tags: ["重点项目", "展位动线", "春季发布会", "高精度效果图"]
    },
    {
      id: "sample-2",
      title: "Q2商场端午节主题美陈及快闪店执行方案",
      originalFileName: "Q2商场端午节主题美陈及快闪店执行方案.pptx",
      storedFileName: "Q2商场端午节主题美陈及快闪店执行方案.pptx",
      fileSize: sample2.fileSize,
      fileUrl: "/api/ppts/sample-2/download",
      category: "活动执行与动线",
      version: "v1.8",
      uploader: "商业企划科 - 张经理",
      uploadDate: "2026-08-28 09:20",
      updateDate: "2026-08-30 11:00",
      description: "包含商场中庭巨型美陈安装顺序、快闪店冷链物料摆放、早晚巡检点位、垃圾回收流线与互动打卡点标识。现场员工免登录即可直接扫码下载或在线查看图纸。",
      slideCount: sample2.slideCount,
      imageCount: sample2.imageCount,
      images: sample2.images,
      downloadCount: 94,
      isPinned: true,
      targetDepartment: "商场现场营运部",
      tags: ["节日美陈", "快闪店", "巡检标准", "端午特展"]
    },
    {
      id: "sample-3",
      title: "大型路演现场应急预案与疏散通道部署指引",
      originalFileName: "大型路演现场应急预案与疏散通道部署指引.pptx",
      storedFileName: "大型路演现场应急预案与疏散通道部署指引.pptx",
      fileSize: sample3.fileSize,
      fileUrl: "/api/ppts/sample-3/download",
      category: "安全与应急预案",
      version: "v3.0",
      uploader: "企划安保协调小组",
      uploadDate: "2026-08-25 16:40",
      updateDate: "2026-08-25 16:40",
      description: "所有进场员工上岗前必须掌握的疏散路线与消防站位图。包含突发人流限流闸机布置、医疗急救点位置、现场总控对讲频段分配表。",
      slideCount: sample3.slideCount,
      imageCount: sample3.imageCount,
      images: sample3.images,
      downloadCount: 165,
      isPinned: false,
      targetDepartment: "全员必备 / 安保应急组",
      tags: ["安全必看", "应急通道", "消防规范", "对讲通讯"]
    },
    {
      id: "sample-4",
      title: "品牌视觉VI物料规范与舞台声光电参数指导",
      originalFileName: "品牌视觉VI物料规范与舞台声光电参数指导.pptx",
      storedFileName: "品牌视觉VI物料规范与舞台声光电参数指导.pptx",
      fileSize: sample4.fileSize,
      fileUrl: "/api/ppts/sample-4/download",
      category: "舞台声光与舞美",
      version: "v1.2",
      uploader: "视觉设计企划 - 陈工",
      uploadDate: "2026-08-20 10:15",
      updateDate: "2026-08-22 17:30",
      description: "舞台LED主屏色彩校准参数、线阵列音响指向性分布、重点展品洗墙灯照射角度、摄影背景板防反光喷绘材质要求及打光示意图。",
      slideCount: sample4.slideCount,
      imageCount: sample4.imageCount,
      images: sample4.images,
      downloadCount: 78,
      isPinned: false,
      targetDepartment: "舞美搭建组 / 摄影摄像组",
      tags: ["舞台灯光", "VI物料", "屏幕校色", "工程参数"]
    }
  ];

  savePPTs(initialItems);
  console.log("Sample PPTs created successfully.");
}

function sendAuthFailure(res: express.Response, failure: AuthFailure) {
  return res.status(failure.status).json({ code: failure.code, message: failure.message });
}

function isListed(values: string[], identity: EntraIdentity) {
  return values.some(value => value === identity.oid);
}

function bootstrapAdmins() {
  return (process.env.SUPER_USER_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
}

function appRole(identity: EntraIdentity): "admin" | "planner" | "reader" {
  roleConfig = loadRoleConfig();
  if (isListed(roleConfig.admins, identity) || bootstrapAdmins().includes(identity.preferredUsername.toLowerCase())) return "admin";
  return isListed(roleConfig.planners, identity) ? "planner" : "reader";
}

const ROLE_LOCK_RETRIES = 25;
const ROLE_LOCK_RETRY_MS = 20;
const STALE_ROLE_LOCK_MS = 5_000;

function pause(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function reclaimStaleRoleLock(lockFile: string): Promise<boolean> {
  let record: { timestamp?: unknown; token?: unknown };
  try {
    record = JSON.parse(await fs.promises.readFile(lockFile, "utf-8")) as { timestamp?: unknown; token?: unknown };
  } catch {
    return false;
  }
  if (typeof record.timestamp !== "number" || typeof record.token !== "string" || Date.now() - record.timestamp < STALE_ROLE_LOCK_MS) return false;
  const quarantinedLock = `${lockFile}.stale.${randomUUID()}`;
  try {
    await fs.promises.rename(lockFile, quarantinedLock);
    await fs.promises.unlink(quarantinedLock);
    return true;
  } catch {
    await fs.promises.unlink(quarantinedLock).catch(() => undefined);
    return false;
  }
}

async function ownsRoleLock(lockFile: string, token: string): Promise<boolean> {
  try {
    const record = JSON.parse(await fs.promises.readFile(lockFile, "utf-8")) as { token?: unknown };
    return record.token === token;
  } catch {
    return false;
  }
}

async function assertRoleLockOwnership(lockFile: string, token: string) {
  if (await ownsRoleLock(lockFile, token)) return;
  // The lock was reclaimed or otherwise lost before this writer could commit.
  throw new AuthFailure(503, "ROLE_UPDATE_UNAVAILABLE", "Role configuration is temporarily unavailable.");
}

async function mutateRoleConfig(mutator: (current: RoleConfig) => RoleConfig): Promise<RoleConfig> {
  const lockFile = `${AUTH_FILE}.lock`;
  let lock: fs.promises.FileHandle | undefined;
  let temporaryFile: string | undefined;
  const lockToken = randomUUID();
  try {
    for (let attempt = 0; attempt < ROLE_LOCK_RETRIES; attempt++) {
      try {
        lock = await fs.promises.open(lockFile, "wx");
        await lock.writeFile(JSON.stringify({ pid: process.pid, timestamp: Date.now(), token: lockToken }), "utf-8");
        break;
      } catch (error) {
        if (!(error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "EEXIST")) throw error;
        if (await reclaimStaleRoleLock(lockFile)) continue;
        await pause(ROLE_LOCK_RETRY_MS);
      }
    }
    if (!lock) throw new AuthFailure(503, "ROLE_UPDATE_UNAVAILABLE", "Role configuration is temporarily unavailable.");
    const next = mutator(loadRoleConfig());
    temporaryFile = `${AUTH_FILE}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(temporaryFile, JSON.stringify(next, null, 2), "utf-8");
    await assertRoleLockOwnership(lockFile, lockToken);
    await fs.promises.rename(temporaryFile, AUTH_FILE);
    temporaryFile = undefined;
    roleConfig = next;
    return next;
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    throw new AuthFailure(503, "ROLE_UPDATE_UNAVAILABLE", "Role configuration is temporarily unavailable.");
  } finally {
    if (temporaryFile) await fs.promises.unlink(temporaryFile).catch(() => undefined);
    if (lock) await lock.close().catch(() => undefined);
    if (lock && await ownsRoleLock(lockFile, lockToken)) await fs.promises.unlink(lockFile).catch(() => undefined);
  }
}

function canonicalOid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const oid = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(oid) ? oid : undefined;
}

async function requireIdentity(req: express.Request): Promise<EntraIdentity> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw new AuthFailure(401, "UNAUTHORIZED", "Authentication is required.");
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new AuthFailure(401, "UNAUTHORIZED", "Authentication is required.");
  try {
    return await authDependencies.verifyAccessToken(token);
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "INSUFFICIENT_SCOPE") {
      throw new AuthFailure(403, "INSUFFICIENT_SCOPE", "The access_as_user scope is required.");
    }
    throw new AuthFailure(401, "UNAUTHORIZED", "The access token is invalid.");
  }
}

async function findEmployee(identity: EntraIdentity, force = false) {
  const cached = employeeCache.get(identity.oid);
  if (!force && cached && cached.expiresAt > Date.now()) return cached;
  const found = await authDependencies.lookupEmployee(identity);
  if (!found) return undefined;
  const entry = { employee: found, expiresAt: Date.now() + employeeCacheTtlMs, syncedAt: new Date().toISOString() };
  if (employeeCacheTtlMs > 0) employeeCache.set(identity.oid, entry);
  return entry;
}

function qualification(employee: import("./server/auth.js").DirectoryEmployee | undefined): { allowed: boolean; reason: string | null; department: string | null } {
  if (!employee) return { allowed: false, reason: "NOT_IN_DIRECTORY", department: null };
  if (!employee.accountEnabled) return { allowed: false, reason: "ACCOUNT_DISABLED", department: employee.department?.trim() || employee.name.split("-", 1)[0].trim() || null };
  const department = employee.department?.trim() || employee.name.split("-", 1)[0].trim() || null;
  const allowedDepartments = authDependencies.allowedDepartments ?? [];
  if (allowedDepartments.length > 0 && (!department || !allowedDepartments.includes(department))) return { allowed: false, reason: "DEPARTMENT_NOT_ALLOWED", department };
  return { allowed: true, reason: null, department };
}

async function requirePlanner(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const identity = await requireIdentity(req);
    const entry = await findEmployee(identity);
    const access = qualification(entry?.employee);
    if (!access.allowed) throw new AuthFailure(403, access.reason!, "The signed-in user is not eligible for access.");
    if (appRole(identity) === "reader") {
      throw new AuthFailure(403, "ROLE_NOT_ALLOWED", "Planner or admin role is required.");
    }
    res.locals.identity = identity;
    next();
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
}

// ---------------- API Routes ----------------

app.get("/api/auth/me", async (req, res) => {
  try {
    const identity = await requireIdentity(req);
    const entry = await findEmployee(identity);
    const directory = qualification(entry?.employee);
    const role = appRole(identity);
    const allowed = directory.allowed && role !== "reader";
    res.json({
      authenticated: true,
      identity: { oid: identity.oid, email: identity.preferredUsername, name: identity.name },
      directory: {
        found: Boolean(entry),
        accountEnabled: entry?.employee.accountEnabled ?? false,
        department: directory.department,
        syncedAt: entry?.syncedAt ?? null
      },
      access: { allowed, reason: allowed ? null : directory.reason ?? "ROLE_NOT_ALLOWED" },
      app: { role }
    });
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
});

async function requireEligibleAdmin(req: express.Request): Promise<EntraIdentity> {
  const identity = await requireIdentity(req);
  const entry = await findEmployee(identity);
  const access = qualification(entry?.employee);
  if (!access.allowed || appRole(identity) !== "admin") throw new AuthFailure(403, "INSUFFICIENT_ROLE", "Admin role is required.");
  return identity;
}

app.get("/api/admin/directory-search", async (req, res) => {
  try {
    await requireEligibleAdmin(req);
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) return res.status(400).json({ code: "INVALID_REQUEST", message: "q must contain at least two characters." });
    res.json({ employees: await authDependencies.searchEmployees(query) });
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
});

app.get("/api/admin/planners", async (req, res) => {
  try {
    await requireEligibleAdmin(req);
    res.json({ planners: roleConfig.planners });
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
});

app.put("/api/admin/planners", async (req, res) => {
  try {
    await requireEligibleAdmin(req);
    const oid = canonicalOid(req.body?.oid);
    if (!oid) return res.status(400).json({ code: "INVALID_REQUEST", message: "oid must be a canonical UUID v4." });
    const next = await mutateRoleConfig(current => current.planners.includes(oid)
      ? current
      : { ...current, planners: [...current.planners, oid] });
    res.json({ planners: next.planners });
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
});

app.delete("/api/admin/planners/:oid", async (req, res) => {
  try {
    await requireEligibleAdmin(req);
    const oid = canonicalOid(req.params.oid);
    if (!oid) return res.status(400).json({ code: "INVALID_REQUEST", message: "oid must be a canonical UUID v4." });
    const next = await mutateRoleConfig(current => ({ ...current, planners: current.planners.filter(value => value !== oid) }));
    res.json({ planners: next.planners });
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
});

app.post("/api/directory/refresh", async (req, res) => {
  try {
    const identity = await requireIdentity(req);
    const previousRefresh = directoryRefreshes.get(identity.oid) ?? 0;
    if (Date.now() - previousRefresh < 60_000) throw new AuthFailure(429, "RATE_LIMITED", "Directory refresh is limited to once per minute.");
    directoryRefreshes.set(identity.oid, Date.now());
    if (!authDependencies.refreshDirectory) throw new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable.");
    const refresh = await authDependencies.refreshDirectory();
    employeeCache.delete(identity.oid);
    const entry = await findEmployee(identity, true);
    const directory = qualification(entry?.employee);
    res.json({ refreshed: true, syncedAt: refresh.syncedAt, recordCount: refresh.recordCount, me: { found: Boolean(entry), accountEnabled: entry?.employee.accountEnabled ?? false, department: directory.department } });
  } catch (error) {
    if (error instanceof AuthFailure) return sendAuthFailure(res, error);
    return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// PPT listing - Open to ALL employees without login
app.get("/api/ppts", (req, res) => {
  const { search, category, sort } = req.query as {
    search?: string;
    category?: string;
    sort?: string;
  };

  let list = getPPTs();

  if (category && category !== "全部") {
    list = list.filter((p) => p.category === category);
  }

  if (search && search.trim()) {
    const kw = search.trim().toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(kw));
  }

  const parseUploadTime = (dateStr?: string): number => {
    if (!dateStr) return 0;
    const time = Date.parse(dateStr.replace(" ", "T"));
    return isNaN(time) ? (new Date(dateStr).getTime() || 0) : time;
  };

  // Sort
  if (sort === "downloads") {
    list.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
  } else if (sort === "size") {
    list.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
  } else if (sort === "images") {
    list.sort((a, b) => (b.imageCount || 0) - (a.imageCount || 0));
  } else {
    // default: pinned first, then descending order of upload time
    list.sort((a, b) => {
      const aPinned = Boolean(a.isPinned);
      const bPinned = Boolean(b.isPinned);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return parseUploadTime(b.uploadDate) - parseUploadTime(a.uploadDate);
    });
  }

  res.json(list);
});

// Get single PPT details - Open to all employees
app.get("/api/ppts/:id", (req, res) => {
  const ppts = getPPTs();
  const ppt = ppts.find((p) => p.id === req.params.id);
  if (!ppt) {
    return res.status(404).json({ error: "找不到指定的PPT" });
  }
  res.json(ppt);
});

// Download PPT endpoint - Open to all employees
app.get("/api/ppts/:id/download", (req, res) => {
  const ppts = getPPTs();
  const ppt = ppts.find((p) => p.id === req.params.id);
  if (!ppt) {
    return res.status(404).send("未找到该PPT文件");
  }

  const filePath = path.join(PPTS_DIR, ppt.storedFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("服务器端文件不存在");
  }

  // Increment download count
  ppt.downloadCount = (ppt.downloadCount || 0) + 1;
  savePPTs(ppts);

  const safeFileName = encodeURIComponent(ppt.originalFileName || `${ppt.title}.pptx`);
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"; filename*=UTF-8''${safeFileName}`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Track download count manually if downloaded via direct link
app.post("/api/ppts/:id/download-count", (req, res) => {
  const ppts = getPPTs();
  const ppt = ppts.find((p) => p.id === req.params.id);
  if (!ppt) {
    return res.status(404).json({ error: "未找到该PPT" });
  }
  ppt.downloadCount = (ppt.downloadCount || 0) + 1;
  savePPTs(ppts);
  res.json({ success: true, downloadCount: ppt.downloadCount });
});

// System stats
app.get("/api/stats", (req, res) => {
  const ppts = getPPTs();
  const totalDownloads = ppts.reduce((acc, curr) => acc + (curr.downloadCount || 0), 0);
  const totalImages = ppts.reduce((acc, curr) => acc + (curr.imageCount || 0), 0);
  const totalSize = ppts.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
  
  const categoryCounts: Record<string, number> = {};
  ppts.forEach((p) => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  });

  res.json({
    totalPPTs: ppts.length,
    totalDownloads,
    totalImages,
    totalSize,
    categoryCounts
  });
});

// ---------------- Planner Protected Routes ----------------

// Upload new PPT (Planner only)
app.post("/api/ppts", requirePlanner, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "请选择要上传的PPT文件" });
    }

    const {
      title,
      category,
      description,
      version,
      targetDepartment,
      tags,
      isPinned
    } = req.body;

    const id = `ppt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const originalFileName = req.file.originalname;
    const storedFileName = req.file.filename;
    const filePath = req.file.path;
    const fileSize = req.file.size;

    // Extract full slide content and images if PPTX
    let contentInfo = { images: [] as string[], slideCount: 1, slides: [] as StoredPPTSlide[] };
    if (originalFileName.toLowerCase().endsWith(".pptx")) {
      contentInfo = await extractPptxContent(filePath, id);
    }

    // If no images extracted (e.g. ppt format or no media), generate standard placeholder preview
    if (contentInfo.images.length === 0) {
      const previewDir = path.join(PREVIEWS_DIR, id);
      if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
      const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <rect width="1280" height="720" fill="#0f172a"/>
        <rect x="60" y="60" width="1160" height="600" rx="20" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <text x="640" y="320" fill="#ffffff" font-family="system-ui, sans-serif" font-size="40" font-weight="bold" text-anchor="middle">${title || originalFileName}</text>
        <text x="640" y="380" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="22" text-anchor="middle">生产线平衡改善案例 · 包含完整PPT幻灯片与改善工序</text>
        <text x="640" y="440" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="18" text-anchor="middle">现场员工可点击上方下载按钮获取完整文件</text>
      </svg>`;
      const coverPath = path.join(previewDir, "cover.svg");
      fs.writeFileSync(coverPath, Buffer.from(coverSvg, "utf-8"));
      contentInfo.images.push(`/uploads/previews/${id}/cover.svg`);
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    let parsedTags: string[] = [];
    if (typeof tags === "string") {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = tags.split(/[,，\s]+/).filter(Boolean);
      }
    } else if (Array.isArray(tags)) {
      parsedTags = tags;
    }

    const newPPT: StoredPPT = {
      id,
      title: title?.trim() || originalFileName.replace(/\.[^/.]+$/, ""),
      originalFileName,
      storedFileName,
      fileSize,
      fileUrl: `/api/ppts/${id}/download`,
      category: category || "生产线平衡与节拍改善",
      version: version?.trim() || "v1.0",
      uploader: (res.locals.identity as EntraIdentity).name,
      uploadDate: dateStr,
      updateDate: dateStr,
      description: description?.trim() || "发布的生产线平衡改善案例PPT文档",
      slideCount: contentInfo.slideCount || 1,
      imageCount: contentInfo.images.length,
      images: contentInfo.images,
      slides: contentInfo.slides,
      downloadCount: 0,
      isPinned: isPinned === "true" || isPinned === true,
      targetDepartment: targetDepartment?.trim() || "车间现场全体员工",
      tags: parsedTags.length > 0 ? parsedTags : ["线平衡改善", "工时优化"]
    };

    const ppts = getPPTs();
    ppts.unshift(newPPT);
    savePPTs(ppts);

    res.json({
      success: true,
      message: `PPT《${newPPT.title}》上传成功，已提取 ${newPPT.imageCount} 张图片物料！`,
      ppt: newPPT
    });
  } catch (err: any) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: `上传失败: ${err.message || "服务器内部错误"}` });
  }
});

// Update PPT details (Planner only)
app.put("/api/ppts/:id", requirePlanner, (req, res) => {
  const ppts = getPPTs();
  const index = ppts.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "找不到指定的PPT" });
  }

  const { title, category, description, version, targetDepartment, tags, isPinned } = req.body;
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const current = ppts[index];
  if (title !== undefined) current.title = title.trim();
  if (category !== undefined) current.category = category;
  if (description !== undefined) current.description = description.trim();
  if (version !== undefined) current.version = version.trim();
  if (targetDepartment !== undefined) current.targetDepartment = targetDepartment.trim();
  if (tags !== undefined) {
    current.tags = Array.isArray(tags) ? tags : String(tags).split(/[,，\s]+/).filter(Boolean);
  }
  if (isPinned !== undefined) current.isPinned = Boolean(isPinned);
  current.updateDate = dateStr;

  ppts[index] = current;
  savePPTs(ppts);

  res.json({ success: true, message: "PPT信息更新成功", ppt: current });
});

// Delete PPT (Planner only)
app.delete("/api/ppts/:id", requirePlanner, (req, res) => {
  const ppts = getPPTs();
  const index = ppts.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "找不到指定的PPT" });
  }

  const [removed] = ppts.splice(index, 1);
  savePPTs(ppts);

  // Clean up files in background
  try {
    const pptFile = path.join(PPTS_DIR, removed.storedFileName);
    if (fs.existsSync(pptFile)) fs.unlinkSync(pptFile);

    const previewFolder = path.join(PREVIEWS_DIR, removed.id);
    if (fs.existsSync(previewFolder)) {
      fs.rmSync(previewFolder, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Error cleaning up deleted PPT files:", err);
  }

  res.json({ success: true, message: `PPT《${removed.title}》已成功删除` });
});

  appLifecycles.set(app, { generateSeedDataIfEmpty, ensureSlidesParsed });
  return app;
}

// ---------------- Production & Vite Dev Middleware ----------------

export async function startServer() {
  const app = createApp({
    dataDir: path.join(process.cwd(), "data"),
    uploadsDir: path.join(process.cwd(), "uploads")
  });
  const lifecycle = appLifecycles.get(app);
  if (!lifecycle) throw new Error("Server lifecycle was not initialized");
  await lifecycle.generateSeedDataIfEmpty();
  await lifecycle.ensureSlidesParsed();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:3000");
  });
}

const isDirectServerExecution = ["server.ts", "server.cjs"].includes(path.basename(process.argv[1] ?? ""));
if (isDirectServerExecution) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}
