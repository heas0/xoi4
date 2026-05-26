import os
import cv2
import numpy as np

# Paths
earth_dir = r"C:\Users\amero\projects\hexagonal_cells\src\earth"
tif_w = os.path.join(earth_dir, "NE2_50M_SR_W", "NE2_50M_SR_W.tif")
tif_no_w = os.path.join(earth_dir, "NE2_50M_SR", "NE2_50M_SR.tif")

image_out = r"C:\Users\amero\projects\hexagonal_cells\src\image.png"
mask_out = r"C:\Users\amero\projects\hexagonal_cells\src\mask.png"

def process():
    print("Reading image with water (for UI)...")
    img_w = cv2.imread(tif_w, cv2.IMREAD_COLOR)
    print(f"Loaded image W: {img_w.shape}")
    print("Saving to src/image.png...")
    cv2.imwrite(image_out, img_w)
    print("image.png saved.")
    
    print("Reading image without water (for mask)...")
    img_no_w = cv2.imread(tif_no_w, cv2.IMREAD_COLOR)
    print(f"Loaded image without W: {img_no_w.shape}")
    
    print("Calculating mask...")
    # Water in NE2_50M_SR is exactly [251, 251, 251] in BGR
    water_color = np.array([251, 251, 251], dtype=np.uint8)
    water_mask = cv2.inRange(img_no_w, water_color, water_color)

    # Invert to get land mask
    land_mask = cv2.bitwise_not(water_mask)

    # Clean mask just in case
    kernel = np.ones((3, 3), np.uint8)
    land_mask = cv2.morphologyEx(land_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    land_mask = cv2.morphologyEx(land_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    print("Saving to src/mask.png...")
    cv2.imwrite(mask_out, land_mask)
    print("mask.png saved.")
    
    # Stats
    total_pixels = land_mask.size
    land_pixels = int(np.count_nonzero(land_mask))
    water_pixels = total_pixels - land_pixels
    print(f"Land: {100.0 * land_pixels / total_pixels:.2f}% | Water: {100.0 * water_pixels / total_pixels:.2f}%")
    
if __name__ == "__main__":
    process()
