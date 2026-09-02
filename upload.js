// ===== 업로드 처리 모듈 =====
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "uploads");

// ===== 업로드 폴더 준비 =====
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ===== 저장 위치 및 파일명 설정 =====
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, UPLOAD_DIR);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    callback(null, filename);
  }
});

// ===== 이미지 형식 및 최대 용량 검사 =====
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      callback(null, true);
      return;
    }

    callback(new Error("이미지 파일만 업로드할 수 있습니다."));
  }
});

// ===== 업로드 설정 공개 =====
module.exports = {
  UPLOAD_DIR,
  upload
};
