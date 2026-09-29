// ===== 업로드 처리 모듈 =====
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "uploads");
const imageTypes = {
  "image/jpeg": { extensions: [".jpg", ".jpeg"], extension: ".jpg" },
  "image/png": { extensions: [".png"], extension: ".png" },
  "image/webp": { extensions: [".webp"], extension: ".webp" },
  "image/gif": { extensions: [".gif"], extension: ".gif" }
};

function matchesImageBytes(bytes, mimeType) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      && bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]));
  }
  if (mimeType === "image/png") {
    return bytes.length >= 20
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && bytes.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WEBP"
      && bytes.readUInt32LE(4) + 8 === bytes.length;
  }
  if (mimeType === "image/gif") {
    return bytes.length >= 7 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
      && bytes.at(-1) === 0x3b;
  }
  return false;
}

// ===== 업로드 폴더 준비 =====
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ===== 저장 위치 및 파일명 설정 =====
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, UPLOAD_DIR);
  },
  filename: (req, file, callback) => {
    const extension = imageTypes[file.mimetype].extension;
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
    callback(null, filename);
  }
});

// ===== 이미지 형식 및 최대 용량 검사 =====
const multerUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const imageType = imageTypes[file.mimetype];
    if (imageType && imageType.extensions.includes(path.extname(file.originalname).toLowerCase())) {
      callback(null, true);
      return;
    }

    callback(new Error("이미지 파일만 업로드할 수 있습니다."));
  }
});

// Multer의 fileFilter에는 파일 본문이 없으므로 저장 직후 실제 바이트를 검사한다.
const upload = {
  single(fieldName) {
    const middleware = multerUpload.single(fieldName);
    return (req, res, next) => middleware(req, res, async (error) => {
      if (error || !req.file) return next(error);
      try {
        const bytes = await fs.promises.readFile(req.file.path);
        if (!matchesImageBytes(bytes, req.file.mimetype)) {
          throw new Error("올바른 이미지 파일만 업로드할 수 있습니다.");
        }
        next();
      } catch (validationError) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") return next(cleanupError);
        }
        req.file = undefined;
        next(validationError);
      }
    });
  }
};

// ===== 업로드 설정 공개 =====
module.exports = {
  UPLOAD_DIR,
  upload
};
