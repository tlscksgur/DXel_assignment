const fs = require('fs');

function convertImageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  return base64Image;
}

module.exports = convertImageToBase64;