/**
 * Card detection from screenshots or camera frames.
 * Phase 1: Returns null (manual entry only).
 * Phase 2: Integrate TensorFlow.js model trained on labeled card images.
 */
import type { Card } from "../types";

export interface DetectionResult {
  playerCards: Card[];
  bankerCards: Card[];
  confidence: number;
}

export async function detectFromImageData(
  _imageData: ImageData
): Promise<DetectionResult | null> {
  // TODO: load TF.js model and run inference
  // const model = await tf.loadLayersModel(chrome.runtime.getURL("models/card_detector/model.json"));
  // const tensor = tf.browser.fromPixels(imageData).expandDims(0).toFloat().div(255);
  // const predictions = model.predict(tensor) as tf.Tensor;
  return null;
}

export async function captureCurrentTab(): Promise<ImageData | null> {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      if (!dataUrl) { resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };
      img.src = dataUrl;
    });
  });
}
