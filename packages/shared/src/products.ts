// POD product types — must match PODPreset.productType values (ARCHITECTURE.md "Data model").
export const PRODUCT_TYPES = {
  tshirt_front: 'T-Shirt (front)',
  tshirt_back: 'T-Shirt (back)',
  tshirt_pocket: 'T-Shirt (pocket)',
  hoodie: 'Hoodie',
  sweatshirt: 'Sweatshirt',
  mug: 'Mug',
  poster: 'Poster',
  sticker: 'Sticker',
  tote_bag: 'Tote Bag',
  phone_case: 'Phone Case',
  wall_art: 'Wall Art',
  custom: 'Custom',
} as const;

export type ProductType = keyof typeof PRODUCT_TYPES;

export function isProductType(value: unknown): value is ProductType {
  return typeof value === 'string' && value in PRODUCT_TYPES;
}
