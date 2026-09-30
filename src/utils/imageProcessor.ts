export interface ProcessedImage {
  base64: string;
  dataUrl: string;
  mimeType: string;
}

const SUPPORTED_FALLBACK_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

export async function processImageFile(file: File): Promise<ProcessedImage> {
  const originalDataUrl = await readFileAsDataUrl(file);

  try {
    const resized = await resizeImageViaCanvas(originalDataUrl, 1400, 0.85);
    return resized;
  } catch (_canvasErr) {
    // If the canvas re-encode fails, fall back to the original ONLY if its type is jpeg/png/gif/webp
    const fileType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    const isSupported =
      SUPPORTED_FALLBACK_MIMES.includes(fileType) ||
      /\.(jpe?g|png|gif|webp)$/i.test(fileName);

    if (isSupported) {
      const commaIdx = originalDataUrl.indexOf(',');
      const base64 = commaIdx !== -1 ? originalDataUrl.slice(commaIdx + 1) : originalDataUrl;
      const mimeType = fileType || 'image/jpeg';
      return {
        base64,
        dataUrl: originalDataUrl,
        mimeType,
      };
    }

    throw new Error("That format isn't supported — screenshot the photo and upload the screenshot.");
  }
}

export async function processImageUrl(url: string): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const result = resizeImageElementViaCanvas(img, 1400, 0.85);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error("Could not load the sample room image. Please try uploading a photo."));
    };
    img.src = url;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image file data."));
      }
    };
    reader.onerror = () => reject(new Error("File reading error."));
    reader.readAsDataURL(file);
  });
}

function resizeImageViaCanvas(dataUrl: string, maxSide = 1400, quality = 0.85): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const result = resizeImageElementViaCanvas(img, maxSide, quality);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to decode image in canvas."));
    img.src = dataUrl;
  });
}

function resizeImageElementViaCanvas(
  img: HTMLImageElement,
  maxSide = 1400,
  quality = 0.85
): ProcessedImage {
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width === 0 || height === 0) {
    throw new Error("Invalid image dimensions.");
  }

  if (width > maxSide || height > maxSide) {
    if (width > height) {
      height = Math.round((height * maxSide) / width);
      width = maxSide;
    } else {
      width = Math.round((width * maxSide) / height);
      height = maxSide;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error("Unable to create canvas rendering context.");
  }

  // White background in case of alpha transparency
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error("Canvas JPEG encoding failed.");
  }

  const base64 = dataUrl.slice(commaIdx + 1);
  return {
    base64,
    dataUrl,
    mimeType: 'image/jpeg',
  };
}
