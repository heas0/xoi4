/**
 * Main Entry Point
 * 
 * Логика инициализации приложения по порядку:
 * 1. Импорт стилей и зависимостей
 * 2. Загрузка ресурсов (изображения, маски)
 * 3. Подготовка Canvas
 * 4. Инициализация и запуск приложения
 */

import './style.css';
import { App } from './app';
import backgroundUrl from './image.jpg?url';
import maskUrl from './mask.png?url';

// === 1. Вспомогательные функции загрузки ===

/** Загрузка изображения как HTMLImageElement */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/** Загрузка данных изображения (ImageData) для анализа пикселей */
async function loadImageData(url: string): Promise<ImageData> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create temporary 2D context');

  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

// === 2. Основная функция инициализации ===

async function bootstrap() {
  try {
    console.log('🚀 Starting application initialization...');

    // Шаг 1: Получаем ссылку на Canvas
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas element (#canvas) not found in DOM');

    // Шаг 2: Загружаем ресурсы параллельно
    console.log('📦 Loading assets...');
    const [mapImage, maskData] = await Promise.all([
      loadImage(backgroundUrl),
      loadImageData(maskUrl)
    ]);

    // Шаг 3: Проверка целостности данных
    if (mapImage.width !== maskData.width || mapImage.height !== maskData.height) {
      console.warn('⚠️ Warning: Map and Mask dimensions do not match!');
      console.warn(`Map: ${mapImage.width}x${mapImage.height}, Mask: ${maskData.width}x${maskData.height}`);
    }

    console.log(`✅ Assets loaded. Map size: ${mapImage.width}x${mapImage.height}`);

    // Шаг 4: Создание экземпляра приложения
    const app = new App({
      canvas,
      mapImage,
      mapImageData: maskData,
      hexSize: 26 // Размер гексагона в пикселях (в среднем ~7 чанков по 16x16 пикселей)
    });

    // Шаг 5: Запуск логики приложения
    console.log('⚙️ Initializing app logic...');
    await app.initialize();

    // Сохраняем в window для отладки
    (window as any).app = app;
    console.log('✨ Application started successfully!');

  } catch (error) {
    console.error('❌ Fatal Error during initialization:', error);
    document.body.innerHTML = `
      <div style="color: #ff6b6b; padding: 20px; font-family: sans-serif;">
        <h1>Application Error</h1>
        <p>Failed to start the application.</p>
        <pre style="background: #2a2a2a; padding: 10px; border-radius: 4px;">${error}</pre>
      </div>
    `;
  }
}

// === 3. Запуск ===
bootstrap();
