import os

import cv2
import numpy as np

INPUT_PATH = r"C:\Users\amero\source\web-projects\hexagonal_cells\src\image.png"
OUTPUT_PATH = r"C:\Users\amero\source\web-projects\hexagonal_cells\src\mask.png"

# 1) Проверяем наличие исходной карты
if not os.path.isfile(INPUT_PATH):
    raise FileNotFoundError(f"Input file not found: {INPUT_PATH}")

img = cv2.imread(INPUT_PATH, cv2.IMREAD_COLOR)
if img is None:
    raise FileNotFoundError(f"Failed to read image: {INPUT_PATH}")

# 2) Переводим в HSV для устойчивой сегментации по цвету
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# 3) Диапазоны для океана (два окна для светлого и тёмного синего)
water_lower1 = np.array([90, 40, 60], dtype=np.uint8)
water_upper1 = np.array([125, 255, 255], dtype=np.uint8)
water_lower2 = np.array([100, 15, 20], dtype=np.uint8)
water_upper2 = np.array([140, 255, 200], dtype=np.uint8)

water_mask1 = cv2.inRange(hsv, water_lower1, water_upper1)
water_mask2 = cv2.inRange(hsv, water_lower2, water_upper2)
water_mask = cv2.bitwise_or(water_mask1, water_mask2)

# 4) Суша = инверсия маски воды
land_mask = cv2.bitwise_not(water_mask)

# 5) Чистим маску: убираем шум и зашиваем мелкие дырки
kernel = np.ones((3, 3), np.uint8)
land_mask = cv2.morphologyEx(land_mask, cv2.MORPH_OPEN, kernel, iterations=1)
land_mask = cv2.morphologyEx(land_mask, cv2.MORPH_CLOSE, kernel, iterations=2)

# 6) Сохраняем бинарную маску (255 = суша, 0 = вода)
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
cv2.imwrite(OUTPUT_PATH, land_mask)

# 7) Статистика
total_pixels = land_mask.size
land_pixels = int(np.count_nonzero(land_mask))
water_pixels = total_pixels - land_pixels
land_pct = 100.0 * land_pixels / total_pixels
water_pct = 100.0 * water_pixels / total_pixels

print(f"Saved land mask: {OUTPUT_PATH}")
print(f"Land: {land_pct:.2f}% | Water: {water_pct:.2f}%")
