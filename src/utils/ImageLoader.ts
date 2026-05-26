/**
 * Загрузчик изображений
 */
export class ImageLoader {
  static async loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  static getImageData(image: HTMLImageElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}
